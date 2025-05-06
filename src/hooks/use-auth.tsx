
"use client";

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { onAuthStateChanged, User, signOut as firebaseSignOut, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, updateProfile as updateAuthProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, collection, query, where, limit, getDocs, runTransaction, increment, DocumentReference } from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails } from '@/lib/types';
import { useToast } from "@/hooks/use-toast"; // Ensure useToast is imported
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation'; // Import useSearchParams
import { FirebaseError } from 'firebase/app'; // Import FirebaseError

// Helper to safely convert Firestore Timestamps or JS Dates to JS Dates
const safeToDate = (fieldValue: any): Date | null => {
    if (!fieldValue) return null;
    if (fieldValue instanceof Timestamp) {
      return fieldValue.toDate();
    }
    if (fieldValue instanceof Date) {
      return fieldValue;
    }
    // Basic string check - might need refinement based on actual string formats
    if (typeof fieldValue === 'string') {
      try {
        const date = new Date(fieldValue);
        if (!isNaN(date.getTime())) return date;
      } catch (e) { /* Ignore parsing errors */ }
    }
    // Check if it's a Firestore-like object with toDate method (before saved)
    if (typeof fieldValue === 'object' && typeof fieldValue.toDate === 'function') {
         try { return fieldValue.toDate(); } catch (e) {}
    }
    return null; // Return null if conversion fails
};


// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authError: string | null; // Changed from 'error' to avoid naming conflict
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
  const [loading, setLoading] = useState(true); // Initial loading state
  const [authError, setAuthError] = useState<string | null>(null); // State for auth errors
  const { toast } = useToast(); // Use the toast hook
  const router = useRouter();
  const searchParams = useSearchParams(); // Get search params

  // Function to fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
      console.log(`Fetching profile for UID: ${uid}`);
      if (!db) {
          console.error("Firestore not initialized for fetchUserProfile");
          setAuthError("Database connection error.");
          return null;
      }
      try {
          const userDocRef = doc(db, 'users', uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
              const profileData = docSnap.data() as Omit<UserProfile, 'createdAt' | 'updatedAt' | 'lastPayoutRequestAt'>;
              // Convert timestamps safely
              const createdAt = safeToDate(profileData.createdAt as Timestamp);
              const updatedAt = safeToDate(profileData.updatedAt as Timestamp);
              const lastPayoutRequestAt = safeToDate(profileData.lastPayoutRequestAt as Timestamp | undefined);

              const profile: UserProfile = {
                ...profileData,
                uid: docSnap.id,
                createdAt: createdAt || new Date(0), // Fallback if conversion fails
                updatedAt: updatedAt || new Date(0), // Fallback if conversion fails
                lastPayoutRequestAt: lastPayoutRequestAt, // Keep as null if undefined/null
                // Ensure payoutDetails is handled correctly (null if missing)
                payoutDetails: profileData.payoutDetails ?? null,
                cashbackBalance: profileData.cashbackBalance ?? 0,
                pendingCashback: profileData.pendingCashback ?? 0,
                lifetimeCashback: profileData.lifetimeCashback ?? 0,
                referralCode: profileData.referralCode ?? null,
                referralCount: profileData.referralCount ?? 0,
                referralBonusEarned: profileData.referralBonusEarned ?? 0,
                referredBy: profileData.referredBy ?? null,
                isDisabled: profileData.isDisabled ?? false,
                role: profileData.role ?? 'user',
              };
              console.log(`Profile found for ${uid}:`, profile);
              return profile;
          } else {
              console.log(`No profile found for UID: ${uid}`);
              return null;
          }
      } catch (err) {
          console.error(`Error fetching user profile for ${uid}:`, err);
          setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch profile.");
          return null;
      }
  }, [setAuthError]); // Add setAuthError to dependency array

 // Function to update user profile data in Firestore
 const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
    if (!db) {
      console.error("Firestore not initialized for updateUserProfileData");
      throw new Error("Database connection error.");
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      await updateDoc(userDocRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      // Optionally refetch profile after update to reflect changes immediately
      const updatedProfile = await fetchUserProfile(uid);
      if (updatedProfile) {
        setUserProfile(updatedProfile);
      }
      console.log(`Profile data updated successfully for UID: ${uid}`);
    } catch (err) {
      console.error(`Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
  }, [fetchUserProfile]); // Include fetchUserProfile

 // Function to create or update user profile in Firestore
 const createOrUpdateUserProfile = useCallback(async (authUser: User, referredByCodeParam?: string | null): Promise<UserProfile | null> => {
    if (!db) {
        console.error("Firestore not initialized for createOrUpdateUserProfile");
        setAuthError("Database connection error.");
        return null;
    }

    // Determine the referral code to use (parameter takes precedence over URL)
    const referredByCode = referredByCodeParam ?? searchParams?.get('ref');
    console.log(`Starting profile create/update for UID: ${authUser.uid}. Referral code used: ${referredByCode}`);
    const userDocRef = doc(db, 'users', authUser.uid);
    let referrerRef: DocumentReference | null = null; // To store the referrer document reference

    // --- Step 1: Find Referrer (if applicable) - BEFORE the transaction ---
    if (referredByCode) {
        console.log(`Attempting to find referrer with code: ${referredByCode}`);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));
        try {
            const referrerSnap = await getDocs(q);
            if (!referrerSnap.empty) {
                const referrerDoc = referrerSnap.docs[0];
                referrerRef = doc(db, 'users', referrerDoc.id); // Store the reference
                console.log(`Referrer found: ${referrerDoc.id}`);
            } else {
                console.warn(`Referrer with code ${referredByCode} not found.`);
                // Don't throw an error here, just proceed without a valid referrer
            }
        } catch (queryError) {
            console.error("Error querying referrer:", queryError);
            // Don't block signup, just log the referral issue
        }
    }

    // --- Step 2: Run Firestore Transaction ---
    try {
      const profile = await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(userDocRef);
        let userProfileData: UserProfile;
        let isNewUser = false; // Flag to track if it's a new user creation

        if (docSnap.exists()) {
          // --- Update existing user ---
          const existingData = docSnap.data() as UserProfile;
          console.log(`Updating existing user profile for: ${authUser.uid}`);
          const updateData: Partial<UserProfile> = {
             email: authUser.email, // Always update email from auth
             displayName: authUser.displayName || existingData.displayName, // Prefer auth name if available
             photoURL: authUser.photoURL || existingData.photoURL, // Prefer auth photo if available
             updatedAt: serverTimestamp(),
             role: existingData.role ?? 'user', // Preserve existing role
             payoutDetails: existingData.payoutDetails ?? null, // Preserve payout details
          };

          transaction.update(userDocRef, updateData);
          // Construct the profile data to return (based on existing + updates)
          userProfileData = { ...existingData, ...updateData } as UserProfile;

        } else {
          // --- Create new user ---
          isNewUser = true; // Mark as a new user
          const referralCode = uuidv4().substring(0, 8).toUpperCase();
          console.log(`Creating new user profile for: ${authUser.uid}. Referral code: ${referralCode}`);
          userProfileData = {
            uid: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName,
            photoURL: authUser.photoURL,
            role: authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID ? 'admin' : 'user', // Assign initial admin role if UID matches
            cashbackBalance: 0,
            pendingCashback: 0,
            lifetimeCashback: 0,
            referralCode: referralCode,
            referralCount: 0,
            referralBonusEarned: 0,
            // Store the *original* referredByCode, even if the referrer wasn't found (for potential later analysis)
            // But only if a referrerRef *was* successfully found, otherwise store null.
            referredBy: referrerRef ? referredByCode : null,
            isDisabled: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastPayoutRequestAt: null,
            payoutDetails: null,
          };
          transaction.set(userDocRef, userProfileData);
        }

        // --- Handle Referrer Update (only if NEW user AND referrer was found) ---
        if (isNewUser && referrerRef) {
            console.log(`Updating referrer count for: ${referrerRef.id}`);
            transaction.update(referrerRef, {
                referralCount: increment(1),
                // referralBonusEarned: increment(50), // Example - handle bonus logic elsewhere (e.g., Cloud Function)
                updatedAt: serverTimestamp(),
            });
        }

        // Return the profile data (timestamps will be converted after commit)
        return userProfileData;
      }); // End of runTransaction

      // --- Step 3: Convert Timestamps and Return ---
      if (profile) {
          const finalProfile: UserProfile = { ...profile } as UserProfile; // Assume profile is UserProfile-like
          // Safely convert Firestore Timestamps to JS Dates after the transaction
          if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
          if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
          if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();

          console.log(`Profile operation complete for ${authUser.uid}.`);
          return finalProfile;
      } else {
          throw new Error("Profile creation/update transaction returned null.");
      }

    } catch (err) {
      console.error(`Error in profile transaction for ${authUser.uid}:`, err);
      setAuthError(err instanceof Error ? `Profile setup error: ${err.message}` : "Failed to set up profile.");
      return null; // Return null on transaction failure
    }
  }, [setAuthError, searchParams, fetchUserProfile]); // Removed authUser dependency


  // Effect to listen for authentication state changes
  useEffect(() => {
      if (firebaseInitializationError) {
          setAuthError(firebaseInitializationError);
          setLoading(false);
          return; // Stop if Firebase didn't initialize
      }
      if (!auth) {
          setAuthError("Authentication service not available.");
          setLoading(false);
          return; // Stop if auth service is not available
      }

      const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
          console.log("Auth state changed. User:", authUser?.uid);
          setAuthError(null); // Clear previous errors on auth change

          if (authUser) {
              setUser(authUser);
              // Fetch or create/update profile
              let profile = await fetchUserProfile(authUser.uid);
              if (!profile) {
                 // If profile doesn't exist, try creating it (might happen on first login)
                 console.log(`Profile not found for ${authUser.uid}, attempting to create/update...`);
                 // Pass referral code from URL if available during initial profile creation attempt
                 const referredByCode = searchParams?.get('ref');
                 profile = await createOrUpdateUserProfile(authUser, referredByCode);
              }
              if (profile) {
                setUserProfile(profile);
              } else {
                // Handle case where profile fetch/creation failed
                 setAuthError("Failed to load or create user profile.");
                 // Optionally sign out the user if profile is critical
                 // await firebaseSignOut(auth);
                 // setUser(null);
              }
          } else {
              setUser(null);
              setUserProfile(null);
          }
          setLoading(false); // Set loading to false after processing auth state
      },
      (error) => { // Handle errors from onAuthStateChanged itself
          console.error("Error in onAuthStateChanged listener:", error);
          setAuthError(`Authentication listener error: ${error.message}`);
          setUser(null);
          setUserProfile(null);
          setLoading(false);
      });

      // Cleanup subscription on unmount
      return () => {
          console.log("Cleaning up auth subscription.");
          unsubscribe();
      };
  }, [fetchUserProfile, createOrUpdateUserProfile, searchParams]); // Removed auth dependency

  // Function to sign out the user
  const signOut = async () => {
    if (!auth) {
      setAuthError("Authentication service not available.");
      return;
    }
    setLoading(true); // Indicate loading during sign out
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserProfile(null);
      console.log("User signed out successfully.");
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // Redirect to home or login page after sign out
      router.push('/');
    } catch (err) {
      console.error('Error signing out:', err);
      const errorMsg = `Sign out error: ${err instanceof Error ? err.message : String(err)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
    } finally {
      // setLoading(false); // Loading state is managed by onAuthStateChanged
    }
  };

 // Function to sign in with Google
 const signInWithGoogle = async () => {
    if (!auth) {
        setAuthError("Authentication service not available.");
        toast({ variant: "destructive", title: "Auth Error", description: "Authentication service failed." });
        return;
    }
    setLoading(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();

    try {
        const result = await signInWithPopup(auth, provider);
        const authUser = result.user;
        console.log("Google Sign-In successful for user:", authUser.uid);
        // Profile creation/update and state setting is handled by onAuthStateChanged listener
        toast({ title: "Sign-In Successful", description: `Welcome, ${authUser.displayName || 'User'}!` });
        router.push('/dashboard'); // Redirect after successful sign-in
    } catch (err) {
      console.error("Google Sign-In failed:", err);
      let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain'; // Get current domain

      // Firebase authentication error handling
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = "Sign-in cancelled. The Google sign-in window was closed before completion.";
            break;
          case 'auth/cancelled-popup-request':
          case 'auth/popup-blocked': // Treat blocked popup similar to cancelled
            errorMessage = "Sign-in cancelled or popup blocked. Please ensure popups are allowed and try again.";
            break;
          case 'auth/unauthorized-domain':
             errorMessage = `Sign-in failed. This domain (${currentDomain}) is not authorized for Firebase Authentication. Please contact support.`;
             break;
          case 'auth/internal-error':
             errorMessage = "An internal error occurred during sign-in. Please try again later.";
             break;
          case 'auth/network-request-failed':
             errorMessage = "Network error during sign-in. Please check your connection.";
             break;
          // Add other specific Firebase error codes as needed
          default:
            errorMessage = `An error occurred (${err.code || 'unknown'}). Please try again.`;
       }
     }
      setAuthError(errorMessage); // Use setAuthError for auth-related issues
      toast({
        variant: "destructive",
        title: 'Sign-In Cancelled or Failed',
        description: errorMessage,
        duration: 9000, // Increase duration slightly
      });
    } finally {
      // setLoading(false); // Loading state is managed by onAuthStateChanged
    }
  };


  // Memoize the context value to prevent unnecessary re-renders
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
  }), [user, userProfile, loading, authError, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData, signOut, signInWithGoogle]); // Include signOut and signInWithGoogle


  // Provide the authentication context to children components
  // Ensure correct JSX syntax
  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the authentication context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
      