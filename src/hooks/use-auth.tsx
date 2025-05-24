// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import {
    onAuthStateChanged,
    User,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    // signInWithPopup, // Reverted to signInWithRedirect in previous step, then back to popup
    signInWithPopup, // Using signInWithPopup as per user's last preference
    getRedirectResult, // Keep for potential future use or complete cleanup if strictly popup
    updateProfile as updateFirebaseAuthProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updateEmail as updateFirebaseAuthEmail,
    updatePassword as updateFirebaseAuthPassword,
    deleteUser as firebaseDeleteUser,
    sendPasswordResetEmail as firebaseSendPasswordResetEmail,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
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
  const [loading, setLoading] = useState(true); // Start with loading true
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile called for UID: ${uid}`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error during profile fetch.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for fetchUserProfile: ${errorMsg}`);
      // Do not set authError here directly, let the caller handle it or rely on initial checks
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
        console.log(`${AUTH_HOOK_LOG_PREFIX} Profile fetched successfully for ${uid}.`);
        return profile;
      } else {
        console.warn(`${AUTH_HOOK_LOG_PREFIX} No profile document found for UID: ${uid}.`);
        return null;
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error fetching profile for ${uid}:`, err);
      // Do not set authError here directly from fetchUserProfile to avoid race conditions
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
    console.log(`${AUTH_HOOK_LOG_PREFIX} createOrUpdateUserProfile called for UID: ${authUser.uid}. RefParam: "${referredByCodeParam}"`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database error during profile setup.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for createOrUpdateUserProfile: ${errorMsg}`);
      return null; // Let the caller handle authError state
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    let referrerIdToUse: string | null = null;
    const urlReferralCode = searchParams?.get('ref')?.trim() || null;
    let finalReferralCode = referredByCodeParam || urlReferralCode;

    if (finalReferralCode) {
      console.log(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Searching for referrer with code: "${finalReferralCode}" for user ${authUser.uid}`);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', finalReferralCode), limit(1));
      try {
        const referrerSnap = await getDocs(q);
        if (!referrerSnap.empty) {
          const referrerDoc = referrerSnap.docs[0];
          if (referrerDoc.id !== authUser.uid) {
            referrerIdToUse = referrerDoc.id;
            console.log(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Referrer ID found: ${referrerIdToUse} for code ${finalReferralCode}`);
          } else {
            console.warn(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] User ${authUser.uid} attempted self-referral.`);
          }
        } else {
          console.warn(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Referrer code "${finalReferralCode}" not found.`);
        }
      } catch (queryError) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Error querying referrer for code ${finalReferralCode}:`, queryError);
      }
    }

    try {
      const newProfileData = await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(userDocRef);
        let userProfileDataToSet: UserProfile;
        let isNewUserCreation = false;

        if (docSnap.exists()) {
          isNewUserCreation = false;
          const existingData = docSnap.data() as UserProfile;
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Updating existing user: ${authUser.uid}. Auth DName: "${authUser.displayName}", Existing DName: "${existingData.displayName}"`);
          
          const updateData: Partial<UserProfile> = {
            displayName: authUser.displayName || existingData.displayName || "MagicSaver User",
            photoURL: authUser.photoURL || existingData.photoURL || null,
            email: authUser.email || existingData.email,
            updatedAt: serverTimestamp(),
          };

          if (existingData.referredBy === null && referrerIdToUse) {
            updateData.referredBy = referrerIdToUse;
          }
          
          if (authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && existingData.role !== 'admin') {
            updateData.role = 'admin';
          }
          transaction.update(userDocRef, updateData);
          userProfileDataToSet = { ...existingData, ...updateData, uid: authUser.uid } as UserProfile;
        } else {
          isNewUserCreation = true;
          const generatedReferralCode = uuidv4().substring(0, 8).toUpperCase();
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Creating new user: ${authUser.uid}. Assigned Referral Code: ${generatedReferralCode}. Referred by: ${referrerIdToUse}`);
          
          userProfileDataToSet = {
            uid: authUser.uid,
            email: authUser.email ?? null,
            displayName: authUser.displayName || "MagicSaver User",
            photoURL: authUser.photoURL ?? null,
            role: authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID ? 'admin' : 'user',
            cashbackBalance: 0, pendingCashback: 0, lifetimeCashback: 0,
            referralCode: generatedReferralCode,
            referralCount: 0, referralBonusEarned: 0,
            referredBy: referrerIdToUse,
            isDisabled: false,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            lastPayoutRequestAt: null, payoutDetails: null,
          };
          transaction.set(userDocRef, userProfileDataToSet);
        }

        if (isNewUserCreation && referrerIdToUse) {
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] New user ${authUser.uid} was referred by ${referrerIdToUse}. Applying referral bonus.`);
          const referrerDocRef = doc(db, 'users', referrerIdToUse);
          const referrerSnap = await transaction.get(referrerDocRef);
          if (referrerSnap.exists()) {
            const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");
            transaction.update(referrerDocRef, {
              referralCount: increment(1),
              referralBonusEarned: increment(referralBonusAmount),
              updatedAt: serverTimestamp(),
            });
            console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Incremented referralCount and referralBonusEarned for referrer ${referrerIdToUse}.`);
          } else {
            console.warn(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Referrer document ${referrerIdToUse} not found.`);
          }
        }
        return userProfileDataToSet;
      });

      if (newProfileData) {
        const finalProfile = { ...newProfileData };
        if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
        if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
        if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
        else finalProfile.lastPayoutRequestAt = null;
        
        console.log(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Transaction successful for UID ${authUser.uid}. Name: "${finalProfile.displayName}"`);
        return finalProfile as UserProfile;
      } else {
        console.error(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Transaction returned null/undefined profile for ${authUser.uid}.`);
        return null;
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Error in createOrUpdateUserProfile transaction for ${authUser.uid}:`, err);
      return null;
    }
  }, [searchParams, fetchUserProfile]); // Removed updateUserProfileData from deps as it's stable

  // This effect handles initial auth state check and subsequent changes
  useEffect(() => {
    let isEffectActive = true;
    console.log(AUTH_HOOK_LOG_PREFIX + "Main auth effect started. Initial loading state:", loading);

    if (firebaseInitializationError) {
      console.error(AUTH_HOOK_LOG_PREFIX + "Firebase not initialized:", firebaseInitializationError);
      if (isEffectActive) {
        setAuthError(firebaseInitializationError);
        setLoading(false);
      }
      return;
    }

    if (!firebaseAuthService) {
      console.error(AUTH_HOOK_LOG_PREFIX + "Firebase Auth service not available.");
      if (isEffectActive) {
        setAuthError("Firebase Auth service not available.");
        setLoading(false);
      }
      return;
    }
    
    // Handle redirect result first (for Google Sign-In with redirect)
    // This part might be less relevant if primarily using signInWithPopup
    getRedirectResult(firebaseAuthService)
      .then(async (result) => {
        if (!isEffectActive) return;
        if (result && result.user) {
          console.log(AUTH_HOOK_LOG_PREFIX + "Google Sign-In (redirect) successful for UID:", result.user.uid);
          const authUserFromRedirect = result.user;
          setUser(authUserFromRedirect); // Set Firebase user first
          const pendingReferralCode = sessionStorage.getItem('pendingReferralCode');
          const profile = await createOrUpdateUserProfile(authUserFromRedirect, pendingReferralCode);
          if (isEffectActive) {
            setUserProfile(profile);
            if (profile) {
              toast({ title: 'Sign In Successful', description: `Welcome back, ${profile.displayName || authUserFromRedirect.email}!` });
              const redirectUrl = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
              router.push(redirectUrl);
              sessionStorage.removeItem('loginRedirectUrl');
              if (pendingReferralCode) sessionStorage.removeItem('pendingReferralCode');
            } else {
              setAuthError("Failed to setup profile after Google redirect.");
            }
          }
        }
        // Even if no redirect result, onAuthStateChanged will handle session restoration or new logins.
        // Crucially, set loading to false after this attempt if no user came from redirect,
        // so onAuthStateChanged can take over without an apparent hang.
        // However, onAuthStateChanged will also set loading false eventually.
        // Let onAuthStateChanged be the final arbiter of the loading state.
      })
      .catch(error => {
        if (isEffectActive) {
          console.error(AUTH_HOOK_LOG_PREFIX + "Error from getRedirectResult:", error);
          setAuthError(`Google Sign-In (redirect) error: ${error.message}`);
          // setLoading(false); // Let onAuthStateChanged handle this.
        }
      });

    // Listener for auth state changes (login, logout, token refresh, initial load)
    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (authUser) => {
      if (!isEffectActive) return;
      console.log(AUTH_HOOK_LOG_PREFIX + "onAuthStateChanged event. Current authUser:", authUser ? authUser.uid : 'null');
      setAuthError(null); // Clear previous errors on new auth state

      if (authUser) {
        // User is signed in (or session restored)
        setUser(authUser); // Set Firebase user state
        console.log(AUTH_HOOK_LOG_PREFIX + `onAuthStateChanged: User ${authUser.uid} detected. Fetching/creating profile...`);
        const profile = await fetchUserProfile(authUser.uid);
        if (isEffectActive) {
          if (profile) {
            setUserProfile(profile);
            console.log(AUTH_HOOK_LOG_PREFIX + `onAuthStateChanged: Profile loaded for ${authUser.uid}. Name: ${profile.displayName}`);
          } else {
            // This case should ideally be rare on reload if profile exists.
            // For a genuinely new user (e.g., email/pass signup), createOrUpdateUserProfile will be called by the signup page itself.
            // If profile is null here for an existing authUser, it might indicate an issue.
            // We might try to create it as a fallback, but it could also mask underlying problems.
            console.warn(AUTH_HOOK_LOG_PREFIX + `onAuthStateChanged: No profile found for existing auth user ${authUser.uid}. Attempting to create/sync.`);
            const newOrSyncedProfile = await createOrUpdateUserProfile(authUser, sessionStorage.getItem('pendingReferralCode'));
            if(isEffectActive) setUserProfile(newOrSyncedProfile);
            if (newOrSyncedProfile && sessionStorage.getItem('pendingReferralCode')) {
                sessionStorage.removeItem('pendingReferralCode');
            }
          }
        }
      } else {
        // User is signed out
        console.log(AUTH_HOOK_LOG_PREFIX + "onAuthStateChanged: No authUser. Resetting states.");
        if (isEffectActive) {
          setUser(null);
          setUserProfile(null);
        }
      }
      if (isEffectActive) {
        setLoading(false); // Final loading state set after all processing for this event
        console.log(AUTH_HOOK_LOG_PREFIX + "onAuthStateChanged: setLoading(false).");
      }
    }, (error) => {
      // Error subscribing to onAuthStateChanged (rare)
      if (isEffectActive) {
        console.error(AUTH_HOOK_LOG_PREFIX + "Error in onAuthStateChanged listener setup:", error);
        setAuthError("Firebase auth listener error: " + error.message);
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      console.log(AUTH_HOOK_LOG_PREFIX + "Auth effect cleanup. Unsubscribing.");
      isEffectActive = false;
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserProfile, createOrUpdateUserProfile]); // router, toast, searchParams are stable or not directly affecting this core auth loop

  const signOut = async () => {
    if (!firebaseAuthService) {
      const msg = "Auth service not available for sign out.";
      setAuthError(msg);
      toast({ variant: "destructive", title: "Sign Out Failed", description: msg });
      return;
    }
    console.log(AUTH_HOOK_LOG_PREFIX + "Attempting sign out...");
    setLoading(true);
    try {
      await firebaseSignOut(firebaseAuthService);
      // onAuthStateChanged will handle clearing user, userProfile, and setting loading to false.
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // router.push('/'); // Consider redirecting after sign out
    } catch (error) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error during firebaseSignOut:`, error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    console.log(AUTH_HOOK_LOG_PREFIX + "Starting Google Sign-In (signInWithPopup)...");
    if (firebaseInitializationError || !firebaseAuthService) {
      const errorMsg = firebaseInitializationError || "Authentication service not available.";
      console.error(AUTH_HOOK_LOG_PREFIX + "Google Sign-In pre-check failed:", errorMsg);
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: "Auth Error", description: errorMsg });
      return;
    }
    
    setLoading(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const urlReferralCode = searchParams?.get('ref')?.trim() || null;
    if (urlReferralCode && typeof window !== 'undefined') {
      sessionStorage.setItem('pendingReferralCode', urlReferralCode);
      console.log(`${AUTH_HOOK_LOG_PREFIX} Stored pendingReferralCode to sessionStorage: ${urlReferralCode}`);
    }
    if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        sessionStorage.setItem('loginRedirectUrl', currentPath === '/login' || currentPath === '/signup' ? '/dashboard' : currentPath);
    }


    try {
      console.log(AUTH_HOOK_LOG_PREFIX + "Attempting signInWithPopup...");
      const result = await signInWithPopup(firebaseAuthService, provider);
      console.log(AUTH_HOOK_LOG_PREFIX + "signInWithPopup successful. User UID:", result.user?.uid);
      // onAuthStateChanged will be triggered by signInWithPopup's success.
      // It will then call handleUserSession (which calls createOrUpdateUserProfile).
      // We don't need to call createOrUpdateUserProfile directly here to avoid race conditions.
      // The loading state will be handled by onAuthStateChanged when it completes profile processing.
      // Toast for success can be triggered here or after profile is fully loaded by onAuthStateChanged.
      // For now, let onAuthStateChanged handle profile creation and subsequent UI updates.
    } catch (err: any) {
      console.error(AUTH_HOOK_LOG_PREFIX + "Google Sign-In signInWithPopup FAILED:", err);
      let errorMessage = "An unexpected error occurred during Google Sign-In.";
      let toastTitle = 'Sign-In Failed';
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';

      if (err instanceof FirebaseError) {
        toastTitle = 'Google Sign-In Error';
        console.error(AUTH_HOOK_LOG_PREFIX + "FirebaseError code:", err.code, "message:", err.message);
        switch (err.code) {
          case 'auth/popup-closed-by-user':
          case 'auth/cancelled-popup-request':
            errorMessage = "Sign-in popup was closed. If unintentional, please check browser settings (popups, 3rd-party cookies, tracking prevention) and try again.";
            toastTitle = 'Sign-In Cancelled';
            break;
          case 'auth/popup-blocked':
            errorMessage = `Sign-in popup blocked by your browser. Please allow popups for this site (${currentDomain}) and for google.com / firebaseapp.com. Also check ad-blockers or privacy extensions.`;
            toastTitle = 'Popup Blocked';
            break;
          case 'auth/unauthorized-domain':
            errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Ensure it's in Firebase Auth's 'Authorized domains' and Google Cloud OAuth Client ID's 'Authorized JavaScript origins' are correct. Also verify 'Authorized redirect URIs' in GCP OAuth settings include 'https://${firebaseConfig.projectId}.firebaseapp.com/__/auth/handler'.`;
            break;
          case 'auth/internal-error':
          case 'auth/network-request-failed':
            errorMessage = "A network or server error occurred. Please check your internet connection and try again.";
            toastTitle = 'Network/Server Error';
            break;
          default:
            errorMessage = `Google Sign-In failed (${err.code || 'unknown'}). Please ensure popups/cookies are allowed.`;
        }
      } else if (err instanceof Error) {
        errorMessage = `Application error: ${err.message}`;
      }
      setAuthError(errorMessage);
      toast({ variant: "destructive", title: toastTitle, description: errorMessage, duration: 12000 });
      setLoading(false); // Explicitly stop loading on signInWithPopup failure
    }
  };

  const authContextValue = React.useMemo(() => ({
    user,
    userProfile,
    loading,
    authError,
    signOut,
    signInWithGoogle,
    createOrUpdateUserProfile,
    fetchUserProfile,
    updateUserProfileData,
  }), [user, userProfile, loading, authError, signOut, signInWithGoogle, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData]);

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
