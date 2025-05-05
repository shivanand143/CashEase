// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useMemo,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithPopup,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { FirebaseError } from 'firebase/app';

// Define the shape of the context
interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null; // Renamed from authError for clarity
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  updateUserProfileData: (uid: string, data: Partial<UserProfile>) => Promise<void>;
  createOrUpdateUserProfile: (authUser: User, referredByCode?: string | null) => Promise<UserProfile | null>;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Combined loading state
  const [error, setError] = useState<string | null>(null); // Combined error state
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams(); // For getting referral code from URL

  // --- Profile Management ---

  // Function to fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    if (!db) {
      console.error("Firestore not initialized. Cannot fetch profile.");
      setError("Database connection error. Profile unavailable.");
      return null;
    }
    console.log(`Fetching profile for UID: ${uid}`);
    const userDocRef = doc(db, 'users', uid);
    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const profileData = docSnap.data() as UserProfile;
        // Convert Firestore Timestamps to JS Dates
        profileData.createdAt = profileData.createdAt instanceof Timestamp ? profileData.createdAt.toDate() : new Date();
        profileData.updatedAt = profileData.updatedAt instanceof Timestamp ? profileData.updatedAt.toDate() : new Date();
        profileData.lastPayoutRequestAt = profileData.lastPayoutRequestAt instanceof Timestamp ? profileData.lastPayoutRequestAt.toDate() : null;
        console.log(`Profile found for UID: ${uid}`, profileData);
        return profileData;
      } else {
        console.log(`No profile found for UID: ${uid}`);
        return null;
      }
    } catch (err) {
      console.error(`Error fetching user profile for ${uid}:`, err);
      setError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch profile.");
      return null;
    }
  }, []);

  // Function to update user profile data in Firestore
  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>): Promise<void> => {
    if (!db) {
      console.error("Firestore not initialized. Cannot update profile.");
      throw new Error("Database connection error.");
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      await updateDoc(userDocRef, {
        ...data,
        updatedAt: serverTimestamp(), // Always update the timestamp
      });
      console.log(`Profile updated successfully for UID: ${uid}`);
      // Optionally re-fetch profile after update to refresh context state
      // const updatedProfile = await fetchUserProfile(uid);
      // if (updatedProfile) setUserProfile(updatedProfile);
    } catch (err) {
      console.error(`Error updating user profile for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile.");
    }
  }, []);

  // Function to create or update user profile in Firestore on signup/login
  const createOrUpdateUserProfile = useCallback(async (authUser: User, referredByCode: string | null = null): Promise<UserProfile | null> => {
    if (!db) {
      console.error("Firestore not initialized. Cannot create/update profile.");
      setError("Database connection error. Profile operation failed.");
      return null;
    }
    console.log(`Creating/updating profile for UID: ${authUser.uid}`);
    const userDocRef = doc(db, 'users', authUser.uid);
    try {
      const docSnap = await getDoc(userDocRef);
      let userProfileData: UserProfile;

      if (docSnap.exists()) {
        // --- Update existing user ---
        console.log(`Profile exists for ${authUser.uid}. Updating...`);
        const existingData = docSnap.data() as UserProfile;
        userProfileData = {
          ...existingData, // Keep existing data
          uid: authUser.uid,
          email: authUser.email || existingData.email,
          displayName: authUser.displayName || existingData.displayName || 'New User', // Use existing if available
          photoURL: authUser.photoURL || existingData.photoURL,
          updatedAt: serverTimestamp(),
           // Ensure payoutDetails is preserved or initialized correctly
           payoutDetails: existingData.payoutDetails ?? null,
          // Don't overwrite referral info on subsequent logins unless explicitly needed
        };
        await updateDoc(userDocRef, {
            email: userProfileData.email,
            displayName: userProfileData.displayName,
            photoURL: userProfileData.photoURL,
            updatedAt: serverTimestamp(),
            payoutDetails: userProfileData.payoutDetails // Ensure payoutDetails is included in the update
        });
      } else {
        // --- Create new user ---
        console.log(`Creating new profile for ${authUser.uid}. Referral code used: ${referredByCode}`);
        // Basic structure for a new user profile
        userProfileData = {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || 'New User',
          photoURL: authUser.photoURL,
          role: 'user', // Default role
          cashbackBalance: 0,
          pendingCashback: 0,
          lifetimeCashback: 0,
          referralCode: uuidv4().substring(0, 8).toUpperCase(), // Generate unique referral code
          referralCount: 0,
          referralBonusEarned: 0,
          referredBy: referredByCode || null, // Store who referred them
          isDisabled: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastPayoutRequestAt: null,
           payoutDetails: null, // Initialize payoutDetails as null for new users
        };
         // Use setDoc for creating a new document with a specific ID
         await setDoc(userDocRef, userProfileData);

        // --- Handle Referral ---
        if (referredByCode) {
          console.log(`Attempting to credit referrer with code: ${referredByCode}`);
          // Find the referrer by their code (requires an index on referralCode)
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));
          const referrerSnap = await getDocs(q);

          if (!referrerSnap.empty) {
            const referrerDoc = referrerSnap.docs[0];
            const referrerProfile = referrerDoc.data() as UserProfile;
            const referrerRef = doc(db, 'users', referrerDoc.id);
            // Increment referrer's count and bonus (example bonus: ₹50)
            const referralBonusAmount = 50; // Example bonus amount
            try {
               await updateDoc(referrerRef, {
                 referralCount: (referrerProfile.referralCount || 0) + 1,
                 // Note: Actual bonus might depend on referred user's actions (e.g., first purchase)
                 // This might need a Cloud Function trigger later
                 referralBonusEarned: (referrerProfile.referralBonusEarned || 0) + referralBonusAmount, // Example immediate bonus
                 updatedAt: serverTimestamp(),
               });
               console.log(`Successfully updated referrer ${referrerDoc.id} stats.`);
               // Optionally, credit the new user with a signup bonus for being referred
               // await updateDoc(userDocRef, { cashbackBalance: (userProfileData.cashbackBalance || 0) + signupBonus });
            } catch (referrerUpdateError) {
                 console.error(`Failed to update referrer ${referrerDoc.id}:`, referrerUpdateError);
                 // Decide how to handle this - log, retry, etc.
            }
          } else {
            console.warn(`Referrer with code ${referredByCode} not found.`);
          }
        }
      }
       // Return the created/updated profile data (convert server timestamps for client use)
      const finalProfile = { ...userProfileData };
       if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
       if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
       if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();

       console.log(`Profile operation complete for ${authUser.uid}. Final profile data:`, finalProfile);
       return finalProfile;

    } catch (err) {
      console.error(`Error creating/updating profile for ${authUser.uid}:`, err);
      setError(err instanceof Error ? `Profile setup error: ${err.message}` : "Failed to set up profile.");
      return null;
    }
  }, []); // Add db dependency if necessary


  // --- Authentication Actions ---

  // Google Sign-In Handler
  const signInWithGoogle = useCallback(async (): Promise<void> => {
    if (!auth) {
      console.error("Auth service not available for Google Sign-In.");
      setError("Authentication service not available.");
      toast({ variant: "destructive", title: 'Error', description: "Authentication service failed." });
      return;
    }
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const authUser = result.user;
      console.log("Google Sign-In successful. User:", authUser.uid);

      // Check for referral code in URL *before* creating/updating profile
       const referralCodeFromUrl = searchParams.get('ref');
       console.log("Google Sign-In: Referral code from URL:", referralCodeFromUrl);

      // Create or update profile immediately after successful sign-in
      const profile = await createOrUpdateUserProfile(authUser, referralCodeFromUrl);

      if (profile) {
        setUser(authUser); // Update user state
        setUserProfile(profile); // Update profile state
        toast({ title: 'Login Successful', description: `Welcome, ${profile.displayName || 'User'}!` });
        router.push('/dashboard'); // Redirect on successful login/signup
      } else {
         // Handle profile creation/update failure
         throw new Error("Failed to set up user profile after Google Sign-In.");
      }

    } catch (err: unknown) {
      console.error('Google Sign-In Error:', err);
      let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain'; // Get current domain

      // Firebase authentication error handling
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/popup-closed-by-user':
             errorMessage = "Sign-in cancelled. The Google Sign-In popup was closed before completing.";
            break;
          case 'auth/cancelled-popup-request':
             errorMessage = "Sign-in cancelled. Multiple popup requests were made.";
            break;
          case 'auth/popup-blocked':
            errorMessage = "Sign-in popup blocked. Please allow popups for this site and try again.";
            break;
          case 'auth/unauthorized-domain':
             errorMessage = `This domain (${currentDomain}) is not authorized for Firebase Authentication. Please contact support.`;
             console.warn(`Unauthorized domain: ${currentDomain}. Add it to Firebase Auth settings.`);
             break;
           case 'auth/operation-not-allowed':
              errorMessage = "Google Sign-In is not enabled for this application. Please contact support.";
              break;
           case 'auth/network-request-failed':
              errorMessage = "Network error during sign-in. Please check your internet connection.";
              break;
          case 'auth/internal-error':
              errorMessage = "An internal Firebase error occurred. Please try again later.";
              break;
          default:
           errorMessage = `An error occurred (${err.code || 'unknown'}). Please try again.`;
       }
     }

      setError(errorMessage); // Use setAuthError for auth-related issues
      toast({
        variant: "destructive",
        title: 'Sign-In Cancelled or Failed',
        description: errorMessage,
        duration: 9000, // Increase duration slightly
      });
    } finally {
      setLoading(false);
    }
  }, [auth, createOrUpdateUserProfile, router, toast, searchParams]);

  // Sign Out Handler
  const signOut = useCallback(async (): Promise<void> => {
    if (!auth) {
      console.error("Auth service not available for Sign Out.");
      setError("Authentication service not available.");
      toast({ variant: "destructive", title: 'Error', description: "Authentication service failed." });
      return;
    }
    setLoading(true); // Indicate loading during sign out
    setError(null);
    try {
      await firebaseSignOut(auth);
      // Clear local state immediately for faster UI update
      setUser(null);
      setUserProfile(null);
      console.log("Sign out successful.");
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
    } catch (err) { // Catch specific errors
      console.error('Error signing out:', err);
      const errorMsg = `Sign out error: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Error', description: errorMsg });
    } finally {
       setLoading(false); // Ensure loading is set to false even on error
    }
  }, [auth, toast]); // Added toast

  // --- Auth State Listener ---
  useEffect(() => {
    if (firebaseInitializationError) {
      setError(`Firebase Error: ${firebaseInitializationError}`);
      setLoading(false);
      return () => {}; // No need to unsubscribe if init failed
    }
    if (!auth) {
      console.warn("AuthProvider: Auth service not available, skipping listener setup.");
       setError("Authentication service failed to initialize.");
      setLoading(false);
      return () => {};
    }

    console.log("AuthProvider: Setting up onAuthStateChanged listener.");
    setLoading(true);

    let isMounted = true; // Track component mount state

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
        console.log("onAuthStateChanged triggered. Auth User:", authUser?.uid || "null");
        setError(null); // Reset errors on each auth state change

        if (!isMounted) {
            console.log("AuthProvider: Component unmounted during auth state change. Aborting update.");
            return; // Prevent state updates if unmounted
        }

        if (authUser) {
            setUser(authUser);
            const profile = await fetchUserProfile(authUser.uid);
            if (isMounted) { // Check mount state again before setting profile
                if (profile) {
                    setUserProfile(profile);
                    console.log("AuthProvider: User authenticated and profile loaded.");
                } else {
                    // This case should ideally be handled by createOrUpdateUserProfile on login/signup
                    console.warn(`AuthProvider: User ${authUser.uid} authenticated but profile fetch returned null.`);
                     // Attempt to create profile if missing (could happen in rare edge cases)
                    // const newProfile = await createOrUpdateUserProfile(authUser);
                    // if (newProfile && isMounted) setUserProfile(newProfile);
                     setUserProfile(null); // Set profile to null if fetch failed after login
                }
                setLoading(false);
            }
        } else {
            // User is signed out
             if (isMounted) {
                 setUser(null);
                 setUserProfile(null);
                 setLoading(false);
                 console.log("AuthProvider: User signed out.");
             }
        }
      },
      // Error handler for the listener itself
      (listenerError) => {
        console.error("onAuthStateChanged listener error:", listenerError);
         if (isMounted) {
             setError(`Auth listener error: ${listenerError.message}`);
             setUser(null);
             setUserProfile(null);
             setLoading(false);
         }
      }
    );

    // Cleanup function
    return () => {
      console.log("AuthProvider: Cleaning up onAuthStateChanged listener.");
      isMounted = false; // Mark as unmounted
      unsubscribe();
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserProfile, createOrUpdateUserProfile]); // Dependencies: stable functions

  // Memoize the context value to prevent unnecessary re-renders
  const authContextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    error,
    signInWithGoogle,
    signOut,
    fetchUserProfile,
    updateUserProfileData,
    createOrUpdateUserProfile,
  }), [
    user,
    userProfile,
    loading,
    error,
    signInWithGoogle,
    signOut,
    fetchUserProfile,
    updateUserProfileData,
    createOrUpdateUserProfile,
  ]);

  // Provide the authentication context to children components
  // Ensure correct JSX syntax
  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
