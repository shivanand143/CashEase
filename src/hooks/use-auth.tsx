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
  authError: string | null;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  createOrUpdateUserProfile: (authUser: User, referredByCode?: string | null) => Promise<UserProfile | null>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  updateUserProfileData: (uid: string, data: Partial<UserProfile>) => Promise<void>;
  // Add reauthenticate function if needed elsewhere, otherwise keep it internal
  // reauthenticate: (password: string) => Promise<boolean>;
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
              const profileData = docSnap.data();
              // Convert timestamps safely
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
                createdAt: createdAt || new Date(0), // Fallback if conversion fails
                updatedAt: updatedAt || new Date(0), // Fallback if conversion fails
                lastPayoutRequestAt: lastPayoutRequestAt, // Keep as null if undefined/null
                payoutDetails: profileData.payoutDetails ?? null,
              };
              console.log(`Profile found for ${uid}:`, JSON.stringify(profile, null, 2));
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
  }, [setAuthError]);

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
  const createOrUpdateUserProfile = useCallback(async (
      authUser: User,
      referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
      if (!db) {
          console.error("Firestore not initialized for createOrUpdateUserProfile");
          setAuthError("Database connection error.");
          return null;
      }

      // Determine the referral code to use (parameter takes precedence over URL)
      const referredByCode = (referredByCodeParam ?? searchParams?.get('ref'))?.trim() || null; // Trim whitespace and default to null
      console.log(`[createOrUpdateUserProfile] Starting for UID: ${authUser.uid}. Referral code input: ${referredByCode}`);

      const userDocRef = doc(db, 'users', authUser.uid);
      let referrerRef: DocumentReference | null = null;
      let referrerId: string | null = null;

      // --- Step 1: Find Referrer (if applicable) - BEFORE the transaction ---
      if (referredByCode) {
          console.log(`[createOrUpdateUserProfile] Attempting to find referrer with code: "${referredByCode}"`);
          const usersRef = collection(db, 'users');
          // Ensure the query uses the trimmed code and is case-sensitive (Firestore default)
          const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));
          try {
              const referrerSnap = await getDocs(q);
              if (!referrerSnap.empty) {
                  const referrerDoc = referrerSnap.docs[0];
                  // IMPORTANT: Check if the referrer is the user themselves
                  if (referrerDoc.id === authUser.uid) {
                      console.warn(`[createOrUpdateUserProfile] User ${authUser.uid} tried to refer themselves. Ignoring referral.`);
                      // Set referrerRef to null to prevent self-referral processing
                      referrerRef = null;
                      referrerId = null;
                  } else {
                      referrerRef = doc(db, 'users', referrerDoc.id); // Store the reference
                      referrerId = referrerDoc.id; // Store the ID
                      console.log(`[createOrUpdateUserProfile] Referrer found: ${referrerId}`);
                  }
              } else {
                  console.warn(`[createOrUpdateUserProfile] Referrer with code "${referredByCode}" not found.`);
                  // No error, just proceed without a valid referrer
              }
          } catch (queryError) {
              console.error("[createOrUpdateUserProfile] Error querying referrer:", queryError);
              // Don't block signup, just log the referral issue
          }
      } else {
          console.log("[createOrUpdateUserProfile] No referral code provided.");
      }

      // --- Step 2: Run Firestore Transaction ---
      try {
          const profile = await runTransaction(db, async (transaction) => {
              const docSnap = await transaction.get(userDocRef);
              let userProfileData: UserProfile;
              let isNewUser = false;

              if (docSnap.exists()) {
                  // --- Update existing user ---
                  const existingData = docSnap.data() as UserProfile;
                  console.log(`[createOrUpdateUserProfile Transaction] Updating existing user: ${authUser.uid}`);
                  const updateData: Partial<UserProfile> = {
                      email: authUser.email || existingData.email,
                      displayName: authUser.displayName || existingData.displayName,
                      photoURL: authUser.photoURL || existingData.photoURL,
                      updatedAt: serverTimestamp(),
                      role: existingData.role ?? 'user', // Keep existing role
                      payoutDetails: existingData.payoutDetails ?? null, // Keep existing payout details
                      // DO NOT update referredBy on existing users
                  };
                  transaction.update(userDocRef, updateData);
                  userProfileData = { ...existingData, ...updateData } as UserProfile; // Base on existing
                  isNewUser = false;

              } else {
                  // --- Create new user ---
                  isNewUser = true;
                  const referralCode = uuidv4().substring(0, 8).toUpperCase();
                  console.log(`[createOrUpdateUserProfile Transaction] Creating new user: ${authUser.uid}, Referral Code: ${referralCode}`);
                  userProfileData = {
                      uid: authUser.uid,
                      email: authUser.email,
                      displayName: authUser.displayName,
                      photoURL: authUser.photoURL,
                      role: authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID ? 'admin' : 'user',
                      cashbackBalance: 0,
                      pendingCashback: 0,
                      lifetimeCashback: 0,
                      referralCode: referralCode,
                      referralCount: 0,
                      referralBonusEarned: 0,
                      // Set referredBy ONLY if a valid, non-self referrer was found
                      referredBy: referrerRef ? referredByCode : null,
                      isDisabled: false,
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp(),
                      lastPayoutRequestAt: null,
                      payoutDetails: null,
                  };
                  transaction.set(userDocRef, userProfileData);
                  console.log(`[createOrUpdateUserProfile Transaction] New user profile data prepared:`, JSON.stringify(userProfileData));
              }

              // --- Handle Referrer Update (only if NEW user AND a valid, non-self referrerRef was found) ---
              if (isNewUser && referrerRef && referrerId) { // Check referrerId as well
                  console.log(`[createOrUpdateUserProfile Transaction] Referrer found (${referrerId}), attempting to update referral count.`);
                  try {
                       // Fetch referrer data within the transaction to ensure consistency (optional but safer)
                       // const referrerDocSnap = await transaction.get(referrerRef);
                       // if (!referrerDocSnap.exists()) {
                       //     console.warn(`[createOrUpdateUserProfile Transaction] Referrer ${referrerId} disappeared during transaction.`);
                       //     // Handle this case if necessary (e.g., log, don't update)
                       // } else {
                            transaction.update(referrerRef, {
                                referralCount: increment(1),
                                // referralBonusEarned: increment(50), // BONUS LOGIC SHOULD BE HANDLED ELSEWHERE (Cloud Function)
                                updatedAt: serverTimestamp(),
                            });
                            console.log(`[createOrUpdateUserProfile Transaction] Update prepared for referrer: ${referrerId}`);
                       // }
                  } catch (referrerUpdateError) {
                       console.error(`[createOrUpdateUserProfile Transaction] Failed to update referrer ${referrerId}:`, referrerUpdateError);
                       // Decide if this should fail the entire transaction or just log
                       // For now, let's allow the user creation even if referrer update fails, but log it.
                       // Consider throwing the error if referrer update is critical: throw referrerUpdateError;
                  }
              } else if (isNewUser && !referrerRef) {
                   console.log("[createOrUpdateUserProfile Transaction] New user, but no valid referrer found or self-referral attempt.");
              }

              return userProfileData; // Return the profile data from transaction
          });

          // --- Step 3: Convert Timestamps and Return ---
          if (profile) {
              const finalProfile: UserProfile = { ...profile } as UserProfile;
              if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
              if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
              if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();

              console.log(`[createOrUpdateUserProfile] Profile operation complete for ${authUser.uid}.`);
              return finalProfile;
          } else {
              throw new Error("Profile creation/update transaction returned null or undefined.");
          }

      } catch (err) {
          console.error(`[createOrUpdateUserProfile] Error in profile transaction for ${authUser.uid}:`, err);
          setAuthError(err instanceof Error ? `Profile setup error: ${err.message}` : "Failed to set up profile.");
          return null;
      }
  }, [setAuthError, searchParams, fetchUserProfile]); // Added fetchUserProfile

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
              try {
                  // Fetch or create/update profile
                  let profile = await fetchUserProfile(authUser.uid);
                  if (!profile) {
                      // If profile doesn't exist, try creating it (might happen on first login)
                      console.log(`Profile not found for ${authUser.uid}, attempting to create/update...`);
                      // Get referral code from URL only during this initial creation attempt
                      const referredByCode = searchParams?.get('ref');
                      profile = await createOrUpdateUserProfile(authUser, referredByCode);
                  }
                  if (profile) {
                      setUserProfile(profile);
                  } else {
                      setAuthError("Failed to load or create user profile.");
                      // Optionally sign out the user if profile is critical
                      // await firebaseSignOut(auth);
                      // setUser(null);
                  }
              } catch (profileError) {
                   console.error("Error during profile fetch/create in onAuthStateChanged:", profileError);
                   setAuthError(profileError instanceof Error ? profileError.message : "An error occurred loading profile data.");
                   // Optionally sign out
              } finally {
                   setLoading(false); // Set loading false after profile attempt
              }
          } else {
              setUser(null);
              setUserProfile(null);
              setLoading(false); // Set loading false if no user
          }
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
  }, [fetchUserProfile, createOrUpdateUserProfile, searchParams]); // Ensure dependencies are correct

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
      // State updates (user=null, profile=null) are handled by onAuthStateChanged
      console.log("User signed out successfully.");
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push('/'); // Redirect after sign out
    } catch (error) { // Corrected catch block
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      // Ensure loading is set to false even on error
      // setLoading(false); // Let onAuthStateChanged handle loading state
    }
  };

 // Function to sign in with Google
 const signInWithGoogle = async () => {
    if (!auth) {
        setAuthError("Authentication service not available.");
        toast({ variant: "destructive", title: "Auth Error", description: "Authentication service failed." });
        return;
    }
    setLoading(true); // Indicate loading starts
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
             errorMessage = `Sign-in failed. This domain (${currentDomain}) is not authorized for Firebase Authentication. Please check your Firebase console settings.`;
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
     } else if (err instanceof Error) {
        // Handle generic errors
        errorMessage = err.message || "An unknown error occurred.";
     }

      setAuthError(errorMessage);
      toast({
        variant: "destructive",
        title: 'Sign-In Cancelled or Failed',
        description: errorMessage,
        duration: 7000, // Give slightly more time to read
      });
      setLoading(false); // Ensure loading is false on error
    }
    // No finally block needed for setLoading(false) if handled by onAuthStateChanged/error case
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
  }), [
      user,
      userProfile,
      loading,
      authError,
      signOut, // Include signOut
      signInWithGoogle, // Include signInWithGoogle
      createOrUpdateUserProfile,
      fetchUserProfile,
      updateUserProfileData
  ]);


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
      