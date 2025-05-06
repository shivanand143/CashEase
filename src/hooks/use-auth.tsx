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
    updateEmail as updateFirebaseAuthEmail, // Renamed import
    updatePassword as updateFirebaseAuthPassword // Renamed import
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
    WriteBatch
} from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { safeToDate } from '@/lib/utils'; // Import safeToDate

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authError: string | null; // Changed from error to authError for clarity
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
  const [authError, setAuthError] = useState<string | null>(null); // Renamed state variable
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams(); // Hook to get search params

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

               // Construct the UserProfile object
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
                 createdAt: createdAt || new Date(0), // Use epoch if null
                 updatedAt: updatedAt || new Date(0), // Use epoch if null
                 lastPayoutRequestAt: lastPayoutRequestAt, // Can be null
                 payoutDetails: profileData.payoutDetails ?? null,
               };
                console.log(`AUTH: Profile fetched successfully for ${uid}.`);
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
       // Optionally refetch profile after update to ensure local state is sync
       const updatedProfile = await fetchUserProfile(uid);
       if (updatedProfile) {
         setUserProfile(updatedProfile); // Update local state
       }
        console.log(`AUTH: Profile data updated successfully for UID: ${uid}`);
     } catch (err) {
       console.error(`AUTH: Error updating profile data for ${uid}:`, err);
       throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
     }
  }, [fetchUserProfile]); // Include fetchUserProfile


   // Function to create or update user profile in Firestore, handling referrals
   const createOrUpdateUserProfile = useCallback(async (
     authUser: User,
     referredByCodeParam?: string | null // Allow passing referral code directly
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

     // Determine the referral code to use (parameter > URL search param)
     const potentialReferralCode = (referredByCodeParam ?? searchParams?.get('ref'))?.trim() || null;
     console.log(`AUTH: [Profile] Starting for UID: ${authUser.uid}. Potential Referral Code: "${potentialReferralCode}"`);

     const userDocRef = doc(db, 'users', authUser.uid);
     let referrerId: string | null = null; // Store only the ID

     // --- Find Referrer ID (if applicable) BEFORE the transaction ---
     if (potentialReferralCode) {
       console.log(`AUTH: [Profile] Searching for referrer with code: "${potentialReferralCode}"`);
       const usersRef = collection(db, 'users');
       const q = query(usersRef, where('referralCode', '==', potentialReferralCode), limit(1));
       try {
         const referrerSnap = await getDocs(q);
         if (!referrerSnap.empty) {
           const referrerDoc = referrerSnap.docs[0];
           if (referrerDoc.id !== authUser.uid) { // Prevent self-referral
             referrerId = referrerDoc.id;
             console.log(`AUTH: [Profile] Referrer ID found: ${referrerId}`);
           } else {
             console.warn(`AUTH: [Profile] User ${authUser.uid} tried to refer themselves. Ignoring code "${potentialReferralCode}".`);
           }
         } else {
           console.warn(`AUTH: [Profile] Referrer with code "${potentialReferralCode}" not found.`);
         }
       } catch (queryError) {
         console.error("AUTH: [Profile] Error querying referrer:", queryError);
         // Log but proceed without referral if query fails
       }
     } else {
       console.log("AUTH: [Profile] No referral code provided or found.");
     }

     // --- Firestore Transaction ---
     try {
       const profile = await runTransaction(db, async (transaction) => {
         console.log(`AUTH: [Transaction] Running for UID: ${authUser.uid}`);
         const docSnap = await transaction.get(userDocRef);
         let userProfileData: UserProfile;
         let isNewUser = false;

         if (docSnap.exists()) {
           // --- Update Existing User ---
           const existingData = docSnap.data() as UserProfile;
           console.log(`AUTH: [Transaction] Updating existing user: ${authUser.uid}. Current data:`, existingData);
           const updateData: Partial<UserProfile> = {
             displayName: authUser.displayName || existingData.displayName,
             photoURL: authUser.photoURL || existingData.photoURL,
             email: authUser.email || existingData.email, // Keep email consistent
             updatedAt: serverTimestamp(),
             // Preserve existing role, balances, referral info unless explicitly changing
           };
           transaction.update(userDocRef, updateData);
           // Use spread to create a new object representing the updated profile
           userProfileData = {
               ...existingData,
               ...updateData,
               // Explicitly carry over non-updated crucial fields
               role: existingData.role,
               cashbackBalance: existingData.cashbackBalance,
               pendingCashback: existingData.pendingCashback,
               lifetimeCashback: existingData.lifetimeCashback,
               referralCode: existingData.referralCode,
               referralCount: existingData.referralCount,
               referralBonusEarned: existingData.referralBonusEarned,
               referredBy: existingData.referredBy,
               isDisabled: existingData.isDisabled,
               createdAt: existingData.createdAt, // Preserve original createdAt
               lastPayoutRequestAt: existingData.lastPayoutRequestAt,
               payoutDetails: existingData.payoutDetails,
           };
           isNewUser = false;
           console.log(`AUTH: [Transaction] Existing user profile prepared for update.`);

         } else {
           // --- Create New User ---
           isNewUser = true;
           const referralCode = uuidv4().substring(0, 8).toUpperCase();
           console.log(`AUTH: [Transaction] Creating new user: ${authUser.uid}, Assigned Referral Code: ${referralCode}`);

           // Use the referrerId captured *before* the transaction
           const actualReferredById = referrerId; // This is the key fix
           console.log(`AUTH: [Transaction] Setting referredBy field to: ${actualReferredById}`);

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
             referredBy: actualReferredById, // **Set the correct referredBy ID here**
             isDisabled: false,
             createdAt: serverTimestamp(),
             updatedAt: serverTimestamp(),
             lastPayoutRequestAt: null,
             payoutDetails: null,
           };
           transaction.set(userDocRef, userProfileData);
           console.log(`AUTH: [Transaction] New user profile data prepared. Referred By ID: ${actualReferredById}`);
         }

         // --- Update Referrer Count (Only for NEW users with a VALID referrerId) ---
         if (isNewUser && referrerId) {
           console.log(`AUTH: [Transaction] New user was referred by ${referrerId}. Attempting to update referrer's count.`);
           const validReferrerRef = doc(db, 'users', referrerId); // Create doc ref inside transaction
           try {
             // Attempt to update the referrer document within the transaction
             transaction.update(validReferrerRef, {
               referralCount: increment(1),
               // IMPORTANT: Awarding bonus should happen later via Cloud Function
               // referralBonusEarned: increment(50), // Example - REMOVE if handled elsewhere
               updatedAt: serverTimestamp(),
             });
             console.log(`AUTH: [Transaction] Referrer count update prepared for: ${referrerId}`);
           } catch (referrerUpdateError) {
             console.error(`AUTH: [Transaction] Failed to prepare update for referrer ${referrerId} within transaction (might not exist or other issue):`, referrerUpdateError);
             // Decide how to handle:
             // Option 1: Allow signup to succeed, log the error (current behavior)
             // Option 2: Fail the entire transaction by re-throwing
             // throw referrerUpdateError;
           }
         } else if (isNewUser) {
           console.log("AUTH: [Transaction] New user, but no valid referrer ID found/captured before transaction. Skipping referrer update.");
         } else {
            console.log("AUTH: [Transaction] Existing user update. No referral count update needed.");
         }

         return userProfileData; // Return profile data from the transaction
       });

       // --- Convert Timestamps and Update State ---
       if (profile) {
         const finalProfile = { ...profile } as UserProfile; // Create mutable copy
         // Convert server timestamps to Dates for client-side state
         if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
         if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
         if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
         else finalProfile.lastPayoutRequestAt = null; // Ensure consistent type

         console.log(`AUTH: [Profile] Operation complete for ${authUser.uid}. Final Profile State:`, finalProfile);
         return finalProfile; // Return the processed profile
       } else {
         throw new Error("Profile creation/update transaction returned null.");
       }

     } catch (err) {
       console.error(`AUTH: [Profile] Error in profile transaction for ${authUser.uid}:`, err);
       setAuthError(err instanceof Error ? `Profile setup error: ${err.message}` : "Failed to set up profile.");
       return null;
     }
   }, [setAuthError, searchParams, fetchUserProfile, updateUserProfileData]);


  // Effect to listen for authentication state changes
  useEffect(() => {
    if (firebaseInitializationError) {
      setAuthError(firebaseInitializationError);
      setLoading(false);
      return;
    }
    if (!auth) {
      setAuthError("Authentication service not available.");
      setLoading(false);
      return;
    }

    console.log("AUTH: Setting up onAuthStateChanged listener...");
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      console.log("AUTH: Auth state changed. User:", authUser?.uid);
      setAuthError(null); // Clear previous errors on state change

      if (authUser) {
        setUser(authUser);
        try {
          // Fetch profile first
          let profile = await fetchUserProfile(authUser.uid);

          if (!profile) {
             console.log(`AUTH: Profile not found for ${authUser.uid} after login/state change, attempting creation/update...`);
             // Get referral code ONLY if creating profile right after signup via URL param
             // Avoid re-using old URL param on subsequent logins
             const isInitialSignIn = !user; // Heuristic: if local user state was null before this change
             const urlReferralCode = isInitialSignIn ? searchParams?.get('ref') : null;
             profile = await createOrUpdateUserProfile(authUser, urlReferralCode);
          } else {
             console.log(`AUTH: Profile fetched successfully after auth change for ${authUser.uid}`);
             // Optional: Check if authUser data (displayName, photoURL) differs from profile and update if needed
             if (
               profile.displayName !== authUser.displayName ||
               profile.photoURL !== authUser.photoURL
             ) {
               console.log(`AUTH: Auth profile data mismatch for ${authUser.uid}. Updating Firestore profile.`);
               await updateUserProfileData(authUser.uid, {
                 displayName: authUser.displayName,
                 photoURL: authUser.photoURL,
               });
                // Refetch profile to get the absolute latest state after update
               profile = await fetchUserProfile(authUser.uid);
             }
          }

          if (profile) {
             setUserProfile(profile);
          } else {
             console.error("AUTH: Failed to load or create profile for user:", authUser.uid);
             setAuthError("Failed to load or create user profile.");
             // Consider signing out if profile is mandatory & failed creation
             // await firebaseSignOut(auth);
             // setUser(null);
             // setUserProfile(null);
          }
        } catch (profileError) {
          console.error("AUTH: Error during profile fetch/create in onAuthStateChanged:", profileError);
          setAuthError(profileError instanceof Error ? profileError.message : "An error occurred loading profile data.");
          setUserProfile(null); // Clear profile on error
        } finally {
          setLoading(false);
        }
      } else {
        // User logged out
        console.log("AUTH: User signed out.");
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    },
    (error) => { // Error callback for onAuthStateChanged
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
  }, []); // Only run once on mount


  // Function to sign out the user
  const signOut = async () => {
    if (!auth) {
      setAuthError("Authentication service not available.");
      return;
    }
    console.log("AUTH: Signing out...");
    setLoading(true); // Indicate loading during sign out
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
      console.log("AUTH: Sign out successful.");
    } catch (error) {
      console.error('AUTH: Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false); // Ensure loading is false on error
    }
  };

  // Function to sign in with Google
  const signInWithGoogle = async () => {
    if (!auth) {
      setAuthError("Authentication service not available.");
      toast({ variant: "destructive", title: "Auth Error", description: "Authentication service failed." });
      return;
    }
    console.log("AUTH: Starting Google Sign-In...");
    setLoading(true); // Indicate loading during sign-in process
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    // Capture referral code *before* the popup flow starts
    const urlReferralCode = searchParams?.get('ref');
    console.log(`AUTH: Google Sign-In initiated. Referral code from URL (if any): ${urlReferralCode}`);

    try {
      const result = await signInWithPopup(auth, provider);
      const authUser = result.user;
      console.log("AUTH: Google Sign-In successful via popup for user:", authUser.uid);

      // Explicitly call createOrUpdateUserProfile *after* successful Google sign-in.
      // Pass the captured referral code.
      console.log(`AUTH: Triggering profile creation/update after Google sign-in for ${authUser.uid} with referral code: ${urlReferralCode}`);
      const profile = await createOrUpdateUserProfile(authUser, urlReferralCode);

      if (profile) {
        console.log(`AUTH: Profile setup complete after Google sign-in for ${authUser.uid}. Profile:`, profile);
        setUserProfile(profile); // Update local state immediately
        toast({ title: "Sign-In Successful", description: `Welcome, ${profile.displayName || 'User'}!` });
        // Redirect happens via onAuthStateChanged effect when user/profile state updates
      } else {
        // Handle profile creation/update failure after sign-in
        console.error(`AUTH: Profile setup failed after Google Sign-In for ${authUser.uid}`);
        throw new Error("Failed to setup profile after Google Sign-In.");
      }

    } catch (err) {
      console.error("AUTH: Google Sign-In or profile setup failed:", err);
      let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain'; // Get current domain

      // Firebase authentication error handling
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/popup-closed-by-user':
          case 'auth/cancelled-popup-request':
             errorMessage = "Sign-in cancelled. The Google sign-in window was closed.";
             console.log("AUTH: Google Sign-In popup closed by user.");
             break;
          case 'auth/popup-blocked':
             errorMessage = "Sign-in popup blocked. Please allow popups for this site and try again.";
             console.warn("AUTH: Google Sign-In popup blocked by browser.");
             break;
          case 'auth/unauthorized-domain':
             errorMessage = `Sign-in failed. This domain (${currentDomain}) is not authorized for Firebase Authentication. Please check your Firebase console settings.`;
             console.error(`AUTH: Unauthorized domain: ${currentDomain}`);
             break;
          case 'auth/internal-error':
             errorMessage = "An internal error occurred during sign-in. Please try again later.";
             console.error("AUTH: Internal Firebase error during sign-in.");
             break;
          case 'auth/network-request-failed':
             errorMessage = "Network error during sign-in. Please check your connection.";
             console.warn("AUTH: Network error during Google sign-in.");
             break;
          default:
             errorMessage = `Sign-in error (${err.code || 'unknown'}). Please try again.`;
             console.error(`AUTH: Unknown Firebase error during sign-in: ${err.code}`);
        }
      } else if (err instanceof Error) {
          // Capture errors potentially thrown from createOrUpdateUserProfile
          errorMessage = err.message;
          console.error(`AUTH: Error during profile setup after Google sign-in: ${err.message}`);
      }

      setAuthError(errorMessage);
      toast({
        variant: "destructive",
        title: 'Sign-In Failed',
        description: errorMessage,
        duration: 9000, // Increase duration slightly
      });
      setLoading(false); // Ensure loading stops on error
    }
    // Loading state is typically set back to false by the onAuthStateChanged handler
  };


  // Memoize the context value
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, userProfile, loading, authError, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData]); // Keep signOut, signInWithGoogle stable


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

    