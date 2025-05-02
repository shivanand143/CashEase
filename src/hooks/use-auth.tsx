// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useContext, createContext, ReactNode, useMemo, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup, // Import signInWithPopup
} from 'firebase/auth';
import { doc, onSnapshot, DocumentData, Timestamp, setDoc, serverTimestamp, getDoc, collection, addDoc } from 'firebase/firestore'; // Import setDoc and serverTimestamp
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config'; // Import error state
import type { UserProfile } from '@/lib/types';
import { useToast } from "@/hooks/use-toast"; // Import useToast
import { v4 as uuidv4 } from 'uuid'; // Import UUID for referral codes

// Check if Firebase services are available (handle potential initialization failure in config.ts)
const isFirebaseAvailable = !!auth && !!db && !firebaseInitializationError;
const googleProvider = new GoogleAuthProvider(); // Create a GoogleAuthProvider instance

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>; // Add signInWithGoogle method
  authError?: string | null; // Error related to auth state or profile loading
  initializationError?: string | null; // Error during Firebase init
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null); // Auth/profile specific errors
  const { toast } = useToast(); // Use toast for notifications

   // Function to generate a unique referral code
   const generateReferralCode = (): string => {
      // Simple example: Generate a random alphanumeric code
      // You might want a more robust generation/checking mechanism
      return uuidv4().substring(0, 8).toUpperCase();
   };

  // Function to create/update profile in Firestore (including referral logic)
  const createOrUpdateUserProfile = async (userToUpdate: User, referredByCode?: string | null) => {
    if (!userToUpdate) return;
    const userDocRef = doc(db, 'users', userToUpdate.uid);
    console.log(`Attempting to create/update profile for user: ${userToUpdate.uid}`);

    let referredByUid: string | null = null;

    // If referredByCode is provided, find the referrer's UID
    if (referredByCode) {
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          referredByUid = querySnapshot.docs[0].id;
          console.log(`Referrer found for code ${referredByCode}: User ID ${referredByUid}`);
        } else {
          console.warn(`Referral code ${referredByCode} not found.`);
        }
      } catch (error) {
        console.error("Error finding referrer by code:", error);
        // Proceed without referrer if lookup fails
      }
    }


    try {
      // Fetch existing data first if merging is important
      const docSnap = await getDoc(userDocRef);
      let existingData: Partial<UserProfile> = {};
      let isNewUser = !docSnap.exists(); // Check if this is a new Firestore user document

      if (docSnap.exists()) {
        existingData = docSnap.data() as Partial<UserProfile>;
        console.log("Existing profile data found for merge:", existingData);
      } else {
         console.log("No existing profile found, creating new one.");
      }

      // Prepare the data, prioritizing existing values for certain fields if needed
      const userProfileData: Partial<UserProfile> & { createdAt?: any, updatedAt: any } = {
        uid: userToUpdate.uid,
        email: userToUpdate.email ?? existingData.email ?? null,
        displayName: userToUpdate.displayName ?? existingData.displayName ?? null,
        photoURL: userToUpdate.photoURL ?? existingData.photoURL ?? null,
        role: existingData.role ?? 'user', // Keep existing role or default to 'user'
        cashbackBalance: existingData.cashbackBalance ?? 0,
        pendingCashback: existingData.pendingCashback ?? 0,
        lifetimeCashback: existingData.lifetimeCashback ?? 0,
        // Only set createdAt if document doesn't exist
        ...( isNewUser && { createdAt: serverTimestamp() } ),
        updatedAt: serverTimestamp(), // Always update updatedAt
         // Generate referral code only if it doesn't exist
         referralCode: existingData.referralCode ?? generateReferralCode(),
         // Set referredBy only if it's a new user and a valid referrer was found
         referredBy: isNewUser && referredByUid ? referredByUid : (existingData.referredBy ?? null),
      };

      // Use setDoc with merge: true to create or update
      await setDoc(userDocRef, userProfileData, { merge: true });
      console.log(`User profile successfully created/updated for ${userToUpdate.uid}`);

       // If a referrer was found and this is a new user, potentially credit the referrer
       if (isNewUser && referredByUid) {
           console.log(`TODO: Credit referrer ${referredByUid} for referring user ${userToUpdate.uid}`);
           // TODO: Implement referral bonus logic (e.g., add a pending transaction or directly credit balance)
            // Example: Add a transaction or notification for the referrer
            // const referralBonusAmount = 5; // Example bonus
            // const referrerDocRef = doc(db, 'users', referredByUid);
            // await updateDoc(referrerDocRef, {
            //     pendingCashback: increment(referralBonusAmount)
            // });
            // await addDoc(collection(db, 'transactions'), { ... referral transaction data ... });
       }

    } catch (error) {
        console.error(`Error creating/updating user profile for ${userToUpdate.uid}:`, error);
        // Optionally re-throw or set an error state
        throw error; // Re-throw to be caught by calling function
    }
  };


  useEffect(() => {
    console.log("AuthProvider mounted. Firebase Initialization Error:", firebaseInitializationError);

    if (firebaseInitializationError) {
        console.warn("Firebase initialization failed. Skipping auth listeners.");
        setAuthError(null); // Clear previous auth errors if any
        setLoading(false);
        return;
    }

    if (!isFirebaseAvailable) {
        const errorMsg = "Firebase services (auth/db) are not available. Skipping auth listeners.";
        console.warn(errorMsg);
        setAuthError(null);
        setLoading(false);
        return;
    }

    console.log("Firebase is available, setting up auth listener...");

    let unsubscribeProfile: () => void = () => {}; // Initialize with a no-op function

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("Auth state changed. User:", firebaseUser?.uid);
      setUser(firebaseUser);

      // Clean up previous profile listener before setting up a new one
      unsubscribeProfile();

      if (firebaseUser) {
        setLoading(true); // Start loading profile
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        console.log("Setting up profile listener for user:", firebaseUser.uid);

        unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          console.log("Profile snapshot received. Exists:", docSnap.exists());
          if (docSnap.exists()) {
            const data = docSnap.data() as DocumentData;
            // Convert Firestore Timestamp to JS Date safely
            const createdAtDate = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
            const updatedAtDate = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : createdAtDate; // Use createdAt as fallback

            const profileData: UserProfile = {
              uid: docSnap.id,
              email: data.email ?? null,
              displayName: data.displayName ?? null,
              photoURL: data.photoURL ?? null,
              role: data.role ?? 'user',
              cashbackBalance: data.cashbackBalance ?? 0,
              pendingCashback: data.pendingCashback ?? 0,
              lifetimeCashback: data.lifetimeCashback ?? 0,
              referralCode: data.referralCode ?? null, // Handle undefined/null from DB
              referredBy: data.referredBy ?? null, // Handle undefined/null from DB
              createdAt: createdAtDate,
              updatedAt: updatedAtDate,
            };
            setUserProfile(profileData);
            setAuthError(null); // Clear any previous auth/profile error
          } else {
            console.warn("User profile not found in Firestore for UID:", firebaseUser.uid);
             // Attempt to create profile if it doesn't exist
             createOrUpdateUserProfile(firebaseUser).catch(err => {
                console.error("Failed to automatically create profile for existing auth user:", err);
                setAuthError("Failed to load or create user profile.");
             });
            setUserProfile(null);
          }
          setLoading(false); // Profile loaded or creation attempted
        }, (error) => {
          console.error("Error in profile snapshot listener:", error);
          setUserProfile(null);
          setAuthError(`Error loading profile: ${error.message}`);
          setLoading(false);
        });

      } else {
        // User is signed out
        console.log("User signed out.");
        setUserProfile(null);
        setLoading(false);
        setAuthError(null); // Clear auth/profile error on sign out
      }
    }, (error) => {
        // Handle errors from onAuthStateChanged itself
        console.error("Error in onAuthStateChanged listener:", error);
        setUser(null);
        setUserProfile(null);
        setAuthError(`Authentication error: ${error.message}`);
        setLoading(false);
    });

    // Cleanup function for auth listener
    return () => {
      console.log("Cleaning up auth listener.");
      unsubscribeAuth();
      // Also ensure the profile listener is cleaned up when the component unmounts
      console.log("Cleaning up profile listener on unmount.");
      unsubscribeProfile();
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount


  const signInWithGoogle = useCallback(async () => {
      if (!isFirebaseAvailable) {
        console.error("Cannot sign in with Google, Firebase auth is not initialized or available.");
        setAuthError("Firebase not available. Cannot sign in.");
        toast({ variant: "destructive", title: "Error", description: "Authentication service not available." });
        return;
      }
      setLoading(true);
      setAuthError(null);

       // Check for referral code in URL before sign-in attempt
        let referredByCode: string | null = null;
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            referredByCode = urlParams.get('ref');
        }


      try {
        const result = await signInWithPopup(auth, googleProvider);
        const googleUser = result.user;
        console.log("Google Sign-In successful for user:", googleUser.uid);

        // Create or update user profile in Firestore, passing referral code if found
        await createOrUpdateUserProfile(googleUser, referredByCode);

        toast({ title: "Signed In", description: `Welcome, ${googleUser.displayName || googleUser.email}!` });
        // Redirect is handled by the page component after successful state update

      } catch (error: any) {
        console.error("Error signing in with Google:", error);
        // Handle specific errors (e.g., popup closed, network error)
        let message = "Failed to sign in with Google.";
        if (error.code) {
            switch (error.code) {
                case 'auth/popup-closed-by-user':
                    message = 'Sign-in cancelled. Please try again.';
                    break;
                case 'auth/account-exists-with-different-credential':
                    message = 'An account already exists with this email. Try signing in with your original method.';
                    break;
                 case 'auth/network-request-failed':
                      message = 'Network error during sign-in. Please check your connection.';
                      break;
                // Add other specific error codes as needed
                default:
                    message = `Google Sign-In failed (${error.code}).`;
            }
        }
        setAuthError(message);
        toast({ variant: "destructive", title: "Sign-In Failed", description: message });
      } finally {
        // setLoading(false); // Loading state is managed by onAuthStateChanged listener
      }
  }, [toast]); // Added toast to dependency array

  const signOut = useCallback(async () => {
     if (!isFirebaseAvailable) {
       console.error("Cannot sign out, Firebase auth is not initialized or available.");
       setAuthError("Firebase not available. Cannot sign out.");
       return;
     }
    console.log("Signing out...");
    setLoading(true); // Indicate loading during sign out
    try {
      await firebaseSignOut(auth);
      console.log("Sign out successful via hook call.");
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
    } catch (error) { // Correct catch block syntax
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: "Sign Out Error", description: errorMsg });
    } finally {
       // setLoading(false); // Handled by listener
    }
  }, [toast]); // Added toast

  // Memoize the context value to prevent unnecessary re-renders
  const authContextValue = useMemo(() => ({
      user,
      userProfile,
      loading,
      signOut,
      signInWithGoogle, // Include the new method
      authError, // Auth/profile errors
      initializationError: firebaseInitializationError // Pass init error down
  }), [user, userProfile, loading, signOut, signInWithGoogle, authError]);

  // Provide the authentication context to children components
  // Ensure correct JSX syntax
  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
