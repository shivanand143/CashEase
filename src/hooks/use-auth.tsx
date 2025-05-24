
// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import {
    onAuthStateChanged,
    User,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    signInWithPopup,
    // updateProfile as updateFirebaseAuthProfile, // Renamed to avoid conflict
    // reauthenticateWithCredential, // Renamed
    // EmailAuthProvider, // Renamed
    // updateEmail as updateFirebaseAuthEmail, // Renamed
    // updatePassword as updateFirebaseAuthPassword, // Renamed
    // deleteUser as firebaseDeleteUser, // Renamed
    // sendPasswordResetEmail as firebaseSendPasswordResetEmail, // Renamed
    // signInWithEmailAndPassword, // Renamed
    // createUserWithEmailAndPassword, // Renamed
    getRedirectResult
} from 'firebase/auth';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    Timestamp,
    collection,
    query,
    where,
    limit,
    getDocs,
    runTransaction,
    increment,
    writeBatch,
    FirestoreError
} from 'firebase/firestore';
import { auth as firebaseAuthService, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails, PayoutMethod } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { safeToDate } from '@/lib/utils';

const AUTH_HOOK_LOG_PREFIX = "AUTH_HOOK:";

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authLoading: boolean; // Specifically for Firebase Auth state resolution
  profileLoading: boolean; // Specifically for Firestore profile fetching/creation
  authError: string | null;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  createOrUpdateUserProfile: (authUser: User, referredByCode?: string | null) => Promise<UserProfile | null>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  updateUserProfileData: (uid: string, data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [profileLoading, setProfileLoading] = React.useState(false); // Initially false until authUser is known
  const [authError, setAuthError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParamsHook = useSearchParams();

  const overallLoading = authLoading || profileLoading;

  const fetchUserProfile = React.useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile called for UID: ${uid}`);
    setAuthError(null); // Clear previous auth errors before attempting fetch
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "DB error during profile fetch.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for fetchUserProfile: ${errorMsg}`);
      setAuthError(errorMsg);
      return null;
    }

    const userDocRef = doc(db, 'users', uid);
    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const profileData = docSnap.data();
        const profile: UserProfile = {
          uid: docSnap.id,
          email: profileData.email ?? null,
          displayName: profileData.displayName ?? null,
          photoURL: profileData.photoURL ?? null,
          role: profileData.role ?? 'user',
          cashbackBalance: profileData.cashbackBalance ?? 0,
          pendingCashback: profileData.pendingCashback ?? 0,
          lifetimeCashback: profileData.lifetimeCashback ?? 0,
          referralCode: profileData.referralCode ?? null,
          referralCount: profileData.referralCount ?? 0,
          referralBonusEarned: profileData.referralBonusEarned ?? 0,
          referredBy: profileData.referredBy ?? null,
          isDisabled: profileData.isDisabled ?? false,
          createdAt: safeToDate(profileData.createdAt as Timestamp | undefined) || new Date(0),
          updatedAt: safeToDate(profileData.updatedAt as Timestamp | undefined) || new Date(0),
          lastPayoutRequestAt: safeToDate(profileData.lastPayoutRequestAt as Timestamp | undefined),
          payoutDetails: profileData.payoutDetails ?? null,
        };
        console.log(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile: Profile fetched successfully for ${uid}. Name: "${profile.displayName}"`);
        return profile;
      } else {
        console.warn(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile: No profile document found for UID: ${uid}. This might be a new user.`);
        return null;
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile: Error fetching profile for ${uid}:`, err);
      let detailedErrorMsg = "Failed to fetch user profile.";
      if (err instanceof FirebaseError) {
        detailedErrorMsg += ` Firebase Error: ${err.code} - ${err.message}`;
      } else if (err instanceof Error) {
        detailedErrorMsg += ` Error: ${err.message}`;
      }
      setAuthError(detailedErrorMsg);
      return null;
    }
  }, []);

  const createOrUpdateUserProfile = React.useCallback(async (
    authUser: User,
    referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
    const operationId = uuidv4().substring(0, 6);
    console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] createOrUpdateUserProfile started for UID: ${authUser.uid}. AuthUser DisplayName: "${authUser.displayName}", Email: "${authUser.email}". RefParam: "${referredByCodeParam}"`);
    setAuthError(null); // Clear previous errors

    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "DB error during profile setup.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Firestore not initialized: ${errorMsg}`);
      setAuthError(errorMsg);
      return null;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    let finalReferralCodeToUse = referredByCodeParam;

    if (!finalReferralCodeToUse && typeof window !== 'undefined') {
      finalReferralCodeToUse = sessionStorage.getItem('pendingReferralCode');
      if (finalReferralCodeToUse) {
        console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Retrieved pendingReferralCode from sessionStorage: "${finalReferralCodeToUse}"`);
      }
    }
     if (!finalReferralCodeToUse && searchParamsHook) {
        const urlRef = searchParamsHook.get('ref')?.trim();
        if (urlRef) {
            finalReferralCodeToUse = urlRef;
            console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Retrieved referral code from URL searchParams: "${finalReferralCodeToUse}"`);
        }
    }

    let referrerIdToUse: string | null = null;
    if (finalReferralCodeToUse) {
        console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] Searching for referrer with code: "${finalReferralCodeToUse}"`);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('referralCode', '==', finalReferralCodeToUse), limit(1));
        try {
            const referrerSnap = await getDocs(q);
            if (!referrerSnap.empty) {
                const referrerDoc = referrerSnap.docs[0];
                if (referrerDoc.id !== authUser.uid) {
                    referrerIdToUse = referrerDoc.id;
                    console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] Referrer ID found: ${referrerIdToUse}`);
                } else {
                    console.warn(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] User ${authUser.uid} attempted self-referral with code "${finalReferralCodeToUse}".`);
                }
            } else {
                console.warn(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] Referrer code "${finalReferralCodeToUse}" not found.`);
            }
        } catch (queryError) {
            console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] Error querying referrer:`, queryError);
        }
    }

    try {
        console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Starting Firestore transaction for user: ${authUser.uid}`);
        const profileData = await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(userDocRef);
            let isNewUserCreation = false;
            let profileToSet: UserProfile;

            if (docSnap.exists()) {
                const existingData = docSnap.data() as UserProfile;
                console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Updating existing user: ${authUser.uid}. Auth DName: "${authUser.displayName}", Existing DName: "${existingData.displayName}"`);
                const updatePayload: Partial<UserProfile> = {
                    displayName: authUser.displayName || existingData.displayName || "MagicSaver User",
                    photoURL: authUser.photoURL || existingData.photoURL || null,
                    email: authUser.email || existingData.email, // Ensure email is updated
                    updatedAt: serverTimestamp(),
                };

                if (existingData.referredBy === null && referrerIdToUse && referrerIdToUse !== authUser.uid) {
                    updatePayload.referredBy = referrerIdToUse;
                     console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Setting referredBy for existing user ${authUser.uid} to ${referrerIdToUse}.`);
                }

                if (process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID === authUser.uid && existingData.role !== 'admin') {
                    updatePayload.role = 'admin';
                     console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Promoting initial admin: ${authUser.uid}.`);
                }
                transaction.update(userDocRef, updatePayload);
                // Merge existing data with updates for immediate use, then convert timestamps
                const updatedRawProfile = { ...existingData, ...updatePayload, uid: authUser.uid };
                profileToSet = {
                    ...updatedRawProfile,
                    createdAt: safeToDate(updatedRawProfile.createdAt as Timestamp | Date) || new Date(),
                    updatedAt: new Date(), // Tentative, serverTimestamp will overwrite
                    lastPayoutRequestAt: safeToDate(updatedRawProfile.lastPayoutRequestAt as Timestamp | Date),
                } as UserProfile;

            } else {
                isNewUserCreation = true;
                const generatedReferralCode = uuidv4().substring(0, 8).toUpperCase();
                console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Creating NEW user: ${authUser.uid}. Generated Ref Code: ${generatedReferralCode}. Referred by: ${referrerIdToUse}`);
                profileToSet = {
                    uid: authUser.uid,
                    email: authUser.email ?? null,
                    displayName: authUser.displayName || "MagicSaver User",
                    photoURL: authUser.photoURL ?? null,
                    role: process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID === authUser.uid ? 'admin' : 'user',
                    cashbackBalance: 0, pendingCashback: 0, lifetimeCashback: 0,
                    referralCode: generatedReferralCode,
                    referralCount: 0, referralBonusEarned: 0,
                    referredBy: referrerIdToUse && referrerIdToUse !== authUser.uid ? referrerIdToUse : null,
                    isDisabled: false,
                    createdAt: serverTimestamp() as Timestamp,
                    updatedAt: serverTimestamp() as Timestamp,
                    lastPayoutRequestAt: null, payoutDetails: null,
                };
                transaction.set(userDocRef, profileToSet);
            }

            if (isNewUserCreation && referrerIdToUse) {
                console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] New user ${authUser.uid} was referred by ${referrerIdToUse}. Attempting to update referrer.`);
                const referrerDocRef = doc(db, 'users', referrerIdToUse);
                const referrerSnap = await transaction.get(referrerDocRef); // Read referrer within the same transaction
                if (referrerSnap.exists()) {
                    const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");
                    transaction.update(referrerDocRef, {
                        referralCount: increment(1),
                        referralBonusEarned: increment(referralBonusAmount),
                        updatedAt: serverTimestamp(),
                    });
                    console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Updated referrer ${referrerIdToUse} count by 1 and bonus by ${referralBonusAmount}.`);
                } else {
                    console.warn(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Referrer ${referrerIdToUse} document not found during transaction. Cannot update referral stats.`);
                }
            }
            return profileToSet;
        });

        if (profileData) {
             // Convert Firestore Timestamps to JS Dates for client-side state if they are Timestamps
            const finalProfile = { ...profileData };
            if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
            if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
            if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
            else finalProfile.lastPayoutRequestAt = null;

            console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Profile transaction successful for ${authUser.uid}. Name: "${finalProfile.displayName}", Role: "${finalProfile.role}"`);
            if (finalReferralCodeToUse && typeof window !== 'undefined') {
                sessionStorage.removeItem('pendingReferralCode');
                console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Cleared pendingReferralCode from sessionStorage.`);
            }
            return finalProfile as UserProfile;
        } else {
             console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Firestore transaction returned no profile data for ${authUser.uid}. This should not happen.`);
            return null;
        }

    } catch (err) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Error in createOrUpdateUserProfile transaction for ${authUser.uid}:`, err);
        let detailedErrorMsg = "Failed to save profile during transaction.";
        if (err instanceof FirebaseError) {
            detailedErrorMsg += ` Firebase Error: ${err.code} - ${err.message}`;
        } else if (err instanceof Error) {
            detailedErrorMsg += ` Error: ${err.message}`;
        }
        setAuthError(detailedErrorMsg);
        return null;
    }
  }, [searchParamsHook]);

  const handleUserSession = React.useCallback(async (currentAuthUser: User | null, fromRedirect: boolean = false) => {
    let effectIsActive = true; // To prevent state updates if component unmounts during async ops
    console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Called for user:`, currentAuthUser?.uid || 'null', `From redirect: ${fromRedirect}`);

    if (currentAuthUser) {
        if (effectIsActive) setProfileLoading(true);
        console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: User ${currentAuthUser.uid} present. Attempting to fetch/create profile...`);

        let profile = await fetchUserProfile(currentAuthUser.uid);

        if (!profile && effectIsActive) {
            console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: No profile found for ${currentAuthUser.uid} after initial fetch. Attempting to create/update.`);
            const referralCodeFromStorage = typeof window !== 'undefined' ? sessionStorage.getItem('pendingReferralCode') : null;
             console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Referral code from storage for new profile attempt: "${referralCodeFromStorage}"`);
            profile = await createOrUpdateUserProfile(currentAuthUser, referralCodeFromStorage);
        }
        
        if (effectIsActive) {
            setUserProfile(profile);
            setProfileLoading(false);
            if (profile) {
                console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Profile processing complete for ${currentAuthUser.uid}. Profile set. Name: "${profile.displayName}", Role: "${profile.role}"`);
                if (fromRedirect) { // Only toast/redirect if this was called from getRedirectResult
                    toast({ title: 'Sign In Successful', description: `Welcome, ${profile.displayName || currentAuthUser.email}!` });
                    const redirectUrlPath = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
                    console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Redirecting to "${redirectUrlPath}" after Google Sign-In.`);
                    router.push(redirectUrlPath);
                    sessionStorage.removeItem('loginRedirectUrl');
                }
            } else {
                console.error(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Profile is null after fetch/create attempt for user ${currentAuthUser.uid}. AuthError: ${authError}`);
                // authError should have been set by fetchUserProfile or createOrUpdateUserProfile
            }
        }
    } else {
        console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: No user. Resetting profile and profileLoading.`);
        if (effectIsActive) {
            setUserProfile(null);
            setProfileLoading(false);
        }
    }
    return () => { effectIsActive = false; };
  }, [fetchUserProfile, createOrUpdateUserProfile, toast, router, authError]); // Added authError

  React.useEffect(() => {
    let isEffectActive = true;
    console.log(`${AUTH_HOOK_LOG_PREFIX} Main auth effect triggered. Initial authLoading state: ${authLoading}`);
    setAuthLoading(true); // Always start by setting auth loading true for this cycle
    setAuthError(null);   // Clear previous errors on new auth cycle

    if (firebaseInitializationError) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firebase not initialized:`, firebaseInitializationError);
      if (isEffectActive) {
        setAuthError(firebaseInitializationError);
        setUser(null); setUserProfile(null); setAuthLoading(false); setProfileLoading(false);
      }
      return;
    }
    if (!firebaseAuthService) {
      const errMsg = "Firebase Auth service not available.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} ${errMsg}`);
      if (isEffectActive) {
        setAuthError(errMsg);
        setUser(null); setUserProfile(null); setAuthLoading(false); setProfileLoading(false);
      }
      return;
    }

    // Attempt to process redirect result first
    console.log(`${AUTH_HOOK_LOG_PREFIX} Attempting to get redirect result...`);
    getRedirectResult(firebaseAuthService)
      .then(async (result) => {
        if (!isEffectActive) {
            console.log(`${AUTH_HOOK_LOG_PREFIX} getRedirectResult: Effect no longer active, aborting further processing.`);
            return;
        }
        if (result && result.user) {
          const authUserFromRedirect = result.user;
          console.log(`${AUTH_HOOK_LOG_PREFIX} getRedirectResult: User ${authUserFromRedirect.uid} detected from redirect. Setting authUser state.`);
          setUser(authUserFromRedirect); // Set Firebase user state
          // Let onAuthStateChanged handle profile processing to avoid race conditions
          // It will receive this authUserFromRedirect.
          // We've set the user, onAuthStateChanged should fire and then handleUserSession
        } else {
          console.log(`${AUTH_HOOK_LOG_PREFIX} getRedirectResult: No user from redirect result.`);
          // If no user from redirect, onAuthStateChanged will handle session restoration or no user.
        }
      })
      .catch(error => {
        if (isEffectActive) {
          console.error(`${AUTH_HOOK_LOG_PREFIX} Error from getRedirectResult:`, error);
          // Do not set authError here directly from getRedirectResult if it's a common one like "no-redirect-operation"
          // Let onAuthStateChanged be the primary source of auth state.
          // Only set authError for critical getRedirectResult failures.
          if (error.code !== 'auth/no-redirect-operation') {
            setAuthError(`Google Sign-In (redirect result) error: ${error.message}`);
          }
        }
      })
      .finally(() => {
        if (isEffectActive) {
          console.log(`${AUTH_HOOK_LOG_PREFIX} getRedirectResult processing finished. Now relying on onAuthStateChanged.`);
          // Defer setting authLoading to false until onAuthStateChanged confirms the final state
        }
      });

    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (currentAuthUser) => {
      if (!isEffectActive) {
        console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: Effect no longer active, aborting state update for user:`, currentAuthUser?.uid || 'null');
        return;
      }
      console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: Event received. AuthUser:`, currentAuthUser ? currentAuthUser.uid : 'null');
      
      setUser(currentAuthUser); // Update Firebase user state immediately

      if (currentAuthUser) {
        // Call handleUserSession to process profile for the current authenticated user
        // Pass false for fromRedirect, as this is the main auth state listener
        await handleUserSession(currentAuthUser, false);
      } else {
        // No authenticated user, clear profile state
        console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: No authUser. Resetting user profile and profileLoading.`);
        setUserProfile(null);
        setProfileLoading(false);
      }
      
      // This is the definitive point where Firebase auth state has resolved
      if (isEffectActive) {
        setAuthLoading(false);
        console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: Firebase auth state fully resolved. authLoading: false.`);
      }
    }, (error) => {
      if (isEffectActive) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} Error in onAuthStateChanged listener:`, error);
        setAuthError("Firebase auth listener error: " + error.message);
        setUser(null); setUserProfile(null); setAuthLoading(false); setProfileLoading(false);
      }
    });

    return () => {
      isEffectActive = false;
      unsubscribe();
      console.log(`${AUTH_HOOK_LOG_PREFIX} Main auth effect cleanup. Unsubscribed from onAuthStateChanged.`);
    };
  }, [handleUserSession]); // Added handleUserSession as a dependency because it's used in onAuthStateChanged

  const signOut = async () => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} signOut called.`);
    if (!firebaseAuthService) {
      const msg = "Auth service not available for sign out.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} ${msg}`);
      setAuthError(msg);
      toast({ variant: "destructive", title: "Sign Out Failed", description: msg });
      return;
    }
    setAuthLoading(true); // Indicate transition
    setProfileLoading(true); // Profile will also clear
    try {
      await firebaseSignOut(firebaseAuthService);
      // onAuthStateChanged will handle clearing user, userProfile and setting loading states to false.
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push('/'); // Redirect to home after sign out
    } catch (error) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error signing out:`, error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setAuthLoading(false); // Reset loading on error if onAuthStateChanged doesn't fire quickly
      setProfileLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';
    console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle (Popup) initiated from domain: ${currentDomain}`);

    if (firebaseInitializationError || !firebaseAuthService) {
      const errorMsg = firebaseInitializationError || "Authentication service not available for Google Sign-In.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Google Sign-In pre-check failed: ${errorMsg}`);
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: "Auth Service Error", description: errorMsg, duration: 7000 });
      return;
    }
    
    setAuthLoading(true); 
    setProfileLoading(true);
    setAuthError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // Store referral code from URL into session storage before redirect
    const urlReferralCode = searchParamsHook?.get('ref')?.trim() || null;
    if (urlReferralCode && typeof window !== 'undefined') {
        sessionStorage.setItem('pendingReferralCode', urlReferralCode);
        console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle: Stored pendingReferralCode to sessionStorage: "${urlReferralCode}"`);
    }

    // Store intended redirect URL
    if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        const targetRedirect = (currentPath.startsWith('/login') || currentPath.startsWith('/signup') || currentPath === '/') 
            ? '/dashboard' 
            : currentPath;
        sessionStorage.setItem('loginRedirectUrl', targetRedirect);
        console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle: Stored loginRedirectUrl: "${targetRedirect}"`);
    }
    
    console.log(`${AUTH_HOOK_LOG_PREFIX} Attempting signInWithPopup...`);
    try {
      const result = await signInWithPopup(firebaseAuthService, provider);
      console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithPopup successful. User UID: ${result.user?.uid}`);
      // onAuthStateChanged will now handle the user and profile processing,
      // including redirection if handleUserSession runs for this new user.
      // The toast for successful sign-in will be handled within handleUserSession if profile is fetched/created.
    } catch (err: any) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} signInWithPopup FAILED:`, err);
      let errorMessage = "An unexpected error occurred during Google Sign-In.";
      let toastTitle = 'Google Sign-In Failed';

      if (err instanceof FirebaseError) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} FirebaseError code: ${err.code}, message: ${err.message}`);
        switch (err.code) {
          case 'auth/popup-closed-by-user':
          case 'auth/cancelled-popup-request':
            errorMessage = "Sign-in popup was closed before completion. If this was unintentional, please ensure popups are allowed and no extensions are interfering. Also check third-party cookie settings.";
            toastTitle = 'Sign-In Cancelled or Interrupted';
            break;
          case 'auth/popup-blocked':
            errorMessage = `Sign-in popup blocked by your browser. Please allow popups for this site (${currentDomain}) and for Google domains. Check ad-blockers and privacy extensions.`;
            toastTitle = 'Popup Blocked';
            break;
          case 'auth/unauthorized-domain':
            errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Ensure it's in Firebase Auth 'Authorized domains' and Google Cloud OAuth 'Authorized JavaScript origins'.`;
            toastTitle = 'Domain Not Authorized';
            break;
          case 'auth/network-request-failed':
             errorMessage = "A network error occurred. Please check your internet connection and try again.";
             toastTitle = 'Network Error';
             break;
          case 'auth/internal-error':
            errorMessage = "An internal Firebase error occurred. Please try again later.";
            toastTitle = 'Firebase Internal Error';
            break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = "An account already exists with this email address but different sign-in credentials (e.g., password). Try signing in with the original method.";
            toastTitle = 'Account Conflict';
            break;
          default:
            errorMessage = `Google Sign-In error (${err.code || 'unknown'}). Please try again.`;
        }
      } else if (err instanceof Error) {
        errorMessage = `Application error: ${err.message}`;
      }
      
      setAuthError(errorMessage);
      toast({ variant: "destructive", title: toastTitle, description: errorMessage, duration: 12000 });
      setAuthLoading(false); 
      setProfileLoading(false);
    }
  };


  const updateUserProfileData = React.useCallback(async (uid: string, data: Partial<UserProfile>) => {
    const operationId = uuidv4().substring(0,6);
    console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] updateUserProfileData called for UID: ${uid}`, data);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Firestore not initialized for updateUserProfileData: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatePayload: Partial<UserProfile> = { ...data };
      if (data.photoURL === '') updatePayload.photoURL = null;
      
      const dataWithTimestamp: Record<string, any> = { ...updatePayload, updatedAt: serverTimestamp() };
      await updateDoc(userDocRef, dataWithTimestamp);
      console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Firestore document updated for ${uid}. Attempting to refetch profile for context update.`);
      
      const updatedProfile = await fetchUserProfile(uid); // Refetch to update context
      if (updatedProfile) {
        setUserProfile(updatedProfile);
        console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] User profile in context updated after saving.`);
      } else {
        console.warn(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Profile was null after refetching post-update for UID ${uid}. This might indicate an issue.`);
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
  }, [fetchUserProfile]);

  const authContextValue: AuthContextType = React.useMemo(() => ({
    user,
    userProfile,
    loading: overallLoading,
    authLoading,
    profileLoading,
    authError,
    signOut,
    signInWithGoogle,
    createOrUpdateUserProfile,
    fetchUserProfile,
    updateUserProfileData,
  }), [
      user, userProfile, overallLoading, authLoading, profileLoading, authError, 
      signOut, signInWithGoogle, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData
    ]);

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
