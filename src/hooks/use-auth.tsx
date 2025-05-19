
// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import {
    onAuthStateChanged,
    User,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    signInWithPopup,
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
    DocumentReference,
    WriteBatch,
    FirestoreError
} from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails, CashbackStatus } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { safeToDate } from '@/lib/utils';

// Define the shape of the authentication context
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

// Create the authentication context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create the AuthProvider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Function to fetch user profile from Firestore
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
               const createdAt = safeToDate(profileData.createdAt as Timestamp | undefined);
               const updatedAt = safeToDate(profileData.updatedAt as Timestamp | undefined);
               const lastPayoutRequestAt = safeToDate(profileData.lastPayoutRequestAt as Timestamp | undefined);

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
                 createdAt: createdAt || new Date(0),
                 updatedAt: updatedAt || new Date(0),
                 lastPayoutRequestAt: lastPayoutRequestAt,
                 payoutDetails: profileData.payoutDetails ?? null,
               };
                console.log(`AUTH: Profile fetched successfully for ${uid}. Role: ${profile.role}`);
               return profile;
           } else {
               console.log(`AUTH: No profile found for UID: ${uid}`);
               return null;
           }
       } catch (err) {
           console.error(`AUTH: Error fetching user profile for ${uid}:`, err);
           setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch profile.");
           return null;
       }
   }, [setAuthError]);


 // Function to update user profile data in Firestore
  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
     console.log(`AUTH: Updating profile data for UID: ${uid}`, data);
     if (!db) {
       console.error("AUTH: Firestore not initialized for updateUserProfileData");
       throw new Error("Database connection error.");
     }
     const userDocRef = doc(db, 'users', uid);
     try {
       await updateDoc(userDocRef, {
         ...data,
         updatedAt: serverTimestamp(),
       });
       const updatedProfile = await fetchUserProfile(uid);
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

      const potentialReferralCode = (referredByCodeParam ?? searchParams?.get('ref'))?.trim() || null;
      console.log(`AUTH: [Profile Setup] Starting for UID: ${authUser.uid}. Potential Referral Code: "${potentialReferralCode}"`);

      if (potentialReferralCode) {
        console.log(`AUTH: [Referral Check] Searching for referrer with code: "${potentialReferralCode}"`);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('referralCode', '==', potentialReferralCode), limit(1));
        try {
          const referrerSnap = await getDocs(q);
          if (!referrerSnap.empty) {
            const referrerDoc = referrerSnap.docs[0];
            if (referrerDoc.id !== authUser.uid) {
              referrerIdToUse = referrerDoc.id;
              console.log(`AUTH: [Referral Check] Referrer ID found: ${referrerIdToUse}`);
            } else {
              console.warn(`AUTH: [Referral Check] Self-referral attempt ignored for code "${potentialReferralCode}".`);
            }
          } else {
            console.warn(`AUTH: [Referral Check] Referrer with code "${potentialReferralCode}" not found.`);
          }
        } catch (queryError) {
          console.error("AUTH: [Referral Check] Error querying referrer:", queryError);
        }
      } else {
        console.log("AUTH: [Referral Check] No referral code provided or found.");
      }

      try {
        newProfileData = await runTransaction(db, async (transaction) => {
          console.log(`AUTH: [Transaction] Running for UID: ${authUser.uid}`);
          const docSnap = await transaction.get(userDocRef);
          let userProfileData: UserProfile;

          if (docSnap.exists()) {
            const existingData = docSnap.data() as UserProfile;
            console.log(`AUTH: [Transaction] Updating existing user: ${authUser.uid}.`);
            const updateData: Partial<UserProfile> = {
              displayName: authUser.displayName || existingData.displayName,
              photoURL: authUser.photoURL || existingData.photoURL,
              email: authUser.email || existingData.email,
              updatedAt: serverTimestamp(),
              // Only update referredBy if it's currently null and a valid referrerIdToUse is present
              referredBy: existingData.referredBy === null && referrerIdToUse ? referrerIdToUse : existingData.referredBy,
            };
             // If updating role, only allow if it's from 'user' to 'admin' or by an admin
            if ('role' in authUser && (authUser as any).role === 'admin' && existingData.role === 'user') {
                console.log("AUTH: [Transaction] Role update from user to admin detected.");
                updateData.role = 'admin';
            } else if ('role' in authUser && (authUser as any).role !== existingData.role) {
                // Prevent unauthorized role changes other than the above specific case
                console.warn(`AUTH: [Transaction] Unauthorized role change attempt for ${authUser.uid} from ${existingData.role} to ${(authUser as any).role}. Ignoring.`);
            }

            transaction.update(userDocRef, updateData);
            userProfileData = {
                ...existingData,
                ...updateData,
                createdAt: existingData.createdAt, // Keep original createdAt
                // role is handled above
                cashbackBalance: existingData.cashbackBalance,
                pendingCashback: existingData.pendingCashback,
                lifetimeCashback: existingData.lifetimeCashback,
                referralCode: existingData.referralCode,
                referralCount: existingData.referralCount,
                referralBonusEarned: existingData.referralBonusEarned,
                isDisabled: existingData.isDisabled,
                lastPayoutRequestAt: existingData.lastPayoutRequestAt,
                payoutDetails: existingData.payoutDetails,
                // Ensure referredBy is correctly set from updateData if changed, or existingData otherwise
                referredBy: updateData.referredBy !== undefined ? updateData.referredBy : existingData.referredBy,
            };
             if (userProfileData.createdAt instanceof Timestamp) userProfileData.createdAt = userProfileData.createdAt.toDate();
             if (userProfileData.updatedAt instanceof Timestamp) userProfileData.updatedAt = new Date(); // Set to current date for updates
             if (userProfileData.lastPayoutRequestAt instanceof Timestamp) userProfileData.lastPayoutRequestAt = userProfileData.lastPayoutRequestAt.toDate();
             else userProfileData.lastPayoutRequestAt = null;
            console.log(`AUTH: [Transaction] Existing user profile update prepared. Referred By: ${userProfileData.referredBy}, Role: ${userProfileData.role}`);
          } else {
            isNewUserCreation = true;
            const referralCode = uuidv4().substring(0, 8).toUpperCase();
            console.log(`AUTH: [Transaction] Creating new user: ${authUser.uid}, Assigned Referral Code: ${referralCode}`);
            console.log(`AUTH: [Transaction] Setting referredBy field for new user to: ${referrerIdToUse}`);

            userProfileData = {
              uid: authUser.uid,
              email: authUser.email ?? null,
              displayName: authUser.displayName ?? null,
              photoURL: authUser.photoURL ?? null,
              role: authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID ? 'admin' : 'user',
              cashbackBalance: 0,
              pendingCashback: 0,
              lifetimeCashback: 0,
              referralCode: referralCode,
              referralCount: 0,
              referralBonusEarned: 0,
              referredBy: referrerIdToUse, // Correctly assign referrerIdToUse here
              isDisabled: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              lastPayoutRequestAt: null,
              payoutDetails: null,
            };
            transaction.set(userDocRef, userProfileData);
            console.log(`AUTH: [Transaction] New user profile data prepared. Referred By ID: ${userProfileData.referredBy}, Role: ${userProfileData.role}`);
          }

          if (isNewUserCreation && referrerIdToUse) {
            console.log(`AUTH: [Transaction] New user was referred by ${referrerIdToUse}. Preparing referrer update.`);
            const referrerDocRef = doc(db, 'users', referrerIdToUse);
            const referrerSnap = await transaction.get(referrerDocRef); // Use transaction.get here
            if (referrerSnap.exists()) {
              const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");
              transaction.update(referrerDocRef, {
                referralCount: increment(1),
                referralBonusEarned: increment(referralBonusAmount), // Example bonus
                updatedAt: serverTimestamp(),
              });
              console.log(`AUTH: [Transaction] Referrer count and bonus update prepared for: ${referrerIdToUse}`);
            } else {
              console.warn(`AUTH: [Transaction] Referrer ${referrerIdToUse} not found during transaction. Skipping referrer update.`);
            }
          } else if (isNewUserCreation) {
             console.log("AUTH: [Transaction] New user, but no valid referrer ID. Skipping referrer update.");
          } else {
             console.log("AUTH: [Transaction] Existing user update. No referral count update needed.");
          }
          return userProfileData;
        });

        if (newProfileData) {
          const finalProfile = { ...newProfileData } as UserProfile;
          // Ensure timestamps are JS Dates after transaction
          if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
          if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = new Date(); // Current date for updates
          if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
          else finalProfile.lastPayoutRequestAt = null;

          console.log(`AUTH: [Profile Setup] Operation complete for ${authUser.uid}. Final Profile State:`, JSON.stringify(finalProfile, null, 2));
          setUserProfile(finalProfile);
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
        return null;
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setAuthError, searchParams, fetchUserProfile]); // fetchUserProfile is stable due to its own useCallback


  // Effect to listen for authentication state changes
  useEffect(() => {
    if (firebaseInitializationError) {
        console.error("AUTH: Firebase initialization failed:", firebaseInitializationError);
        setAuthError(firebaseInitializationError);
        setLoading(false);
        return () => {};
    }
    if (!auth) {
        console.warn("AUTH: Auth service not yet available in useEffect listener setup.");
        // setLoading(false); // If auth is permanently unavailable, stop loading.
        return () => {};
    }

    console.log("AUTH: Setting up onAuthStateChanged listener...");
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      console.log("AUTH: Auth state changed. User:", authUser?.uid);
      setAuthError(null); // Clear previous auth errors on state change

      if (authUser) {
        setUser(authUser);
        try {
          let profile = await fetchUserProfile(authUser.uid);
          if (!profile) {
             console.log(`AUTH: Profile not found for ${authUser.uid} after auth state change, attempting creation/update...`);
             const urlReferralCode = searchParams?.get('ref'); // Ensure searchParams is stable or memoized if used directly here
             profile = await createOrUpdateUserProfile(authUser, urlReferralCode);
             if(profile) {
                console.log("AUTH: Profile successfully created/updated after auth change.");
             } else {
                console.error("AUTH: Profile creation/update failed after auth change.");
                // Potentially set a user-facing error or redirect if profile is critical
                throw new Error("Failed to create or update user profile during sign-in.");
             }
          } else {
             console.log(`AUTH: Profile found for ${authUser.uid} after auth change.`);
              // Optionally, sync Firebase Auth display name/photoURL with Firestore profile if they differ
              // This is useful if the user updates their Google profile info
              if (
                 (authUser.displayName && profile.displayName !== authUser.displayName) ||
                 (authUser.photoURL && profile.photoURL !== authUser.photoURL) ||
                 (authUser.email && profile.email !== authUser.email)
               ) {
                 console.log(`AUTH: Auth profile data (name/photo/email) mismatch detected for ${authUser.uid}. Updating Firestore profile.`);
                 await updateUserProfileData(authUser.uid, {
                   displayName: authUser.displayName,
                   photoURL: authUser.photoURL,
                   email: authUser.email, // Ensure email is also synced if it can change
                 });
                 profile = await fetchUserProfile(authUser.uid); // Refetch after update
               }
          }
           setUserProfile(profile); // Set the fetched or newly created/updated profile

        } catch (profileError) {
          console.error("AUTH: Error during profile fetch/create in onAuthStateChanged:", profileError);
          setAuthError(profileError instanceof Error ? profileError.message : "An error occurred loading profile data.");
          setUserProfile(null); // Clear profile on error
        } finally {
          setLoading(false); // Auth process complete (either success or profile error)
        }
      } else {
        // User is signed out
        console.log("AUTH: User signed out.");
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    },
    // Error callback for onAuthStateChanged itself (less common)
    (error) => {
      console.error("AUTH: Error in onAuthStateChanged listener:", error);
      setAuthError(`Authentication listener error: ${error.message}`);
      setUser(null);
      setUserProfile(null);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      console.log("AUTH: Cleaning up auth subscription.");
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData]); // Removed 'auth' as it's stable after init check


  // Function to sign out the user
  const signOut = async () => {
    if (!auth) {
      setAuthError("Authentication service not available.");
      return;
    }
    console.log("AUTH: Signing out...");
    setLoading(true); // Indicate loading during sign-out
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      console.log("AUTH: Sign out successful.");
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
    } catch (error) {
      console.error('AUTH: Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false); // Explicitly set loading to false on sign-out error
    }
  };

  // Function to sign in with Google
  const signInWithGoogle = async () => {
    if (firebaseInitializationError || !auth) {
      setAuthError(firebaseInitializationError || "Authentication service not available.");
      toast({ variant: "destructive", title: "Auth Error", description: firebaseInitializationError || "Authentication service failed." });
      setLoading(false); // Ensure loading stops
      return;
    }
    console.log("AUTH: Starting Google Sign-In...");
    setLoading(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    // Get referral code from URL at the moment of sign-in attempt
    const urlReferralCode = searchParams?.get('ref');
    console.log(`AUTH: Google Sign-In initiated. Referral code from URL (if any): ${urlReferralCode}`);

    try {
      const result = await signInWithPopup(auth, provider);
      const authUser = result.user;
      console.log("AUTH: Google Sign-In successful via popup for user:", authUser.uid);
      // Profile creation/update and success toast are handled by onAuthStateChanged listener
      // which will be triggered by the auth state change.
      // The onAuthStateChanged listener will use createOrUpdateUserProfile which now correctly handles the referral code.
    } catch (err) {
      console.error("AUTH: Google Sign-In or profile setup failed:", err);
      let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
      let toastTitle = 'Sign-In Failed';
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain'; // Get current domain

      // Firebase authentication error handling
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/popup-closed-by-user':
          case 'auth/cancelled-popup-request':
             errorMessage = "Sign-in was cancelled or the popup was closed. If you didn't close it, please check your browser settings (popups, third-party cookies) or try a different browser/network.";
             toastTitle = 'Sign-In Cancelled';
             console.log("AUTH: Google Sign-In popup closed by user or cancelled.");
             break;
          case 'auth/popup-blocked':
             errorMessage = "Sign-in popup blocked by browser. Please allow popups for this site and try again. Also check for strict tracking prevention or ad-blockers.";
             toastTitle = 'Popup Blocked';
             console.warn("AUTH: Google Sign-In popup blocked by browser.");
             break;
          case 'auth/unauthorized-domain':
             errorMessage = `This domain (${currentDomain}) is not authorized for OAuth operations. Ensure it's added to your Firebase project's 'Authorized domains' list.`;
             console.error(`AUTH: Unauthorized domain: ${currentDomain}. Ensure it's added to Firebase Auth settings.`);
             break;
          case 'auth/internal-error':
             errorMessage = "An internal error occurred during sign-in. Please try again later.";
             console.error("AUTH: Internal Firebase error during sign-in.");
             break;
          case 'auth/network-request-failed':
             errorMessage = "Network error during sign-in. Please check your internet connection and try again.";
             console.warn("AUTH: Network error during Google sign-in.");
             break;
         default:
           errorMessage = `An error occurred (${err.code || 'unknown'}). Please try again.`;
           console.error(`AUTH: Unknown Firebase error during sign-in: ${err.code}`);
       }
     } else if (err instanceof Error) { // Handle non-Firebase errors, e.g., from profile setup
         errorMessage = err.message;
         console.error(`AUTH: Error during profile setup after Google sign-in: ${err.message}`);
     }

      setAuthError(errorMessage); // Use setAuthError for auth-related issues
      toast({
        variant: "destructive",
        title: toastTitle,
        description: errorMessage,
        duration: 10000, // Increase duration for more complex messages
      });
      setLoading(false); // Ensure loading stops on error
    }
    // Loading state is set back to false by the onAuthStateChanged handler eventually
  };


  // Memoize the context value to prevent unnecessary re-renders of consumers
  // This ensures that the context object reference only changes when its actual values change.
  const authContextValue = React.useMemo(() => ({
    user,
    userProfile,
    loading,
    authError,
    signOut,
    signInWithGoogle,
    createOrUpdateUserProfile, // Ensure this is included
    fetchUserProfile,
    updateUserProfileData,
  }), [user, userProfile, loading, authError, signOut, signInWithGoogle, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData]);


  // Provide the authentication context to children components
  // Ensure correct JSX syntax
  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the authentication context
// This hook provides an easy way for components to access the auth state and functions.
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // This error means a component tried to use the auth context
    // without being wrapped in an AuthProvider.
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
