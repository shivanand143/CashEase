
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
    updateProfile as updateAuthProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updateEmail as updateFirebaseAuthEmail,
    updatePassword as updateFirebaseAuthPassword
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
    WriteBatch, // Keep WriteBatch for potential future use if needed
    FirestoreError
} from 'firebase/firestore';
import { auth as firebaseAuthService, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { safeToDate } from '@/lib/utils';

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
  const searchParams = useSearchParams(); // Keep this for referral link processing

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`AUTH: Fetching profile for UID: ${uid}`);
    if (!db) {
      console.error("AUTH: Firestore not initialized for fetchUserProfile");
      setAuthError("Database connection error.");
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
          createdAt: safeToDate(profileData.createdAt) || new Date(0),
          updatedAt: safeToDate(profileData.updatedAt) || new Date(0),
          lastPayoutRequestAt: safeToDate(profileData.lastPayoutRequestAt),
          payoutDetails: profileData.payoutDetails ?? null,
        };
        console.log(`AUTH: Profile fetched successfully for ${uid}. Role: ${profile.role}`);
        return profile;
      } else {
        console.warn(`AUTH: No profile found for UID: ${uid}`);
        return null;
      }
    } catch (err) {
      console.error(`AUTH: Error fetching user profile for ${uid}:`, err);
      setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch profile.");
      return null;
    }
  }, []); // Removed setAuthError from deps as it's stable

  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
    console.log(`AUTH: Updating profile data for UID: ${uid}`, data);
    if (!db) {
      console.error("AUTH: Firestore not initialized for updateUserProfileData");
      throw new Error("Database connection error.");
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatePayload: Partial<UserProfile> = { ...data };
      if (data.photoURL === '') updatePayload.photoURL = null;
      
      // Ensure timestamps are server timestamps for updates
      const dataWithTimestamp = { ...updatePayload, updatedAt: serverTimestamp() };

      await updateDoc(userDocRef, dataWithTimestamp);
      const updatedProfile = await fetchUserProfile(uid); // Refetch to get fresh data
      if (updatedProfile) {
        setUserProfile(updatedProfile);
      }
      console.log(`AUTH: Profile data updated successfully for UID: ${uid}`);
    } catch (err) {
      console.error(`AUTH: Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
  }, [fetchUserProfile]);

  const createOrUpdateUserProfile = useCallback(async (
    authUser: User,
    referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
    console.log(`AUTH: createOrUpdateUserProfile called for UID: ${authUser.uid}`);
    if (!db) {
      console.error("AUTH: Firestore not initialized for createOrUpdateUserProfile");
      setAuthError("Database connection error.");
      return null;
    }
    if (!authUser) {
      console.error("AUTH: AuthUser object is null in createOrUpdateUserProfile.");
      return null;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    let referrerIdToUse: string | null = null;
    let newProfileData: UserProfile | null = null;
    let isNewUserCreation = false;

    const sessionReferralCode = typeof window !== 'undefined' ? sessionStorage.getItem('pendingReferralCode') : null;
    const potentialReferralCodeFromUrl = searchParams?.get('ref')?.trim() || null;
    const finalReferralCode = referredByCodeParam || sessionReferralCode || potentialReferralCodeFromUrl;

    console.log(`AUTH: [Profile Setup] Starting for UID: ${authUser.uid}. Final Referral Code to check: "${finalReferralCode}"`);

    if (finalReferralCode) {
      console.log(`AUTH: [Referral Check] Searching for referrer with code: "${finalReferralCode}"`);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', finalReferralCode), limit(1));
      try {
        const referrerSnap = await getDocs(q);
        if (!referrerSnap.empty) {
          const referrerDoc = referrerSnap.docs[0];
          if (referrerDoc.id !== authUser.uid) {
            referrerIdToUse = referrerDoc.id;
            console.log(`AUTH: [Referral Check] Referrer ID found: ${referrerIdToUse} for code ${finalReferralCode}`);
          } else {
            console.warn(`AUTH: [Referral Check] Self-referral attempt ignored for code "${finalReferralCode}".`);
          }
        } else {
          console.warn(`AUTH: [Referral Check] Referrer with code "${finalReferralCode}" not found.`);
        }
      } catch (queryError) {
        console.error("AUTH: [Referral Check] Error querying referrer:", queryError);
      }
    }

    try {
      newProfileData = await runTransaction(db, async (transaction) => {
        console.log(`AUTH: [Transaction] Running for UID: ${authUser.uid}`);
        const docSnap = await transaction.get(userDocRef);
        let userProfileData: UserProfile;

        if (docSnap.exists()) {
          const existingData = docSnap.data() as UserProfile;
          console.log(`AUTH: [Transaction] Updating existing user: ${authUser.uid}. Current referredBy: ${existingData.referredBy}`);
          const updateData: Partial<UserProfile> = {
            displayName: authUser.displayName || existingData.displayName || "MagicSaver User",
            photoURL: authUser.photoURL || existingData.photoURL || null,
            email: authUser.email || existingData.email,
            updatedAt: serverTimestamp(),
            referredBy: existingData.referredBy === null && referrerIdToUse ? referrerIdToUse : existingData.referredBy,
          };
          // Role should only be set if it's initial admin or by explicit admin action, not on every login
          // If an admin role is already set, don't override it unless by specific admin action.
          if (authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && existingData.role !== 'admin') {
            updateData.role = 'admin';
            console.log(`AUTH: [Transaction] Promoting user ${authUser.uid} to admin role (initial admin).`);
          } else if (!existingData.role) { // If role is not set, default to user
            updateData.role = 'user';
          }

          transaction.update(userDocRef, updateData);
          userProfileData = {
            ...existingData,
            ...updateData, // Apply updates
            uid: existingData.uid,
            role: updateData.role || existingData.role || 'user', // Ensure role is set
            cashbackBalance: existingData.cashbackBalance ?? 0,
            pendingCashback: existingData.pendingCashback ?? 0,
            lifetimeCashback: existingData.lifetimeCashback ?? 0,
            referralCode: existingData.referralCode || uuidv4().substring(0, 8).toUpperCase(), // Generate if missing
            referralCount: existingData.referralCount ?? 0,
            referralBonusEarned: existingData.referralBonusEarned ?? 0,
            isDisabled: existingData.isDisabled ?? false,
            createdAt: safeToDate(existingData.createdAt) || serverTimestamp(), // Use existing or new serverTimestamp
            lastPayoutRequestAt: safeToDate(existingData.lastPayoutRequestAt),
            payoutDetails: existingData.payoutDetails ?? null,
          };
        } else {
          isNewUserCreation = true;
          const referralCodeValue = uuidv4().substring(0, 8).toUpperCase();
          console.log(`AUTH: [Transaction] Creating new user: ${authUser.uid}, Assigned Referral Code: ${referralCodeValue}`);
          console.log(`AUTH: [Transaction] Setting referredBy field for new user to: ${referrerIdToUse}`);

          userProfileData = {
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
          transaction.set(userDocRef, userProfileData);
          console.log(`AUTH: [Transaction] New user profile data prepared. Referred By ID: ${userProfileData.referredBy}, Role: ${userProfileData.role}`);
        }

        // Handle referral increment and potential bonus for new user creation
        if (isNewUserCreation && referrerIdToUse) {
          console.log(`AUTH: [Transaction] New user ${authUser.uid} was referred by ${referrerIdToUse}. Incrementing referrer's count.`);
          const referrerDocRef = doc(db, 'users', referrerIdToUse);
          // const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50"); // Bonus logic might be more complex
          transaction.update(referrerDocRef, {
            referralCount: increment(1),
            // referralBonusEarned: increment(referralBonusAmount), // Typically bonus is given after referee's first confirmed cashback
            updatedAt: serverTimestamp(),
          });
          console.log(`AUTH: [Transaction] Referrer count update prepared for: ${referrerIdToUse}.`);
        }
        return userProfileData;
      });

      if (newProfileData) {
        const finalProfile = { ...newProfileData } as UserProfile;
        // Convert server timestamps to JS Dates for client-side state
        if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
        else if (typeof finalProfile.createdAt === 'object' && finalProfile.createdAt !== null) finalProfile.createdAt = new Date(); // Fallback if it's a serverTimestamp placeholder
        else if (!finalProfile.createdAt) finalProfile.createdAt = new Date();


        if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
        else if (typeof finalProfile.updatedAt === 'object' && finalProfile.updatedAt !== null) finalProfile.updatedAt = new Date();
        else if (!finalProfile.updatedAt) finalProfile.updatedAt = new Date();


        if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
        else finalProfile.lastPayoutRequestAt = null;

        console.log(`AUTH: [Profile Setup] Operation complete for ${authUser.uid}. Profile to set:`, finalProfile);
        setUserProfile(finalProfile);
        if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
        return finalProfile;
      } else {
        throw new Error("Profile creation/update transaction returned null.");
      }
    } catch (err) {
      console.error(`AUTH: [Profile Setup] Error in profile transaction for ${authUser.uid}:`, err);
      let errorMsg = "Failed to set up profile.";
      if (err instanceof FirestoreError) {
          errorMsg = `Firestore error (${err.code}): ${err.message}`;
      } else if (err instanceof Error) {
          errorMsg = `Profile setup error: ${err.message}`;
      }
      setAuthError(errorMsg);
      if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
      return null;
    }
  }, [searchParams]); // Removed setAuthError and fetchUserProfile as deps to avoid potential loops. searchParams is stable.

  useEffect(() => {
    console.log("AUTH: useEffect for auth state triggered.");
    if (firebaseInitializationError) {
      console.error("AUTH: Firebase initialization failed:", firebaseInitializationError);
      setAuthError(firebaseInitializationError);
      setLoading(false);
      return () => {};
    }
    if (!firebaseAuthService) {
      console.warn("AUTH: Auth service not yet available in useEffect listener setup.");
      setLoading(false);
      return () => {};
    }

    let processingRedirectResult = false;

    const checkRedirect = async () => {
      console.log("AUTH: Checking for redirect result...");
      processingRedirectResult = true;
      setLoading(true);
      try {
        const result = await getRedirectResult(firebaseAuthService);
        console.log("AUTH: getRedirectResult returned:", result ? result.user?.uid : 'null');
        if (result && result.user) {
          const authUser = result.user;
          setUser(authUser); // Set auth user first
          const referralCode = sessionStorage.getItem('pendingReferralCode');
          console.log(`AUTH: User ${authUser.uid} from redirect. Referrer: ${referralCode}`);
          const profile = await createOrUpdateUserProfile(authUser, referralCode);
          setUserProfile(profile);
          if (profile) {
            toast({ title: "Signed In!", description: `Welcome, ${profile.displayName || 'User'}!` });
            const redirectUrl = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
            router.push(redirectUrl);
            sessionStorage.removeItem('loginRedirectUrl');
            sessionStorage.removeItem('loginRedirectSource');
          }
          sessionStorage.removeItem('pendingReferralCode');
        }
      } catch (err) {
        console.error("AUTH: Error processing getRedirectResult:", err);
        setAuthError(err instanceof Error ? err.message : "Error processing sign-in.");
        toast({ variant: "destructive", title: "Sign-In Error", description: err instanceof Error ? err.message : "Could not process sign-in." });
      } finally {
        processingRedirectResult = false;
        setLoading(false); // Ensure loading is false after redirect processing attempt
      }
    };

    checkRedirect();

    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (authUser) => {
      if (processingRedirectResult) {
        console.log("AUTH: onAuthStateChanged while redirect processing. Deferring...");
        return;
      }
      console.log("AUTH: Auth state changed. New authUser:", authUser ? authUser.uid : 'null');
      setAuthError(null);

      if (authUser) {
        setLoading(true); // Set loading while fetching/creating profile
        setUser(authUser);
        try {
          let profile = await fetchUserProfile(authUser.uid);
          if (!profile) {
            console.log(`AUTH: No profile for ${authUser.uid} onAuthStateChanged, creating...`);
            const referralCode = sessionStorage.getItem('pendingReferralCode'); // Check again
            profile = await createOrUpdateUserProfile(authUser, referralCode);
            if (profile) {
              if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
            } else {
              console.error(`AUTH: CRITICAL - Failed to create profile for ${authUser.uid} in onAuthStateChanged.`);
              setAuthError("Failed to initialize user profile. Please try logging out and in again.");
              setUserProfile(null);
              setLoading(false);
              return;
            }
          } else {
            // Sync profile if authUser details are more recent
            if (
              (authUser.displayName && authUser.displayName !== profile.displayName) ||
              (authUser.photoURL && authUser.photoURL !== profile.photoURL) ||
              (authUser.email && authUser.email !== profile.email)
            ) {
              console.log(`AUTH: Syncing profile for ${authUser.uid} with latest auth data.`);
              await updateUserProfileData(authUser.uid, {
                displayName: authUser.displayName,
                photoURL: authUser.photoURL,
                email: authUser.email,
              });
              profile = await fetchUserProfile(authUser.uid); // Re-fetch after update
            }
          }
          setUserProfile(profile);
          console.log(`AUTH: User profile set for ${authUser.uid} (onAuthStateChanged). Profile:`, profile);
        } catch (profileError) {
          console.error("AUTH: Error during profile processing in onAuthStateChanged:", profileError);
          setAuthError(profileError instanceof Error ? profileError.message : "Error loading profile.");
          setUserProfile(null);
        } finally {
          setLoading(false);
        }
      } else {
        console.log("AUTH: No authUser in onAuthStateChanged. Resetting state.");
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    }, (error) => {
      console.error("AUTH: Error in onAuthStateChanged listener:", error);
      setAuthError(`Authentication listener error: ${error.message}`);
      setUser(null);
      setUserProfile(null);
      setLoading(false);
    });

    return () => {
      console.log("AUTH: Cleaning up onAuthStateChanged listener.");
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed dependencies to ensure it runs once. createOrUpdateUserProfile and fetchUserProfile use useCallback.

  const signOut = async () => {
    if (!firebaseAuthService) {
      setAuthError("Authentication service not available.");
      return;
    }
    console.log("AUTH: Signing out...");
    setLoading(true);
    setAuthError(null);
    try {
      await firebaseSignOut(firebaseAuthService);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // onAuthStateChanged will handle resetting user and userProfile to null
      router.push('/');
    } catch (error) {
      console.error('AUTH: Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false); // Ensure loading stops on sign-out error
    }
    // setLoading(false) will be handled by onAuthStateChanged indirectly setting user to null
  };

  const signInWithGoogle = async () => {
    if (firebaseInitializationError || !firebaseAuthService) {
        const errorMsg = firebaseInitializationError || "Authentication service not available.";
        console.error("AUTH: Google Sign-In pre-check failed:", errorMsg);
        setAuthError(errorMsg);
        toast({ variant: "destructive", title: "Auth Error", description: errorMsg });
        setLoading(false);
        return;
    }
    console.log("AUTH: Starting Google Sign-In with Redirect...");
    setLoading(true); // Set loading true before initiating redirect
    setAuthError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const urlReferralCode = searchParams?.get('ref');
    if (urlReferralCode && typeof window !== 'undefined') {
        sessionStorage.setItem('pendingReferralCode', urlReferralCode);
        console.log(`AUTH: Stored pendingReferralCode in sessionStorage for redirect: ${urlReferralCode}`);
    } else if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingReferralCode'); // Clear if no ref code in URL
    }

    try {
        console.log("AUTH: Attempting signInWithRedirect...");
        await signInWithRedirect(firebaseAuthService, provider);
        // Redirect is in progress, no further client-side action here until user returns.
        // setLoading(false) will be handled by getRedirectResult or onAuthStateChanged.
        console.log("AUTH: signInWithRedirect initiated. Waiting for user to return from Google.");
    } catch (err) {
        console.error("AUTH: Google signInWithRedirect initiation failed:", err);
        let errorMessage = "An unexpected error occurred initiating Google Sign-In. Please try again.";
        let toastTitle = 'Sign-In Failed';
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';

        if (err instanceof FirebaseError) {
            toastTitle = 'Google Sign-In Error';
            console.error(`AUTH: FirebaseError code: ${err.code}, message: ${err.message}`);
            switch (err.code) {
                case 'auth/redirect-operation-pending':
                    errorMessage = "A sign-in process is already in progress. Please complete or cancel it before trying again.";
                    toastTitle = 'Sign-In In Progress';
                    break;
                case 'auth/unauthorized-domain':
                    errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Please contact support. Admin: Verify this domain in Firebase Auth authorized domains & Google Cloud OAuth Client ID settings.`;
                    break;
                case 'auth/internal-error':
                    errorMessage = "An internal error occurred on the authentication server. Please try again later.";
                    break;
                case 'auth/network-request-failed':
                    errorMessage = "Network error during sign-in initiation. Check your internet connection.";
                    break;
                default:
                    errorMessage = `Google Sign-In initiation failed (${err.code || 'unknown'}). Details: ${err.message}`;
            }
        } else if (err instanceof Error) {
            errorMessage = `An application error occurred: ${err.message}`;
        }
        setAuthError(errorMessage);
        toast({ variant: "destructive", title: toastTitle, description: errorMessage, duration: 9000 });
        setLoading(false); // Critical: ensure loading is false if redirect initiation fails
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

    
