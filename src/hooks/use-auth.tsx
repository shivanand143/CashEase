
// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import {
    onAuthStateChanged,
    User,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    signInWithPopup, // Changed from signInWithRedirect
    // getRedirectResult, // No longer needed
    updateProfile as updateFirebaseAuthProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updateEmail as updateFirebaseAuthEmail,
    updatePassword as updateFirebaseAuthPassword,
    deleteUser as firebaseDeleteUser,
    sendPasswordResetEmail as firebaseSendPasswordResetEmail,
    signInWithEmailAndPassword, // Ensure this is imported
    createUserWithEmailAndPassword // Ensure this is imported
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
    deleteDoc as firestoreDeleteDoc,
    FirestoreError
} from 'firebase/firestore';
import { auth as firebaseAuthService, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails } from '@/lib/types';
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
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile called for UID: ${uid}`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error during profile fetch.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for fetchUserProfile: ${errorMsg}`);
      setAuthError(errorMsg);
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
        console.log(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile: Profile fetched for ${uid}. Name: ${profile.displayName}, Role: ${profile.role}`);
        return profile;
      } else {
        console.warn(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile: No profile document found for UID: ${uid}.`);
        return null;
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile: Error fetching profile for ${uid}:`, err);
      setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch user profile.");
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
      console.log(`${AUTH_HOOK_LOG_PREFIX} updateUserProfileData: Firestore document updated for ${uid}.`);
      const updatedProfile = await fetchUserProfile(uid);
      if (updatedProfile) {
        setUserProfile(updatedProfile);
        console.log(`${AUTH_HOOK_LOG_PREFIX} updateUserProfileData: Profile data updated and context state set for UID: ${uid}.`);
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} updateUserProfileData: Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
  }, [fetchUserProfile]);

  const createOrUpdateUserProfile = useCallback(async (
    authUser: User,
    referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} createOrUpdateUserProfile called for UID: ${authUser.uid}. Auth DName: "${authUser.displayName}", RefParam: "${referredByCodeParam}"`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database error during profile setup.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for createOrUpdateUserProfile: ${errorMsg}`);
      setAuthError(errorMsg);
      return null;
    }
    if (!authUser) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} AuthUser object is null in createOrUpdateUserProfile.`);
      return null;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    let referrerIdToUse: string | null = null;
    const urlReferralCode = searchParams?.get('ref')?.trim() || null;
    const finalReferralCode = referredByCodeParam || urlReferralCode; // Prioritize param

    console.log(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] UID: ${authUser.uid}. FinalReferralCode: "${finalReferralCode}"`);

    if (finalReferralCode) {
      console.log(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Searching for referrer code: "${finalReferralCode}"`);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', finalReferralCode), limit(1));
      try {
        const referrerSnap = await getDocs(q);
        if (!referrerSnap.empty) {
          const referrerDoc = referrerSnap.docs[0];
          if (referrerDoc.id !== authUser.uid) {
            referrerIdToUse = referrerDoc.id;
            console.log(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Referrer ID found: ${referrerIdToUse}`);
          } else {
            console.warn(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Self-referral ignored.`);
          }
        } else {
          console.warn(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Referrer code "${finalReferralCode}" not found.`);
        }
      } catch (queryError) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Error querying referrer:`, queryError);
      }
    }

    try {
      const newProfileData = await runTransaction(db, async (transaction) => {
        console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Running for UID: ${authUser.uid}`);
        const docSnap = await transaction.get(userDocRef);
        let userProfileDataToSet: UserProfile;
        let isNewUserCreation = false;

        if (docSnap.exists()) {
          isNewUserCreation = false;
          const existingData = docSnap.data() as UserProfile;
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Updating existing user: ${authUser.uid}.`);
          
          const updateData: Partial<UserProfile> = {
            displayName: authUser.displayName || existingData.displayName || "MagicSaver User",
            photoURL: authUser.photoURL || existingData.photoURL || null,
            email: authUser.email || existingData.email,
            updatedAt: serverTimestamp(),
          };

          if (existingData.referredBy === null && referrerIdToUse) {
            updateData.referredBy = referrerIdToUse;
            console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Setting referredBy for existing user.`);
          }
          
          if (authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && existingData.role !== 'admin') {
            updateData.role = 'admin';
          }

          transaction.update(userDocRef, updateData);
          userProfileDataToSet = { ...existingData, ...updateData, uid: authUser.uid } as UserProfile;
        } else {
          isNewUserCreation = true;
          const referralCodeValue = uuidv4().substring(0, 8).toUpperCase();
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Creating new user: ${authUser.uid}. Assigned Referral Code: ${referralCodeValue}`);
          
          userProfileDataToSet = {
            uid: authUser.uid,
            email: authUser.email ?? null,
            displayName: authUser.displayName || "MagicSaver User",
            photoURL: authUser.photoURL ?? null,
            role: authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID ? 'admin' : 'user',
            cashbackBalance: 0,
            pendingCashback: 0,
            lifetimeCashback: 0,
            referralCode: referralCodeValue,
            referralCount: 0,
            referralBonusEarned: 0,
            referredBy: referrerIdToUse,
            isDisabled: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastPayoutRequestAt: null,
            payoutDetails: null,
          };
          transaction.set(userDocRef, userProfileDataToSet);
        }

        if (isNewUserCreation && referrerIdToUse) {
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] New user ${authUser.uid} referred by ${referrerIdToUse}. Processing bonus.`);
          const referrerDocRef = doc(db, 'users', referrerIdToUse);
          const referrerSnap = await transaction.get(referrerDocRef); 
          if (referrerSnap.exists()) {
            const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");
            transaction.update(referrerDocRef, {
              referralCount: increment(1),
              referralBonusEarned: increment(referralBonusAmount),
              updatedAt: serverTimestamp(),
            });
            console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Updated stats for referrer ${referrerIdToUse}.`);
          } else {
            console.warn(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Referrer ${referrerIdToUse} doc not found.`);
          }
        }
        return userProfileDataToSet;
      });

      if (newProfileData) {
        const finalProfile = { ...newProfileData } as UserProfile;
        if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
        if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
        if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
        else finalProfile.lastPayoutRequestAt = null;
        
        console.log(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Transaction OK. Profile for ${authUser.uid}: Name: ${finalProfile.displayName}`);
        return finalProfile;
      } else {
        console.error(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Transaction returned null for ${authUser.uid}.`);
        throw new Error("Profile transaction unexpectedly returned null.");
      }

    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Error in transaction for ${authUser.uid}:`, err);
      const errorMsg = err instanceof Error ? `Profile setup error: ${err.message}` : "Failed to set up profile.";
      setAuthError(errorMsg);
      return null;
    }
  }, [searchParams]);

  // Centralized function to handle user session
  const handleUserSession = useCallback(async (authUser: User, isFromResult: boolean = false, referralCodeFromStorage?: string | null) => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: UID: ${authUser.uid}. FromRedirect/Popup: ${isFromResult}. StorageRefCode: "${referralCodeFromStorage}"`);
    let profile: UserProfile | null = null;
    setAuthError(null);

    try {
      profile = await fetchUserProfile(authUser.uid);
      if (profile) {
        console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Existing profile for ${authUser.uid}. DName: "${profile.displayName}"`);
        // Sync if Firebase Auth user details are newer
        if (
            (authUser.displayName && authUser.displayName !== profile.displayName && authUser.displayName !== "MagicSaver User") ||
            (authUser.photoURL && authUser.photoURL !== profile.photoURL) ||
            (authUser.email && authUser.email !== profile.email)
        ) {
            console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Syncing profile for ${authUser.uid}.`);
            await updateUserProfileData(authUser.uid, {
                displayName: authUser.displayName, photoURL: authUser.photoURL, email: authUser.email,
            });
            profile = await fetchUserProfile(authUser.uid);
        }
      } else {
        console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: No profile for ${authUser.uid}. Creating.`);
        const referralCodeToUse = referralCodeFromStorage || searchParams?.get('ref') || null;
        profile = await createOrUpdateUserProfile(authUser, referralCodeToUse);
        if (profile) {
          console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Profile CREATED for ${authUser.uid}.`);
        } else {
          console.error(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: CRITICAL - Failed to create profile for ${authUser.uid}.`);
          setAuthError("Failed to initialize user profile.");
        }
      }
    } catch (error) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Error for ${authUser.uid}:`, error);
      setAuthError(error instanceof Error ? `Profile processing error: ${error.message}` : "Error loading user profile.");
      profile = null;
    }

    setUser(authUser);
    setUserProfile(profile);
    console.log(`${AUTH_HOOK_LOG_PREFIX} handleUserSession: Final states set for ${authUser.uid}. Profile: ${profile?.displayName}`);
    return profile;
  }, [fetchUserProfile, createOrUpdateUserProfile, searchParams, updateUserProfileData]);

  useEffect(() => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} Main useEffect for auth state triggered.`);
    let isMounted = true;
    
    if (firebaseInitializationError) {
      if (isMounted) { setAuthError(firebaseInitializationError); setLoading(false); }
      return;
    }
    if (!firebaseAuthService) {
      if (isMounted) { setAuthError("Auth service not ready."); setLoading(false); }
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (authUser) => {
      if (!isMounted) return;
      console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged. AuthUser: ${authUser ? authUser.uid : 'null'}.`);
      setLoading(true); // Set loading true while processing auth state
      if (authUser) {
        // User is signed in or session restored
        if (!user || user.uid !== authUser.uid || !userProfile) { // Process if new user, different user, or profile not yet loaded
            console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: New/different user or profile missing. Processing session for ${authUser.uid}.`);
            await handleUserSession(authUser);
        } else {
            console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: User ${authUser.uid} is same and profile already loaded.`);
        }
      } else {
        // User is signed out
        console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: No authUser. Resetting states.`);
        setUser(null);
        setUserProfile(null);
        setAuthError(null);
      }
      setLoading(false); // Set loading false after processing is done
    }, (error) => {
      if (isMounted) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} Error in onAuthStateChanged:`, error);
        setAuthError(`Auth listener error: ${error.message}`);
        setUser(null); setUserProfile(null); setLoading(false);
      }
    });

    return () => { isMounted = false; unsubscribe(); };
  }, [handleUserSession, user, userProfile]); // Added user and userProfile to dependencies to re-evaluate if they change from outside

  const signOut = async () => {
    if (!firebaseAuthService) {
      setAuthError("Auth service not available for sign out.");
      toast({ variant: "destructive", title: "Sign Out Failed", description: "Service unavailable."});
      return;
    }
    console.log(`${AUTH_HOOK_LOG_PREFIX} Signing out user...`);
    setLoading(true);
    setAuthError(null);
    try {
      await firebaseSignOut(firebaseAuthService);
      // onAuthStateChanged will handle clearing user, userProfile, and setting loading to false.
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push('/'); 
    } catch (error) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error signing out:`, error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle (popup) called.`);
    if (firebaseInitializationError || !firebaseAuthService) {
        const errorMsg = firebaseInitializationError || "Authentication service not available.";
        console.error(`${AUTH_HOOK_LOG_PREFIX} Google Sign-In pre-check failed: ${errorMsg}`);
        setAuthError(errorMsg);
        toast({ variant: "destructive", title: "Auth Error", description: errorMsg });
        return; // Do not proceed if auth service isn't ready
    }
    
    setLoading(true);
    setAuthError(null);
    console.log(`${AUTH_HOOK_LOG_PREFIX} Using auth service instance:`, firebaseAuthService);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const urlReferralCode = searchParams?.get('ref');
    console.log(`${AUTH_HOOK_LOG_PREFIX} Google Sign-In initiated. Referral code from URL (if any): ${urlReferralCode}`);
    
    // Store current path for redirect after login, only if not already on login/signup
    if (typeof window !== 'undefined') {
      if (router.asPath && router.asPath !== '/login' && router.asPath !== '/signup') {
        sessionStorage.setItem('loginRedirectUrl', router.asPath);
      } else {
        sessionStorage.setItem('loginRedirectUrl', '/dashboard');
      }
    }

    try {
        console.log(`${AUTH_HOOK_LOG_PREFIX} Attempting signInWithPopup...`);
        const result = await signInWithPopup(firebaseAuthService, provider);
        console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithPopup successful. User UID: ${result.user.uid}.`);
        
        // After popup success, onAuthStateChanged will fire and handleUserSession will be called.
        // We can pass the referral code to handleUserSession if needed, or let it pick from searchParams
        // For simplicity with popup, we rely on onAuthStateChanged to see the searchParams
        // and createOrUpdateUserProfile will pick it up.

        const profile = await handleUserSession(result.user, true, urlReferralCode);

        if (profile) {
          toast({ title: 'Sign In Successful', description: `Welcome, ${profile.displayName || profile.email}!`});
          const redirectUrl = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
          console.log(`${AUTH_HOOK_LOG_PREFIX} (From Popup Result) Redirecting to ${redirectUrl}`);
          router.push(redirectUrl);
          sessionStorage.removeItem('loginRedirectUrl');
        } else {
           console.error(`${AUTH_HOOK_LOG_PREFIX} Profile was not set up correctly after Google Sign-In popup.`);
           setAuthError("Profile setup failed after Google Sign-In.");
           toast({ variant: "destructive", title: "Profile Error", description: "Could not set up your profile after sign-in." });
        }

    } catch (err: any) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} Google Sign-In or profile setup failed:`, err);
        let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
        let toastTitle = 'Sign-In Failed';
        const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'unknown_domain';

        if (err instanceof FirebaseError) {
            console.error(`${AUTH_HOOK_LOG_PREFIX} FirebaseError code: ${err.code}, message: ${err.message}`);
            toastTitle = 'Google Sign-In Error';
            switch (err.code) {
                case 'auth/popup-closed-by-user':
                case 'auth/cancelled-popup-request':
                    errorMessage = "Sign-in popup was closed or cancelled. If this was unintentional, please try again. Ensure your browser isn't blocking popups or third-party cookies.";
                    toastTitle = 'Sign-In Cancelled';
                    break;
                case 'auth/popup-blocked':
                     errorMessage = "Sign-in popup blocked by your browser. Please allow popups for this site and try again. Also check for aggressive ad-blockers or privacy extensions.";
                     toastTitle = 'Popup Blocked';
                     break;
                case 'auth/unauthorized-domain':
                     errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Please contact support or check Firebase console > Authentication > Settings > Authorized domains. Also verify Google Cloud Console OAuth Client ID's "Authorized redirect URIs" include "https://[PROJECT_ID].firebaseapp.com/__/auth/handler".`;
                     break;
                case 'auth/internal-error':
                case 'auth/network-request-failed':
                     errorMessage = "A network or server error occurred. Please check your internet connection and try again.";
                     toastTitle = 'Network/Server Error';
                     break;
                default:
                  errorMessage = `An error occurred (${err.code || 'unknown'}). Please ensure popups and third-party cookies are allowed for google.com and firebaseapp.com.`;
            }
        } else if (err instanceof Error) {
            errorMessage = `An application error occurred: ${err.message}`;
        }
        console.log(`${AUTH_HOOK_LOG_PREFIX} Setting authError:`, errorMessage);
        setAuthError(errorMessage);
        toast({
            variant: "destructive",
            title: toastTitle,
            description: errorMessage,
            duration: 10000,
        });
    } finally {
        setLoading(false); // Ensure loading is always reset
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
  }), [
      user, userProfile, loading, authError,
      createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData // signInWithGoogle & signOut are stable due to useCallback
    ]);

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
