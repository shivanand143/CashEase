
// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import {
    onAuthStateChanged,
    User,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    signInWithRedirect,
    getRedirectResult,
    updateProfile as updateFirebaseAuthProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updateEmail as updateFirebaseAuthEmail,
    updatePassword as updateFirebaseAuthPassword,
    deleteUser as firebaseDeleteUser,
    sendPasswordResetEmail as firebaseSendPasswordResetEmail,
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

const AUTH_LOG_PREFIX = "AUTH_HOOK:";

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
  const [loading, setLoading] = useState(true); // Start true until first auth check completes
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`${AUTH_LOG_PREFIX} fetchUserProfile called for UID: ${uid}`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error during profile fetch.";
      console.error(`${AUTH_LOG_PREFIX} Firestore not initialized for fetchUserProfile: ${errorMsg}`);
      setAuthError(errorMsg); // Set authError if db is not available
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
        console.log(`${AUTH_LOG_PREFIX} fetchUserProfile: Profile fetched successfully for ${uid}. Name: ${profile.displayName}, Role: ${profile.role}`);
        return profile;
      } else {
        console.warn(`${AUTH_LOG_PREFIX} fetchUserProfile: No profile document found for UID: ${uid}.`);
        return null;
      }
    } catch (err) {
      console.error(`${AUTH_LOG_PREFIX} fetchUserProfile: Error fetching profile for ${uid}:`, err);
      setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch user profile.");
      return null;
    }
  }, []);

  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
    console.log(`${AUTH_LOG_PREFIX} updateUserProfileData called for UID: ${uid}`, data);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error.";
      console.error(`${AUTH_LOG_PREFIX} Firestore not initialized for updateUserProfileData: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatePayload: Partial<UserProfile> = { ...data };
      if (data.photoURL === '') updatePayload.photoURL = null;
      
      const dataWithTimestamp: Record<string, any> = { ...updatePayload, updatedAt: serverTimestamp() };
      await updateDoc(userDocRef, dataWithTimestamp);

      console.log(`${AUTH_LOG_PREFIX} updateUserProfileData: Firestore document updated for ${uid}. Fetching updated profile...`);
      const updatedProfile = await fetchUserProfile(uid); // Re-fetch to update context state
      if (updatedProfile) {
        setUserProfile(updatedProfile);
        console.log(`${AUTH_LOG_PREFIX} updateUserProfileData: Profile data updated and context state set for UID: ${uid}. Name: ${updatedProfile.displayName}`);
      } else {
        console.warn(`${AUTH_LOG_PREFIX} updateUserProfileData: Profile data updated for UID: ${uid}, but re-fetch returned null.`);
      }
    } catch (err) {
      console.error(`${AUTH_LOG_PREFIX} updateUserProfileData: Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
  }, [fetchUserProfile]);

  const createOrUpdateUserProfile = useCallback(async (
    authUser: User,
    referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
    console.log(`${AUTH_LOG_PREFIX} createOrUpdateUserProfile called for UID: ${authUser.uid}. AuthUser Name: "${authUser.displayName}", Referred by param: "${referredByCodeParam}"`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error for profile setup.";
      console.error(`${AUTH_LOG_PREFIX} Firestore not initialized for createOrUpdateUserProfile: ${errorMsg}`);
      setAuthError(errorMsg);
      return null;
    }
    if (!authUser) {
      console.error(`${AUTH_LOG_PREFIX} AuthUser object is null in createOrUpdateUserProfile.`);
      return null;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    let referrerIdToUse: string | null = null;
    let isNewUserCreation = false;

    const sessionReferralCode = typeof window !== 'undefined' ? sessionStorage.getItem('pendingReferralCode') : null;
    const urlReferralCode = searchParams?.get('ref')?.trim() || null;
    // Prioritize explicit param, then session, then URL.
    const finalReferralCode = referredByCodeParam || sessionReferralCode || urlReferralCode;

    console.log(`${AUTH_LOG_PREFIX} [ProfileSetup] For UID: ${authUser.uid}. SessionReferral: "${sessionReferralCode}", URLReferral: "${urlReferralCode}", FinalReferralCodeToProcess: "${finalReferralCode}"`);

    if (finalReferralCode) {
      console.log(`${AUTH_LOG_PREFIX} [ReferralCheck] Searching for referrer with code: "${finalReferralCode}"`);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', finalReferralCode), limit(1));
      try {
        const referrerSnap = await getDocs(q);
        if (!referrerSnap.empty) {
          const referrerDoc = referrerSnap.docs[0];
          if (referrerDoc.id !== authUser.uid) {
            referrerIdToUse = referrerDoc.id;
            console.log(`${AUTH_LOG_PREFIX} [ReferralCheck] Referrer ID found: ${referrerIdToUse} for code ${finalReferralCode}`);
          } else {
            console.warn(`${AUTH_LOG_PREFIX} [ReferralCheck] Self-referral attempt ignored for code "${finalReferralCode}".`);
          }
        } else {
          console.warn(`${AUTH_LOG_PREFIX} [ReferralCheck] Referrer with code "${finalReferralCode}" not found.`);
        }
      } catch (queryError) {
        console.error(`${AUTH_LOG_PREFIX} [ReferralCheck] Error querying referrer:`, queryError);
      }
    }

    try {
      const newProfileData = await runTransaction(db, async (transaction) => {
        console.log(`${AUTH_LOG_PREFIX} [Transaction] Running for UID: ${authUser.uid}`);
        const docSnap = await transaction.get(userDocRef);
        let userProfileDataToSet: UserProfile;

        if (docSnap.exists()) {
          isNewUserCreation = false;
          const existingData = docSnap.data() as UserProfile;
          console.log(`${AUTH_LOG_PREFIX} [Transaction] Updating existing user: ${authUser.uid}. Current displayName: "${existingData.displayName}", DB referredBy: "${existingData.referredBy}"`);
          
          const updateData: Partial<UserProfile> = {
            displayName: authUser.displayName || existingData.displayName || "MagicSaver User",
            photoURL: authUser.photoURL || existingData.photoURL || null,
            email: authUser.email || existingData.email, // Sync email
            updatedAt: serverTimestamp(),
          };

          // Only set referredBy if it's not already set and a valid referrerIdToUse is found
          if (existingData.referredBy === null && referrerIdToUse) {
            updateData.referredBy = referrerIdToUse;
            console.log(`${AUTH_LOG_PREFIX} [Transaction] Setting referredBy for existing user ${authUser.uid} to ${referrerIdToUse}`);
          }
          
          if (authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && existingData.role !== 'admin') {
            updateData.role = 'admin';
            console.log(`${AUTH_LOG_PREFIX} [Transaction] Assigning admin role to existing user ${authUser.uid}`);
          } else if (!existingData.role) { // Only set to 'user' if role is missing
            updateData.role = 'user';
          }

          transaction.update(userDocRef, updateData);
          // Construct the profile by merging existing data with updates
          userProfileDataToSet = {
            ...existingData, // Start with existing data
            ...updateData,   // Overlay with updates
            uid: existingData.uid, // Ensure UID is preserved
            role: updateData.role || existingData.role || 'user', // Ensure role is preserved or defaulted
            createdAt: safeToDate(existingData.createdAt as Timestamp | undefined) || serverTimestamp(), // Preserve original createdAt
          } as UserProfile; 
           console.log(`${AUTH_LOG_PREFIX} [Transaction] Updated user profile data prepared. DisplayName: "${userProfileDataToSet.displayName}", Role: "${userProfileDataToSet.role}"`);
        } else {
          isNewUserCreation = true;
          const referralCodeValue = uuidv4().substring(0, 8).toUpperCase();
          console.log(`${AUTH_LOG_PREFIX} [Transaction] Creating new user: ${authUser.uid}, Auth DisplayName: "${authUser.displayName}", Assigned Referral Code: ${referralCodeValue}, Referred By ID: ${referrerIdToUse}`);
          
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
          console.log(`${AUTH_LOG_PREFIX} [Transaction] New user profile data prepared. DisplayName: "${userProfileDataToSet.displayName}", Role: "${userProfileDataToSet.role}"`);
        }

        // If this is a new user AND they were referred, update the referrer's stats
        if (isNewUserCreation && referrerIdToUse) {
          console.log(`${AUTH_LOG_PREFIX} [Transaction] New user ${authUser.uid} was referred by ${referrerIdToUse}. Processing referral bonuses.`);
          const referrerDocRef = doc(db, 'users', referrerIdToUse);
          // We need to get the referrerDoc *within* the transaction if we intend to update it based on its current state.
          const referrerSnap = await transaction.get(referrerDocRef); 
          if (referrerSnap.exists()) {
            const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");
            transaction.update(referrerDocRef, {
              referralCount: increment(1),
              referralBonusEarned: increment(referralBonusAmount),
              updatedAt: serverTimestamp(),
            });
             console.log(`${AUTH_LOG_PREFIX} [Transaction] Incremented referralCount and referralBonusEarned for referrer ${referrerIdToUse}.`);
          } else {
            console.warn(`${AUTH_LOG_PREFIX} [Transaction] Referrer ${referrerIdToUse} document not found. Cannot update referral stats.`);
          }
        }
        return userProfileDataToSet;
      });

      if (newProfileData) {
        // Convert Firestore Timestamps to JS Dates for the state
        const finalProfile = { ...newProfileData } as UserProfile;
        if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
        else if (!(finalProfile.createdAt instanceof Date)) finalProfile.createdAt = new Date(); // Fallback if it's somehow not a Timestamp or Date

        if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
        else if (!(finalProfile.updatedAt instanceof Date)) finalProfile.updatedAt = new Date();

        if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
        else finalProfile.lastPayoutRequestAt = null; // Ensure it's explicitly null if not a Date
        
        console.log(`${AUTH_LOG_PREFIX} [ProfileSetup] Transaction successful. Profile to set in state for ${authUser.uid}: Name: ${finalProfile.displayName}, Role: ${finalProfile.role}`);
        if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
        return finalProfile;
      } else {
        console.error(`${AUTH_LOG_PREFIX} [ProfileSetup] Transaction returned null for ${authUser.uid}, which is unexpected.`);
        throw new Error("Profile creation/update transaction unexpectedly returned null.");
      }

    } catch (err) {
      console.error(`${AUTH_LOG_PREFIX} [ProfileSetup] Error in profile transaction for ${authUser.uid}:`, err);
      let errorMsg = "Failed to set up profile.";
      if (err instanceof FirestoreError) { errorMsg = `Firestore error (${err.code}): ${err.message}`; }
      else if (err instanceof Error) { errorMsg = `Profile setup error: ${err.message}`; }
      setAuthError(errorMsg);
      if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode'); // Clear on error too
      return null;
    }
  }, [searchParams, fetchUserProfile]); // Added fetchUserProfile here


  // Centralized function to handle user session (profile fetching/creation)
  const handleUserSession = useCallback(async (authUser: User, isRedirectResult: boolean = false) => {
    console.log(`${AUTH_LOG_PREFIX} handleUserSession: Processing for UID: ${authUser.uid}. Is from redirect: ${isRedirectResult}`);
    let profile: UserProfile | null = null;
    setAuthError(null); // Clear previous auth errors

    try {
      profile = await fetchUserProfile(authUser.uid);
      if (profile) {
        console.log(`${AUTH_LOG_PREFIX} handleUserSession: Existing profile found for ${authUser.uid}. Name: "${profile.displayName}", Role: "${profile.role}"`);
        // Sync if Firebase Auth user details are newer (e.g., changed Google display name)
        if (
            (authUser.displayName && authUser.displayName !== profile.displayName && authUser.displayName !== "MagicSaver User") ||
            (authUser.photoURL && authUser.photoURL !== profile.photoURL) ||
            (authUser.email && authUser.email !== profile.email)
        ) {
            console.log(`${AUTH_LOG_PREFIX} handleUserSession: Syncing profile for ${authUser.uid} with latest auth data. Auth DName: "${authUser.displayName}", Profile DName: "${profile.displayName}"`);
            await updateUserProfileData(authUser.uid, {
                displayName: authUser.displayName,
                photoURL: authUser.photoURL,
                email: authUser.email,
            });
            profile = await fetchUserProfile(authUser.uid); // Re-fetch after update
            if(profile) console.log(`${AUTH_LOG_PREFIX} handleUserSession: Profile re-fetched after sync for ${authUser.uid}. Name: "${profile.displayName}"`);
        }
      } else {
        console.log(`${AUTH_LOG_PREFIX} handleUserSession: No profile found for ${authUser.uid}. Attempting to create.`);
        const referralCode = isRedirectResult ? sessionStorage.getItem('pendingReferralCode') : (searchParams?.get('ref') || null);
        console.log(`${AUTH_LOG_PREFIX} handleUserSession: Referral code for new profile creation: "${referralCode}"`);
        profile = await createOrUpdateUserProfile(authUser, referralCode);
        if (profile) {
          console.log(`${AUTH_LOG_PREFIX} handleUserSession: Profile CREATED for ${authUser.uid}. Name: "${profile.displayName}", Role: "${profile.role}"`);
          if (referralCode && typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
        } else {
          console.error(`${AUTH_LOG_PREFIX} handleUserSession: CRITICAL - Failed to create profile for ${authUser.uid}.`);
          setAuthError("Failed to initialize user profile. Please try again.");
        }
      }
    } catch (error) {
      console.error(`${AUTH_LOG_PREFIX} handleUserSession: Error during profile processing for ${authUser.uid}:`, error);
      setAuthError(error instanceof Error ? `Profile loading error: ${error.message}` : "Error loading user profile.");
      profile = null;
    }

    setUser(authUser); // Set Firebase user state
    setUserProfile(profile); // Set Firestore profile state
    console.log(`${AUTH_LOG_PREFIX} handleUserSession: Final states set. User UID: ${authUser.uid}, Profile Name: "${profile?.displayName}", Profile Role: "${profile?.role}"`);
    return profile; // Return the processed profile
  }, [fetchUserProfile, createOrUpdateUserProfile, searchParams, updateUserProfileData]);


  useEffect(() => {
    console.log(`${AUTH_LOG_PREFIX} Main useEffect for auth state triggered. Initial loading state: ${loading}`);
    let isMounted = true;
    
    if (firebaseInitializationError) {
      console.error(`${AUTH_LOG_PREFIX} Firebase initialization failed:`, firebaseInitializationError);
      if (isMounted) {
        setAuthError(firebaseInitializationError);
        setLoading(false);
      }
      return;
    }
    if (!firebaseAuthService) {
      console.warn(`${AUTH_LOG_PREFIX} Auth service not yet available.`);
      if (isMounted) {
        setAuthError("Authentication service not ready.");
        setLoading(false);
      }
      return;
    }

    let redirectResultProcessed = false;

    // 1. Process Redirect Result First (if any)
    console.log(`${AUTH_LOG_PREFIX} Attempting to get redirect result...`);
    getRedirectResult(firebaseAuthService)
      .then(async (result) => {
        if (result && result.user && isMounted) {
          redirectResultProcessed = true;
          const authUser = result.user;
          console.log(`${AUTH_LOG_PREFIX} Google Sign-In (redirect) successful for UID: ${authUser.uid}. Name: "${authUser.displayName}"`);
          
          await handleUserSession(authUser, true); // Pass true for isRedirectResult

          const redirectUrl = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
          const source = sessionStorage.getItem('loginRedirectSource');
          console.log(`${AUTH_LOG_PREFIX} (From Redirect Result) Redirecting to ${redirectUrl} from ${source || 'Google redirect'}`);
          router.push(redirectUrl);
          sessionStorage.removeItem('loginRedirectUrl');
          sessionStorage.removeItem('loginRedirectSource');
        } else if (isMounted) {
          console.log(`${AUTH_LOG_PREFIX} No active redirect result or no user in redirect.`);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(`${AUTH_LOG_PREFIX} Error processing getRedirectResult:`, err);
          let errorMessage = err instanceof Error ? `Redirect processing error: ${err.message}` : "Error processing sign-in redirect.";
           if (err instanceof FirebaseError && err.code === 'auth/unauthorized-domain') {
             const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'this app';
             errorMessage = `Sign-in failed: This domain (${currentDomain}) is not authorized for Google Sign-In. Please check Firebase console > Authentication > Settings > Authorized domains. Also verify Google Cloud Console OAuth Client ID's "Authorized redirect URIs" includes "https://[PROJECT_ID].firebaseapp.com/__/auth/handler".`;
           }
          setAuthError(errorMessage);
          toast({ variant: "destructive", title: "Sign-In Error", description: errorMessage, duration: 10000 });
        }
      })
      .finally(() => {
        if (isMounted && !redirectResultProcessed) {
          // If redirectResult didn't yield a user, we might still need to set loading false
          // if onAuthStateChanged doesn't fire immediately or also finds no user.
          // This will be handled by onAuthStateChanged.
          console.log(`${AUTH_LOG_PREFIX} getRedirectResult.finally(): No user from redirect or already unmounted. Waiting for onAuthStateChanged.`);
        }
      });

    // 2. Setup onAuthStateChanged Listener
    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (authUser) => {
      if (!isMounted) return;
      console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged event. AuthUser: ${authUser ? authUser.uid : 'null'}. Redirect processed flag: ${redirectResultProcessed}`);

      if (redirectResultProcessed && authUser) {
        console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: User ${authUser.uid} already processed by getRedirectResult. Current profile name: ${userProfile?.displayName}. Skipping redundant session handling here.`);
        // If userProfile is already set by getRedirectResult, ensure loading is false.
        // It's possible this fires *after* getRedirectResult's .then() but *before* its .finally() if async ops are involved
        if (userProfile) setLoading(false);
        return;
      }
      
      if (authUser) {
        if (!user || user.uid !== authUser.uid) { // Only process if new user or different user
            setLoading(true); // Set loading true while processing this new auth state
            console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: New auth state for user ${authUser.uid}.`);
            await handleUserSession(authUser, false);
            setLoading(false);

            // Handle redirection for email/pass login/signup AFTER profile is processed
            const redirectUrl = sessionStorage.getItem('loginRedirectUrl');
            const source = sessionStorage.getItem('loginRedirectSource');
            if (redirectUrl && (source === 'loginPage' || source === 'signupPage')) {
               console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Redirecting to ${redirectUrl} from ${source}`);
               router.push(redirectUrl);
               sessionStorage.removeItem('loginRedirectUrl');
               sessionStorage.removeItem('loginRedirectSource');
            }
        } else {
             console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: User ${authUser.uid} is the same. Profile already set (Name: "${userProfile?.displayName}"). Ensuring loading is false.`);
             setLoading(false); // Ensure loading is false if user is already set and profile loaded.
        }
      } else {
        console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: No authUser. Resetting user and profile states.`);
        setUser(null);
        setUserProfile(null);
        setAuthError(null);
        setLoading(false);
      }
    }, (error) => {
      if (isMounted) {
        console.error(`${AUTH_LOG_PREFIX} Error in onAuthStateChanged listener:`, error);
        setAuthError(`Authentication listener error: ${error.message}`);
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      console.log(`${AUTH_LOG_PREFIX} Cleaning up onAuthStateChanged listener.`);
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Dependencies: fetchUserProfile, createOrUpdateUserProfile, router, searchParams, toast. Removed userProfile from here to avoid loop on its own update.

  const signOut = async () => {
    if (!firebaseAuthService) {
      setAuthError("Authentication service not available for sign out.");
      toast({ variant: "destructive", title: "Sign Out Failed", description: "Service unavailable."});
      return;
    }
    console.log(`${AUTH_LOG_PREFIX} Signing out user...`);
    setLoading(true); // Indicate loading during sign out
    setAuthError(null);
    try {
      await firebaseSignOut(firebaseAuthService);
      console.log(`${AUTH_LOG_PREFIX} Firebase sign out successful. User and profile will be cleared by onAuthStateChanged.`);
      // onAuthStateChanged will handle setting user, userProfile to null and loading to false.
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push('/'); 
    } catch (error) {
      console.error(`${AUTH_LOG_PREFIX} Error signing out:`, error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false); // Ensure loading is false on sign out error
    }
  };

  const signInWithGoogle = async () => {
    console.log(`${AUTH_LOG_PREFIX} signInWithGoogle (redirect) called.`);
    if (firebaseInitializationError || !firebaseAuthService) {
        const errorMsg = firebaseInitializationError || "Authentication service not available.";
        console.error(`${AUTH_LOG_PREFIX} Google Sign-In pre-check failed: ${errorMsg}`);
        setAuthError(errorMsg);
        toast({ variant: "destructive", title: "Auth Error", description: errorMsg });
        setLoading(false);
        return;
    }
    
    setLoading(true);
    setAuthError(null);
    console.log(`${AUTH_LOG_PREFIX} Starting Google Sign-In with Redirect... Using auth service instance:`, firebaseAuthService);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // Store referral code from URL params in session storage before redirect
    const urlReferralCode = searchParams?.get('ref');
    console.log(`${AUTH_LOG_PREFIX} Google Sign-In initiated. Referral code from URL (if any): ${urlReferralCode}`);
    if (urlReferralCode && typeof window !== 'undefined') {
        sessionStorage.setItem('pendingReferralCode', urlReferralCode);
        console.log(`${AUTH_LOG_PREFIX} Stored pendingReferralCode in sessionStorage for redirect: ${urlReferralCode}`);
    } else if (typeof window !== 'undefined') {
        // Clear it if not present to avoid using stale codes
        sessionStorage.removeItem('pendingReferralCode');
    }
    // Store where the user was trying to go, if it's not already set by a guard
    if (typeof window !== 'undefined' && !sessionStorage.getItem('loginRedirectUrl')) {
      if (router.asPath && router.asPath !== '/login' && router.asPath !== '/signup') {
        sessionStorage.setItem('loginRedirectUrl', router.asPath);
        console.log(`${AUTH_LOG_PREFIX} Storing current path as loginRedirectUrl: ${router.asPath}`);
      } else {
         sessionStorage.setItem('loginRedirectUrl', '/dashboard'); // Default if on login/signup
         console.log(`${AUTH_LOG_PREFIX} Current path is login/signup, setting loginRedirectUrl to /dashboard`);
      }
    }


    try {
        console.log(`${AUTH_LOG_PREFIX} Attempting signInWithRedirect...`);
        await signInWithRedirect(firebaseAuthService, provider);
        // Redirect is in progress, user will leave the page.
        // Further logic (profile creation, etc.) will be handled by getRedirectResult and onAuthStateChanged when they return.
        console.log(`${AUTH_LOG_PREFIX} signInWithRedirect initiated. Waiting for user to return from Google.`);
    } catch (err: any) {
        console.error(`${AUTH_LOG_PREFIX} Google signInWithRedirect initiation failed:`, err);
        let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
        let toastTitle = 'Sign-In Failed';
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'this app';

        if (err instanceof FirebaseError) {
            toastTitle = 'Google Sign-In Error';
            console.error(`${AUTH_LOG_PREFIX} FirebaseError code: ${err.code}, message: ${err.message}`);
            switch (err.code) {
                case 'auth/redirect-operation-pending':
                    errorMessage = "A sign-in process is already in progress. Please complete or cancel it before trying again.";
                    toastTitle = 'Sign-In In Progress';
                    break;
                case 'auth/unauthorized-domain':
                     errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Please check your Firebase console's Authentication settings > Authorized domains. Also verify "Authorized redirect URIs" in your Google Cloud Console OAuth client settings include "https://[PROJECT_ID].firebaseapp.com/__/auth/handler".`;
                    break;
                case 'auth/internal-error':
                case 'auth/network-request-failed':
                     errorMessage = "A network or server error occurred during sign-in. Please check your internet connection and try again later.";
                     toastTitle = 'Network/Server Error';
                     break;
                default:
                  errorMessage = `An error occurred during Google Sign-In (${err.code || 'unknown'}). Please check your browser settings (popups, third-party cookies, tracking prevention) and try again.`;
            }
        } else if (err instanceof Error) {
            errorMessage = `An application error occurred: ${err.message}`;
        }
        console.log(`${AUTH_LOG_PREFIX} Setting authError due to redirect initiation failure:`, errorMessage);
        setAuthError(errorMessage);
        toast({
            variant: "destructive",
            title: toastTitle,
            description: errorMessage,
            duration: 10000, // Longer duration for important errors
        });
        setLoading(false); 
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
      user,
      userProfile,
      loading,
      authError,
      signOut, // Ensure signOut is stable via useCallback if it had dependencies
      signInWithGoogle, // Ensure stable via useCallback
      createOrUpdateUserProfile, // Already useCallback
      fetchUserProfile, // Already useCallback
      updateUserProfileData, // Already useCallback
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
