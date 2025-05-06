"use client";

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { onAuthStateChanged, User, signOut as firebaseSignOut, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, updateProfile as updateAuthProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, collection, query, where, limit, getDocs, runTransaction, increment } from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile } from '@/lib/types';
import { useToast } from "@/hooks/use-toast"; // Ensure useToast is imported
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation'; // Import useSearchParams

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null; // Add an error state
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
  const [error, setError] = useState<string | null>(null); // State for auth errors
  const { toast } = useToast(); // Use the toast hook
  const router = useRouter();
  const searchParams = useSearchParams(); // Get search params

  // Function to fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
      console.log(`Fetching profile for UID: ${uid}`);
      if (!db) {
          console.error("Firestore not initialized for fetchUserProfile");
          setError("Database connection error.");
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
          setError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch profile.");
          return null;
      }
  }, [setError]); // Add setError to dependency array

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
        setError("Database connection error.");
        return null;
    }

    const referredByCode = referredByCodeParam ?? searchParams?.get('ref'); // Prioritize param, fallback to URL
    console.log(`Creating/updating profile for UID: ${authUser.uid}. Referral code used: ${referredByCode}`);
    const userDocRef = doc(db, 'users', authUser.uid);

    try {
      // Run as transaction to ensure atomic read/write for referral updates
      const profile = await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(userDocRef);
        let userProfileData: UserProfile;

        if (docSnap.exists()) {
          // --- Update existing user ---
          const existingData = docSnap.data() as UserProfile;
          userProfileData = {
            ...existingData, // Keep existing data
            email: authUser.email, // Update potentially changed info
            displayName: authUser.displayName || existingData.displayName, // Prefer existing displayName if auth user doesn't have one
            photoURL: authUser.photoURL || existingData.photoURL, // Prefer existing photoURL
            updatedAt: serverTimestamp(), // Firestore timestamp
            // Keep other fields as they were, especially balance/referral info
            // Unless you specifically want to update role here:
            role: existingData.role ?? 'user', // Preserve role
            payoutDetails: existingData.payoutDetails ?? null,
          };
          // Use transaction.update for consistency within the transaction
          transaction.update(userDocRef, {
              email: userProfileData.email,
              displayName: userProfileData.displayName,
              photoURL: userProfileData.photoURL,
              updatedAt: serverTimestamp(),
              // Ensure other fields like role and payoutDetails aren't accidentally overwritten
              role: userProfileData.role,
              payoutDetails: userProfileData.payoutDetails,
          });
          console.log(`Profile updated for existing user: ${authUser.uid}`);
        } else {
          // --- Create new user ---
          const referralCode = uuidv4().substring(0, 8).toUpperCase();
          userProfileData = {
            uid: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName,
            photoURL: authUser.photoURL,
            role: authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID ? 'admin' : 'user', // Check for initial admin
            cashbackBalance: 0,
            pendingCashback: 0,
            lifetimeCashback: 0,
            referralCode: referralCode, // Generate a new referral code
            referralCount: 0,
            referralBonusEarned: 0,
            referredBy: referredByCode || null, // Store the code used for referral
            isDisabled: false,
            createdAt: serverTimestamp(), // Firestore timestamp
            updatedAt: serverTimestamp(), // Firestore timestamp
            lastPayoutRequestAt: null,
            payoutDetails: null, // Initialize as null
          };
          // Use transaction.set within the transaction
          transaction.set(userDocRef, userProfileData);
          console.log(`New profile created for ${authUser.uid}. Referral code: ${referralCode}. Referred by: ${referredByCode}`);

          // --- Handle Referral (only when creating a new user and referredByCode exists) ---
          if (referredByCode) {
            console.log(`Processing referral code: ${referredByCode}`);
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));

             try {
                 // Execute query OUTSIDE the transaction (less prone to contention)
                 const referrerSnap = await getDocs(q);

                 if (!referrerSnap.empty) {
                     const referrerDoc = referrerSnap.docs[0];
                     const referrerRef = doc(db, 'users', referrerDoc.id);
                     // Update referrer stats within the transaction
                     transaction.update(referrerRef, {
                         referralCount: increment(1),
                         // Note: Bonus logic might be more complex in reality
                         // For simplicity, let's assume immediate bonus credit is handled by a Cloud Function later
                         // referralBonusEarned: increment(50), // Example bonus - move to backend trigger
                         updatedAt: serverTimestamp(),
                     });
                     console.log(`Referrer ${referrerDoc.id} stats update prepared within transaction.`);

                 } else {
                     console.warn(`Referrer with code ${referredByCode} not found.`);
                     // Update the new user's referredBy to null if code was invalid
                      userProfileData = { ...userProfileData, referredBy: null };
                      transaction.set(userDocRef, userProfileData); // Re-set with null referredBy
                 }
             } catch (queryError) {
                 console.error("Error querying referrer:", queryError);
                 // Don't fail the signup, just log the referral issue
             }

          } // End if (referredByCode)
        } // End if (!docSnap.exists())

        // Return the profile data (will be converted after transaction commits)
        return userProfileData;
      }); // End of runTransaction

      // Convert timestamps *after* successful transaction
      if (profile) {
          const finalProfile: UserProfile = { ...profile } as UserProfile; // Assume profile is UserProfile-like
          // Safely convert timestamps after transaction
          if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
          if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
          if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();

          console.log(`Profile operation complete for ${authUser.uid}. Final profile data:`, finalProfile);
          return finalProfile;
      } else {
          throw new Error("Profile creation/update transaction returned null.");
      }

    } catch (err) {
      console.error(`Error creating/updating profile for ${authUser.uid}:`, err);
      setError(err instanceof Error ? `Profile setup error: ${err.message}` : "Failed to set up profile.");
      return null;
    }
  }, [setError, searchParams, fetchUserProfile]); // Added fetchUserProfile

  // Effect to listen for authentication state changes
  useEffect(() => {
      if (firebaseInitializationError) {
          setError(firebaseInitializationError);
          setLoading(false);
          return; // Stop if Firebase didn't initialize
      }
      if (!auth) {
          setError("Authentication service not available.");
          setLoading(false);
          return; // Stop if auth service is not available
      }

      const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
          console.log("Auth state changed. User:", authUser?.uid);
          setError(null); // Clear previous errors on auth change

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
                 setError("Failed to load or create user profile.");
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
      (authError) => { // Handle errors from onAuthStateChanged itself
          console.error("Error in onAuthStateChanged listener:", authError);
          setError(`Authentication listener error: ${authError.message}`);
          setUser(null);
          setUserProfile(null);
          setLoading(false);
      });

      // Cleanup subscription on unmount
      return () => {
          console.log("Cleaning up auth subscription.");
          unsubscribe();
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, fetchUserProfile, createOrUpdateUserProfile, searchParams]); // Dependencies

  // Function to sign out the user
  const signOut = async () => {
    if (!auth) {
      setError("Authentication service not available.");
      return;
    }
    setLoading(true); // Indicate loading during sign out
    setError(null);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserProfile(null);
      console.log("User signed out successfully.");
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
    } catch (err) {
      console.error('Error signing out:', err);
      const errorMsg = `Sign out error: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMsg); // Use general error state
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
    } finally {
      setLoading(false); // Ensure loading is set to false even on error
    }
  };

 // Function to sign in with Google
 const signInWithGoogle = async () => {
    if (!auth) {
        setError("Authentication service not available.");
        toast({ variant: "destructive", title: "Auth Error", description: "Authentication service failed." });
        return;
    }
    setLoading(true);
    setError(null);
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
      if (err instanceof Error && 'code' in err) { // Check if it's likely a FirebaseError
        const firebaseErrorCode = (err as any).code; // Type assertion to access code
        switch (firebaseErrorCode) {
          case 'auth/popup-closed-by-user':
            errorMessage = "Sign-in cancelled. The Google sign-in window was closed before completion.";
            break;
          case 'auth/cancelled-popup-request':
            errorMessage = "Sign-in cancelled. Multiple sign-in windows were opened.";
            break;
          case 'auth/popup-blocked':
            errorMessage = "Sign-in failed. Please allow popups for this site to sign in with Google.";
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
          default:
            errorMessage = `An error occurred (${firebaseErrorCode || 'unknown'}). Please try again.`;
        }
      }
      setError(errorMessage); // Use setAuthError for auth-related issues
      toast({
        variant: "destructive",
        title: 'Sign-In Cancelled',
        description: errorMessage,
        duration: 9000, // Increase duration slightly
      });
    } finally {
      setLoading(false);
    }
  };


  // Memoize the context value to prevent unnecessary re-renders
  const authContextValue = React.useMemo(() => ({
    user,
    userProfile,
    loading,
    error,
    signOut,
    signInWithGoogle,
    createOrUpdateUserProfile,
    fetchUserProfile,
    updateUserProfileData,
  }), [user, userProfile, loading, error, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData]); // Add missing dependencies


  // Provide the authentication context to children components
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

// Helper to safely convert Firestore Timestamps or JS Dates to JS Dates
// (Keep this utility function if not already defined elsewhere)
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