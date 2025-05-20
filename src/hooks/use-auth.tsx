
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
    deleteUser as firebaseDeleteUser, // For potential future use
    sendPasswordResetEmail as firebaseSendPasswordResetEmail, // For potential future use
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
    deleteDoc as firestoreDeleteDoc, // For potential future use
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
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`${AUTH_LOG_PREFIX} fetchUserProfile called for UID: ${uid}`);
    if (!db) {
      console.error(`${AUTH_LOG_PREFIX} Firestore not initialized for fetchUserProfile.`);
      setAuthError("Database connection error during profile fetch.");
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
        console.log(`${AUTH_LOG_PREFIX} fetchUserProfile: Profile fetched successfully for ${uid}.`);
        return profile;
      } else {
        console.warn(`${AUTH_LOG_PREFIX} fetchUserProfile: No profile document found for UID: ${uid}.`);
        return null;
      }
    } catch (err) {
      console.error(`${AUTH_LOG_PREFIX} fetchUserProfile: Error fetching profile for ${uid}:`, err);
      setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch profile.");
      return null;
    }
  }, []);

  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
    console.log(`${AUTH_LOG_PREFIX} updateUserProfileData called for UID: ${uid}`, data);
    if (!db) {
      console.error(`${AUTH_LOG_PREFIX} Firestore not initialized for updateUserProfileData`);
      throw new Error("Database connection error.");
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatePayload: Partial<UserProfile> = { ...data };
      if (data.photoURL === '') updatePayload.photoURL = null;
      
      const dataWithTimestamp: Record<string, any> = { ...updatePayload, updatedAt: serverTimestamp() };
      await updateDoc(userDocRef, dataWithTimestamp);

      console.log(`${AUTH_LOG_PREFIX} updateUserProfileData: Firestore document updated for ${uid}. Fetching updated profile...`);
      const updatedProfile = await fetchUserProfile(uid);
      if (updatedProfile) {
        setUserProfile(updatedProfile);
        console.log(`${AUTH_LOG_PREFIX} updateUserProfileData: Profile data updated and context state set for UID: ${uid}`);
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
    console.log(`${AUTH_LOG_PREFIX} createOrUpdateUserProfile called for UID: ${authUser.uid}. AuthUser display Name: "${authUser.displayName}", Referred by param: "${referredByCodeParam}"`);
    if (!db) {
      console.error(`${AUTH_LOG_PREFIX} Firestore not initialized for createOrUpdateUserProfile.`);
      setAuthError("Database connection error for profile setup.");
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
          console.log(`${AUTH_LOG_PREFIX} [Transaction] Updating existing user: ${authUser.uid}. Current displayName: "${existingData.displayName}", referredBy: "${existingData.referredBy}"`);
          
          const updateData: Partial<UserProfile> = {
            displayName: authUser.displayName || existingData.displayName || "MagicSaver User",
            photoURL: authUser.photoURL || existingData.photoURL || null,
            email: authUser.email || existingData.email,
            updatedAt: serverTimestamp(),
          };

          if (existingData.referredBy === null && referrerIdToUse) {
            updateData.referredBy = referrerIdToUse;
            console.log(`${AUTH_LOG_PREFIX} [Transaction] Setting referredBy for existing user ${authUser.uid} to ${referrerIdToUse}`);
          }
          
          if (authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && existingData.role !== 'admin') {
            updateData.role = 'admin';
            console.log(`${AUTH_LOG_PREFIX} [Transaction] Assigning admin role to existing user ${authUser.uid}`);
          } else if (!existingData.role) {
            updateData.role = 'user';
          }

          transaction.update(userDocRef, updateData);
          userProfileDataToSet = {
            ...existingData,
            ...updateData,
            uid: existingData.uid,
            role: updateData.role || existingData.role || 'user',
            createdAt: safeToDate(existingData.createdAt as Timestamp | undefined) || serverTimestamp(),
          } as UserProfile; // Cast to ensure type
           console.log(`${AUTH_LOG_PREFIX} [Transaction] Updated user profile data prepared:`, userProfileDataToSet.displayName, userProfileDataToSet.role);
        } else {
          isNewUserCreation = true;
          const referralCodeValue = uuidv4().substring(0, 8).toUpperCase();
          console.log(`${AUTH_LOG_PREFIX} [Transaction] Creating new user: ${authUser.uid}, DisplayName from Auth: "${authUser.displayName}", Assigned Referral Code: ${referralCodeValue}, Referred By ID: ${referrerIdToUse}`);
          
          userProfileDataToSet = {
            uid: authUser.uid,
            email: authUser.email ?? null,
            displayName: authUser.displayName || "MagicSaver User", // Default if Google provides no name
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
          console.log(`${AUTH_LOG_PREFIX} [Transaction] New user profile data prepared:`, userProfileDataToSet.displayName, userProfileDataToSet.role);
        }

        if (isNewUserCreation && referrerIdToUse) {
          console.log(`${AUTH_LOG_PREFIX} [Transaction] New user ${authUser.uid} was referred by ${referrerIdToUse}. Processing referral bonuses.`);
          const referrerDocRef = doc(db, 'users', referrerIdToUse);
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
        const finalProfile = { ...newProfileData } as UserProfile;
        if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
        else if (!(finalProfile.createdAt instanceof Date)) finalProfile.createdAt = new Date();

        if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
        else if (!(finalProfile.updatedAt instanceof Date)) finalProfile.updatedAt = new Date();

        if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
        else finalProfile.lastPayoutRequestAt = null;
        
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
      if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
      return null;
    }
  }, [searchParams, fetchUserProfile]); // Added fetchUserProfile

  useEffect(() => {
    console.log(`${AUTH_LOG_PREFIX} Main useEffect for auth state and redirect result triggered.`);
    if (firebaseInitializationError) {
      console.error(`${AUTH_LOG_PREFIX} Firebase initialization failed:`, firebaseInitializationError);
      setAuthError(firebaseInitializationError);
      setLoading(false);
      return;
    }
    if (!firebaseAuthService) {
      console.warn(`${AUTH_LOG_PREFIX} Auth service not yet available in useEffect.`);
      setAuthError("Authentication service not ready.");
      setLoading(false);
      return;
    }

    let processingRedirect = true;
    console.log(`${AUTH_LOG_PREFIX} Attempting to get redirect result...`);
    getRedirectResult(firebaseAuthService)
      .then(async (result) => {
        if (result && result.user) {
          const authUser = result.user;
          console.log(`${AUTH_LOG_PREFIX} Google Sign-In (redirect) successful. UID: ${authUser.uid}. Data from redirect: Name: "${authUser.displayName}", Email: "${authUser.email}"`);
          
          const referralCodeFromSession = sessionStorage.getItem('pendingReferralCode');
          if (referralCodeFromSession) {
            console.log(`${AUTH_LOG_PREFIX} Found pendingReferralCode in session for redirect user ${authUser.uid}: ${referralCodeFromSession}`);
          }

          let profile = await fetchUserProfile(authUser.uid);
          if (!profile) {
            console.log(`${AUTH_LOG_PREFIX} (From Redirect Result) No profile for ${authUser.uid}, attempting to create with session referral code: ${referralCodeFromSession}`);
            profile = await createOrUpdateUserProfile(authUser, referralCodeFromSession);
          } else {
             console.log(`${AUTH_LOG_PREFIX} (From Redirect Result) Existing profile found for ${authUser.uid}. Name: ${profile.displayName}`);
          }

          if (profile) {
            setUser(authUser);
            setUserProfile(profile);
            console.log(`${AUTH_LOG_PREFIX} (From Redirect Result) User and Profile set for ${authUser.uid}. Name: ${profile.displayName}. Loading will be set to false by onAuthStateChanged.`);
            
            const redirectUrl = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
            const source = sessionStorage.getItem('loginRedirectSource');
            console.log(`${AUTH_LOG_PREFIX} (From Redirect Result) Redirecting to ${redirectUrl} from ${source || 'Google redirect'}`);
            router.push(redirectUrl);
            sessionStorage.removeItem('loginRedirectUrl');
            sessionStorage.removeItem('loginRedirectSource');
            if (referralCodeFromSession) sessionStorage.removeItem('pendingReferralCode'); // Clear only if it was used or present
          } else {
            console.error(`${AUTH_LOG_PREFIX} (From Redirect Result) CRITICAL - Failed to get/create profile for ${authUser.uid}.`);
            setAuthError("Failed to initialize user profile after Google sign-in. Please try again.");
          }
        } else {
          console.log(`${AUTH_LOG_PREFIX} No redirect result or no user in redirect result.`);
        }
      })
      .catch((err) => {
        console.error(`${AUTH_LOG_PREFIX} Error processing getRedirectResult:`, err);
        setAuthError(err instanceof Error ? `Redirect processing error: ${err.message}` : "Error processing sign-in redirect.");
        toast({ variant: "destructive", title: "Sign-In Error", description: err instanceof Error ? err.message : "Could not process sign-in redirect." });
      })
      .finally(() => {
        processingRedirect = false;
        console.log(`${AUTH_LOG_PREFIX} Finished processing redirect result. Current user state (before onAuthStateChanged re-evaluation):`, firebaseAuthService.currentUser?.uid);
        // If onAuthStateChanged hasn't run yet or if current user is null, it will now run with a clear path.
        // If it already ran, it might re-evaluate.
        // Defer setLoading(false) to the onAuthStateChanged handler for consistency
      });

    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (authUser) => {
      console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged event. AuthUser UID: ${authUser ? authUser.uid : 'null'}. Processing redirect flag: ${processingRedirect}`);
      
      if (processingRedirect && authUser) {
        console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Detected user [${authUser.uid}] while still processing redirect. Deferring full profile logic.`);
        if (!user) { // Only set if not already set by getRedirectResult (though getRedirectResult should set it)
            setUser(authUser);
            console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Firebase user object set to ${authUser.uid} during redirect processing.`);
        }
        // Profile operations will be handled by getRedirectResult or the next onAuthStateChanged call after redirect processing is false.
        return;
      }
      
      if (processingRedirect && !authUser) {
        console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: No authUser, and still processing redirect. Waiting for getRedirectResult to complete.`);
        setLoading(false); // If no user and redirect is done processing, means no active redirect login
        return;
      }

      // --- Main auth state change processing (after redirect logic or for direct load/email-pass auth) ---
      console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Proceeding with main auth state processing for authUser: ${authUser ? authUser.uid : 'null'}`);
      setLoading(true); 
      setAuthError(null);

      let currentResolvedProfile: UserProfile | null = null;

      if (authUser) {
        setUser(authUser); // Set Firebase auth user immediately
        console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: User [${authUser.uid}] detected. Name: "${authUser.displayName}". Email: "${authUser.email}". Attempting to fetch/create profile...`);

        try {
          currentResolvedProfile = await fetchUserProfile(authUser.uid);
          if (currentResolvedProfile) {
            console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Existing profile found for ${authUser.uid}: Name: ${currentResolvedProfile.displayName}, Role: ${currentResolvedProfile.role}`);
            // Sync if Firebase Auth user details (displayName, photoURL, email) are newer
             if (
                (authUser.displayName && authUser.displayName !== currentResolvedProfile.displayName && authUser.displayName !== "MagicSaver User") ||
                (authUser.photoURL && authUser.photoURL !== currentResolvedProfile.photoURL) ||
                (authUser.email && authUser.email !== currentResolvedProfile.email)
            ) {
                console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Syncing profile for ${authUser.uid} with latest auth data. Auth DName: "${authUser.displayName}", Profile DName: "${currentResolvedProfile.displayName}"`);
                await updateUserProfileData(authUser.uid, {
                    displayName: authUser.displayName,
                    photoURL: authUser.photoURL,
                    email: authUser.email, // Ensure email is also synced
                });
                currentResolvedProfile = await fetchUserProfile(authUser.uid); // Re-fetch after update
                if(currentResolvedProfile) console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Profile re-fetched after sync for ${authUser.uid}. Name: ${currentResolvedProfile.displayName}`);
            }
          } else {
            console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: No profile for ${authUser.uid}, attempting to create...`);
            const referralCodeFromSession = sessionStorage.getItem('pendingReferralCode');
            currentResolvedProfile = await createOrUpdateUserProfile(authUser, referralCodeFromSession);
            if (currentResolvedProfile) {
              console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Profile created for ${authUser.uid}: Name: ${currentResolvedProfile.displayName}, Role: ${currentResolvedProfile.role}`);
              if (referralCodeFromSession) sessionStorage.removeItem('pendingReferralCode');
            } else {
              console.error(`${AUTH_LOG_PREFIX} onAuthStateChanged: CRITICAL - Failed to create profile for ${authUser.uid}.`);
              setAuthError("Failed to initialize user profile. Please try logging out and in again.");
            }
          }
        } catch (profileError) {
          console.error(`${AUTH_LOG_PREFIX} onAuthStateChanged: Error during profile processing for user ${authUser.uid}:`, profileError);
          setAuthError(profileError instanceof Error ? `Profile loading error: ${profileError.message}` : "Error loading user profile.");
          currentResolvedProfile = null; // Ensure profile is null on error
        }
      } else {
        console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: No authUser. Resetting user and profile states.`);
        currentResolvedProfile = null;
        setUser(null);
      }
      
      setUserProfile(currentResolvedProfile);
      console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Final user profile state set to:`, currentResolvedProfile ? `Name: ${currentResolvedProfile.displayName}, Role: ${currentResolvedProfile.role}` : 'null');
      setLoading(false);
      console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Loading state set to false.`);

      // Handle redirection for email/pass login/signup AFTER profile is processed
      if (authUser && currentResolvedProfile) {
        const redirectUrl = sessionStorage.getItem('loginRedirectUrl');
        const source = sessionStorage.getItem('loginRedirectSource');
        if (redirectUrl && (source === 'loginPage' || source === 'signupPage')) {
           console.log(`${AUTH_LOG_PREFIX} onAuthStateChanged: Redirecting to ${redirectUrl} from ${source}`);
           router.push(redirectUrl);
           sessionStorage.removeItem('loginRedirectUrl');
           sessionStorage.removeItem('loginRedirectSource');
        }
      }

    }, (error) => {
      console.error(`${AUTH_LOG_PREFIX} Error in onAuthStateChanged listener:`, error);
      setAuthError(`Authentication listener error: ${error.message}`);
      setUser(null);
      setUserProfile(null);
      setLoading(false);
    });

    return () => {
      console.log(`${AUTH_LOG_PREFIX} Cleaning up onAuthStateChanged listener.`);
      unsubscribe();
    };
  }, [createOrUpdateUserProfile, fetchUserProfile, router, toast, searchParams, user, updateUserProfileData]);


  const signOut = async () => {
    if (!firebaseAuthService) {
      setAuthError("Authentication service not available for sign out.");
      toast({ variant: "destructive", title: "Sign Out Failed", description: "Service unavailable."});
      return;
    }
    console.log(`${AUTH_LOG_PREFIX} Signing out user...`);
    setLoading(true);
    setAuthError(null);
    try {
      await firebaseSignOut(firebaseAuthService);
      console.log(`${AUTH_LOG_PREFIX} Firebase sign out successful. User and profile will be cleared by onAuthStateChanged.`);
      // onAuthStateChanged will handle setting user and userProfile to null and loading to false.
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push('/');
    } catch (error) {
      console.error(`${AUTH_LOG_PREFIX} Error signing out:`, error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false); 
    }
  };

  const signInWithGoogle = async () => {
    console.log(`${AUTH_LOG_PREFIX} signInWithGoogle called (redirect method).`);
    if (firebaseInitializationError || !firebaseAuthService) {
        const errorMsg = firebaseInitializationError || "Authentication service not available.";
        console.error(`${AUTH_LOG_PREFIX} Google Sign-In pre-check failed:`, errorMsg);
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

    const urlReferralCode = searchParams?.get('ref');
    console.log(`${AUTH_LOG_PREFIX} Google Sign-In initiated. Referral code from URL (if any): ${urlReferralCode}`);
    if (urlReferralCode && typeof window !== 'undefined') {
        sessionStorage.setItem('pendingReferralCode', urlReferralCode);
        console.log(`${AUTH_LOG_PREFIX} Stored pendingReferralCode in sessionStorage for redirect: ${urlReferralCode}`);
    } else if (typeof window !== 'undefined') {
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
        await signInWithRedirect(firebaseAuthService, provider);
        console.log(`${AUTH_LOG_PREFIX} signInWithRedirect initiated. Waiting for user to return from Google.`);
    } catch (err: any) {
        console.error(`${AUTH_LOG_PREFIX} Google signInWithRedirect initiation failed:`, err);
        let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
        let toastTitle = 'Sign-In Failed';
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';

        if (err instanceof FirebaseError) {
            toastTitle = 'Google Sign-In Error';
            console.error(`${AUTH_LOG_PREFIX} FirebaseError code: ${err.code}, message: ${err.message}`);
            switch (err.code) {
                case 'auth/popup-blocked': 
                    errorMessage = "Sign-in popup/redirect blocked by your browser. Please allow popups/redirects for this site and try again.";
                    toastTitle = 'Popup/Redirect Blocked';
                    break;
                case 'auth/popup-closed-by-user': 
                    errorMessage = "Sign-in process was cancelled or interrupted. Please try again. If issues persist, check browser settings (popups, third-party cookies, tracking prevention).";
                    toastTitle = 'Sign-In Cancelled/Interrupted';
                    break;
                case 'auth/redirect-operation-pending':
                    errorMessage = "A sign-in process is already in progress. Please complete or cancel it before trying again.";
                    toastTitle = 'Sign-In In Progress';
                    break;
                case 'auth/unauthorized-domain':
                     errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Please check your Firebase console's Authentication settings. Ensure the domain is listed under "Authorized domains", and also check "Authorized JavaScript origins" and "Authorized redirect URIs" in your Google Cloud Console OAuth client settings.`;
                    break;
                case 'auth/internal-error':
                case 'auth/network-request-failed':
                     errorMessage = "A network or server error occurred during sign-in. Please check your internet connection and try again later.";
                     toastTitle = 'Network/Server Error';
                     break;
                default:
                  errorMessage = `An error occurred (${err.code || 'unknown'}). Please try again.`;
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
            duration: 9000,
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
      signOut,
      signInWithGoogle,
      createOrUpdateUserProfile,
      fetchUserProfile,
      updateUserProfileData,
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
