
// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback }
from 'react';
import {
    onAuthStateChanged,
    User,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile as updateFirebaseAuthProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updateEmail as updateFirebaseAuthEmail,
    updatePassword as updateFirebaseAuthPassword,
    deleteUser as firebaseDeleteUser,
    sendPasswordResetEmail as firebaseSendPasswordResetEmail,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    getRedirectResult // Keep for potential future use, even if not primary
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
  loading: boolean; // True if either Firebase Auth or Firestore profile is loading
  authLoading: boolean; // True if Firebase Auth is loading (onAuthStateChanged not yet resolved)
  profileLoading: boolean; // True if Firestore profile is loading
  authError: string | null;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  createOrUpdateUserProfile: (authUser: User, referredByCode?: string | null) => Promise<UserProfile | null>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  updateUserProfileData: (uid: string, data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true); // Firebase Auth loading
  const [profileLoading, setProfileLoading] = useState(false); // Firestore Profile loading
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParamsHook = useSearchParams(); // For referral code on client-side

  const overallLoading = authLoading || profileLoading;

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile called for UID: ${uid}`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "DB error during profile fetch.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for fetchUserProfile: ${errorMsg}`);
      setAuthError(errorMsg); // Set error
      return null;
    }
    try {
      const userDocRef = doc(db, 'users', uid);
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
        console.log(`${AUTH_HOOK_LOG_PREFIX} Profile fetched successfully for ${uid}. Name: ${profile.displayName}`);
        return profile;
      } else {
        console.warn(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile: No profile document found for UID: ${uid}.`);
        return null;
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile: Error fetching profile for ${uid}:`, err);
      setAuthError(err instanceof Error ? err.message : "Failed to fetch user profile.");
      return null;
    }
  }, []);

  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} updateUserProfileData called for UID: ${uid}`, data);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for updateUserProfileData: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatePayload: Partial<UserProfile> = { ...data };
      if (data.photoURL === '') updatePayload.photoURL = null;
      
      const dataWithTimestamp: Record<string, any> = { ...updatePayload, updatedAt: serverTimestamp() };
      await updateDoc(userDocRef, dataWithTimestamp);
      console.log(`${AUTH_HOOK_LOG_PREFIX} Firestore document updated for ${uid}.`);
      
      // After update, refetch and set the profile to ensure context is fresh
      const updatedProfile = await fetchUserProfile(uid);
      if (updatedProfile) {
        setUserProfile(updatedProfile);
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
  }, [fetchUserProfile]);

  const createOrUpdateUserProfile = useCallback(async (
    authUser: User,
    referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
    const operationId = uuidv4().substring(0, 6);
    console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] createOrUpdateUserProfile started for UID: ${authUser.uid}. RefParam: "${referredByCodeParam}"`);

    if (!db || firebaseInitializationError) {
        const errorMsg = firebaseInitializationError || "DB error during profile setup.";
        console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Firestore not initialized: ${errorMsg}`);
        setAuthError(errorMsg);
        return null;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    let finalReferralCodeFromStorageOrParam = referredByCodeParam;

    if (!finalReferralCodeFromStorageOrParam && typeof window !== 'undefined') {
        finalReferralCodeFromStorageOrParam = sessionStorage.getItem('pendingReferralCode');
        if (finalReferralCodeFromStorageOrParam) {
            console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Retrieved pendingReferralCode from sessionStorage: "${finalReferralCodeFromStorageOrParam}"`);
        }
    }
     if (!finalReferralCodeFromStorageOrParam) {
        const urlRef = searchParamsHook?.get('ref')?.trim();
        if (urlRef) {
            finalReferralCodeFromStorageOrParam = urlRef;
            console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Retrieved referral code from URL searchParams: "${finalReferralCodeFromStorageOrParam}"`);
        }
    }


    let referrerIdToUse: string | null = null;
    if (finalReferralCodeFromStorageOrParam) {
        console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] Searching for referrer with code: "${finalReferralCodeFromStorageOrParam}"`);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('referralCode', '==', finalReferralCodeFromStorageOrParam), limit(1));
        try {
            const referrerSnap = await getDocs(q);
            if (!referrerSnap.empty) {
                const referrerDoc = referrerSnap.docs[0];
                if (referrerDoc.id !== authUser.uid) {
                    referrerIdToUse = referrerDoc.id;
                    console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] Referrer ID found: ${referrerIdToUse}`);
                } else {
                    console.warn(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] User ${authUser.uid} attempted self-referral.`);
                }
            } else {
                console.warn(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] Referrer code "${finalReferralCodeFromStorageOrParam}" not found.`);
            }
        } catch (queryError) {
            console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [ReferralCheck] Error querying referrer:`, queryError);
        }
    }

    try {
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
                    email: authUser.email || existingData.email, // Ensure email is updated if changed
                    updatedAt: serverTimestamp(),
                };
                if (existingData.referredBy === null && referrerIdToUse && referrerIdToUse !== authUser.uid) {
                    updatePayload.referredBy = referrerIdToUse;
                     console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Setting referredBy for existing user.`);
                }
                if (process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID === authUser.uid && existingData.role !== 'admin') {
                    updatePayload.role = 'admin';
                     console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Promoting initial admin.`);
                }
                transaction.update(userDocRef, updatePayload);
                profileToSet = { ...existingData, ...updatePayload, uid: authUser.uid } as UserProfile; // Merge, then cast
            } else {
                isNewUserCreation = true;
                const generatedReferralCode = uuidv4().substring(0, 8).toUpperCase();
                 console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Creating NEW user: ${authUser.uid}. Ref Code: ${generatedReferralCode}. Referred by: ${referrerIdToUse}`);
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
                    createdAt: serverTimestamp() as Timestamp, // Cast for type safety
                    updatedAt: serverTimestamp() as Timestamp,
                    lastPayoutRequestAt: null, payoutDetails: null,
                };
                transaction.set(userDocRef, profileToSet);
            }

            if (isNewUserCreation && referrerIdToUse) {
                console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] New user ${authUser.uid} was referred by ${referrerIdToUse}. Applying referral bonus.`);
                const referrerDocRef = doc(db, 'users', referrerIdToUse);
                // No need to get referrerSnap again if already checked outside, but good for atomicity
                const referrerSnap = await transaction.get(referrerDocRef); 
                if (referrerSnap.exists()) {
                    const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");
                    transaction.update(referrerDocRef, {
                        referralCount: increment(1),
                        referralBonusEarned: increment(referralBonusAmount),
                        updatedAt: serverTimestamp(),
                    });
                    console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Updated referrer ${referrerIdToUse} count and bonus.`);
                } else {
                    console.warn(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] [Transaction] Referrer ${referrerIdToUse} not found during transaction.`);
                }
            }
            return profileToSet;
        });

        if (profileData) {
             // Convert Firestore Timestamps to JS Dates for client-side state
            const finalProfile = { ...profileData };
            if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
            if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
            if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
            else finalProfile.lastPayoutRequestAt = null; // Ensure it's null if not a Timestamp

            console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Profile operation successful for ${authUser.uid}. Name: "${finalProfile.displayName}"`);
            if (finalReferralCodeFromStorageOrParam && typeof window !== 'undefined') { // Clear from session storage only if it was used
                sessionStorage.removeItem('pendingReferralCode');
                console.log(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Cleared pendingReferralCode from sessionStorage.`);
            }
            return finalProfile as UserProfile;
        } else {
             console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Transaction returned no profile data for ${authUser.uid}.`);
            return null;
        }

    } catch (err) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} [Op:${operationId}] Error in createOrUpdateUserProfile transaction for ${authUser.uid}:`, err);
        setAuthError(err instanceof Error ? err.message : "Failed to save profile during transaction.");
        return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserProfile, searchParamsHook]); // searchParamsHook is stable

   // Centralized function to handle setting user and profile state
  const handleUserSession = useCallback(async (currentAuthUser: User | null) => {
    let effectIsActive = true;
    if (currentAuthUser) {
        console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: User ${currentAuthUser.uid} present. Fetching/creating profile...`);
        if (effectIsActive) setProfileLoading(true);

        let profile = await fetchUserProfile(currentAuthUser.uid);
        if (!profile && effectIsActive) { // If profile doesn't exist, try to create it (e.g., first-time email/pass signup)
            console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: No profile found for ${currentAuthUser.uid}, attempting to create/update.`);
            const referralCodeFromStorage = typeof window !== 'undefined' ? sessionStorage.getItem('pendingReferralCode') : null;
            profile = await createOrUpdateUserProfile(currentAuthUser, referralCodeFromStorage);
            if (profile && referralCodeFromStorage && typeof window !== 'undefined') {
                sessionStorage.removeItem('pendingReferralCode');
            }
        }
        
        if (effectIsActive) {
            setUserProfile(profile);
            setProfileLoading(false);
            console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Profile processing complete for ${currentAuthUser.uid}. Profile set:`, profile ? profile.displayName : 'null');
        }
    } else {
        console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: No user. Resetting profile and profileLoading.`);
        if (effectIsActive) {
            setUserProfile(null);
            setProfileLoading(false);
        }
    }
    return () => { effectIsActive = false; };
  }, [fetchUserProfile, createOrUpdateUserProfile]);


  useEffect(() => {
    let isEffectActive = true;
    console.log(`${AUTH_HOOK_LOG_PREFIX} Main auth effect triggered. Initial authLoading: ${authLoading}`);
    setAuthLoading(true); // Indicate auth state resolution is in progress

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

    // Handle result from signInWithRedirect (if used)
    // This runs *before* onAuthStateChanged typically for the redirect case
    getRedirectResult(firebaseAuthService)
      .then(async (result) => {
        if (!isEffectActive) return;
        if (result && result.user) {
          const authUserFromRedirect = result.user;
          console.log(`${AUTH_HOOK_LOG_PREFIX} getRedirectResult: User ${authUserFromRedirect.uid} detected from redirect.`);
          setUser(authUserFromRedirect); // Set Firebase user immediately
          await handleUserSession(authUserFromRedirect); // Process profile
          
          // Toast and redirect logic specifically for redirect success
          if (userProfile) { // Check if profile was successfully set by handleUserSession
            toast({ title: 'Sign In Successful', description: `Welcome, ${userProfile.displayName || authUserFromRedirect.email}!` });
            const redirectUrlPath = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
            router.push(redirectUrlPath);
            sessionStorage.removeItem('loginRedirectUrl');
          } else if (isEffectActive) { // Profile might still be loading or failed
             console.warn(`${AUTH_HOOK_LOG_PREFIX} getRedirectResult: Profile not immediately available after setting user from redirect. onAuthStateChanged should handle it or error occurred.`);
          }
        }
        // If no redirect result, onAuthStateChanged will handle initial auth check / session restoration
      })
      .catch(error => {
        if (isEffectActive) {
          console.error(`${AUTH_HOOK_LOG_PREFIX} Error from getRedirectResult:`, error);
          setAuthError(`Google Sign-In (redirect) error: ${error.message}`);
          // Don't set loading false here, let onAuthStateChanged handle it
        }
      })
      .finally(() => {
          // `getRedirectResult` is done. Now rely on `onAuthStateChanged`.
          // `onAuthStateChanged` will be the final authority on setting authLoading to false.
          console.log(`${AUTH_HOOK_LOG_PREFIX} getRedirectResult processing finished.`);
      });

    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (currentAuthUser) => {
      if (!isEffectActive) return;
      console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: Event received. AuthUser:`, currentAuthUser ? currentAuthUser.uid : 'null');
      
      setUser(currentAuthUser); // Update Firebase user state

      if (currentAuthUser) {
        // If user is present, and getRedirectResult hasn't already set the profile fully,
        // or if it's a session restoration / email-pass login, handleUserSession will fetch/create.
        await handleUserSession(currentAuthUser);
      } else {
        // No authenticated user
        if (isEffectActive) {
          setUserProfile(null);
          setProfileLoading(false); // Ensure profile loading is false if no user
          console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: No user, profile set to null.`);
        }
      }
      if (isEffectActive) {
        setAuthLoading(false); // Firebase auth state is now resolved
        console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: Firebase auth state resolved. authLoading: false.`);
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
      console.log(`${AUTH_HOOK_LOG_PREFIX} Main auth effect cleanup. Unsubscribed.`);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  const signOut = async () => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} signOut called.`);
    if (!firebaseAuthService) {
      const msg = "Auth service not available for sign out.";
      setAuthError(msg);
      toast({ variant: "destructive", title: "Sign Out Failed", description: msg });
      return;
    }
    setAuthLoading(true); // Indicate transition
    setProfileLoading(true);
    try {
      await firebaseSignOut(firebaseAuthService);
      // onAuthStateChanged will handle clearing user, userProfile.
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // router.push('/'); // Optional: Redirect to home after sign out
    } catch (error) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error signing out:`, error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setAuthLoading(false); // Reset loading on error
      setProfileLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle (Popup) initiated.`);
    if (firebaseInitializationError || !firebaseAuthService) {
      const errorMsg = firebaseInitializationError || "Authentication service not available for Google Sign-In.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Google Sign-In pre-check failed: ${errorMsg}`);
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: "Auth Service Error", description: errorMsg });
      return;
    }
    
    setAuthLoading(true); // Start loading for auth attempt
    setProfileLoading(true); // Profile will also need to load/be created
    setAuthError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const urlReferralCode = searchParamsHook?.get('ref')?.trim() || null;
    if (urlReferralCode && typeof window !== 'undefined') {
        sessionStorage.setItem('pendingReferralCode', urlReferralCode);
        console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle: Stored pendingReferralCode to sessionStorage: "${urlReferralCode}"`);
    }
    if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        // Redirect to dashboard if login/signup, else current page
        const targetRedirect = (currentPath === '/login' || currentPath === '/signup' || currentPath === '/') ? '/dashboard' : currentPath;
        sessionStorage.setItem('loginRedirectUrl', targetRedirect);
         console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle: Stored loginRedirectUrl: "${targetRedirect}"`);
    }

    try {
      console.log(`${AUTH_HOOK_LOG_PREFIX} Attempting signInWithPopup...`);
      const result = await signInWithPopup(firebaseAuthService, provider);
      console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithPopup successful. User UID: ${result.user?.uid}`);
      // `onAuthStateChanged` will be triggered by `signInWithPopup`'s success.
      // It will then call `handleUserSession`, which handles profile creation/fetching.
      // The loading state (authLoading, profileLoading) will be managed by `onAuthStateChanged` and `handleUserSession`.
      
      // Toast for successful Firebase auth. Profile toast can come from handleUserSession or onAuthStateChanged.
      toast({ title: 'Google Sign-In Successful', description: 'Processing your profile...' });

    } catch (err: any) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle (Popup) FAILED:`, err);
      let errorMessage = "An unexpected error occurred during Google Sign-In.";
      let toastTitle = 'Sign-In Failed';
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';

      if (err instanceof FirebaseError) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} FirebaseError code: ${err.code}, message: ${err.message}`);
        switch (err.code) {
          case 'auth/popup-closed-by-user':
          case 'auth/cancelled-popup-request':
            errorMessage = "Sign-in popup was closed before completion. If this was unintentional, please check browser settings (popups, third-party cookies, tracking prevention) and try again.";
            toastTitle = 'Sign-In Cancelled';
            break;
          case 'auth/popup-blocked':
            errorMessage = `Sign-in popup blocked by your browser. Please allow popups for this site (${currentDomain}) and for Google domains. Also check ad-blockers or privacy extensions.`;
            toastTitle = 'Popup Blocked';
            break;
          case 'auth/unauthorized-domain':
            errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Please ensure it's added to the 'Authorized domains' list in your Firebase Authentication settings and that your Google Cloud OAuth client has correct 'Authorized JavaScript origins'.`;
            toastTitle = 'Domain Not Authorized';
            break;
          case 'auth/internal-error':
          case 'auth/network-request-failed':
            errorMessage = "A network or server error occurred. Please check your internet connection and try again.";
            toastTitle = 'Network/Server Error';
            break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = "An account already exists with the same email address but different sign-in credentials. Try signing in using a different method associated with this email.";
            toastTitle = 'Account Conflict';
            break;
          default:
            errorMessage = `An error occurred (${err.code || 'unknown'}). Please ensure popups/cookies are allowed and try again.`;
        }
      } else if (err instanceof Error) {
        errorMessage = `Application error during sign-in: ${err.message}`;
      }
      
      setAuthError(errorMessage);
      toast({ variant: "destructive", title: toastTitle, description: errorMessage, duration: 12000 });
      setAuthLoading(false); // Explicitly stop auth loading on signInWithPopup failure
      setProfileLoading(false); // Also stop profile loading attempt
    }
  };

  const authContextValue: AuthContextType = React.useMemo(() => ({
    user,
    userProfile,
    loading: overallLoading, // Combined loading state
    authLoading,
    profileLoading,
    authError,
    signOut,
    signInWithGoogle,
    createOrUpdateUserProfile,
    fetchUserProfile,
    updateUserProfileData,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, userProfile, overallLoading, authLoading, profileLoading, authError, signOut, signInWithGoogle, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData]);

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

