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
import { doc, onSnapshot, DocumentData, Timestamp, setDoc, serverTimestamp, getDoc, collection, query, where, limit, getDocs, updateDoc, increment } from 'firebase/firestore'; // Added updateDoc, increment
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
  createOrUpdateUserProfile: (userToUpdate: User & { role?: 'admin' | 'user' }, referredByCode?: string | null) => Promise<void>; // Expose profile creation function
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
      return uuidv4().substring(0, 8).toUpperCase();
   };

  // Function to create/update profile in Firestore (including referral logic)
  const createOrUpdateUserProfile = useCallback(async (userToUpdate: User & { role?: 'admin' | 'user' }, referredByCode?: string | null) => {
    if (!userToUpdate || !db) {
        console.error("User or Firestore DB instance is null, cannot create/update profile.");
        return;
    }
    const userDocRef = doc(db, 'users', userToUpdate.uid);
    console.log(`Attempting to create/update profile for user: ${userToUpdate.uid}`);

    let referredByUid: string | null = null;
    let referrerDocRef: any = null; // Store referrer doc ref
    let canUpdateReferrerCount = false; // Flag to ensure we only update if it's a new user being referred

    try {
      const docSnap = await getDoc(userDocRef);
      let existingData: Partial<UserProfile> = {};
      let isNewUserDocument = !docSnap.exists(); // Check if this is a new Firestore user document

      if (docSnap.exists()) {
        existingData = docSnap.data() as Partial<UserProfile>;
        console.log("Existing profile data found for merge:", existingData);
      } else {
         console.log("No existing profile found, creating new one.");
      }

      // Determine referrer UID only if it's a new document and a code is provided
      if (isNewUserDocument && referredByCode) {
         console.log(`New user document, checking referral code: ${referredByCode}`);
         try {
           const usersRef = collection(db, 'users');
           const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));
           const querySnapshot = await getDocs(q);
           if (!querySnapshot.empty) {
             const referrerDoc = querySnapshot.docs[0];
             // IMPORTANT: Prevent self-referral
             if (referrerDoc.id !== userToUpdate.uid) {
                 referredByUid = referrerDoc.id;
                 referrerDocRef = referrerDoc.ref; // Get the DocumentReference
                 canUpdateReferrerCount = true; // Okay to update count
                 console.log(`Referrer found for code ${referredByCode}: User ID ${referredByUid}`);
             } else {
                 console.warn(`User ${userToUpdate.uid} attempted self-referral with code ${referredByCode}. Ignoring.`);
             }
           } else {
             console.warn(`Referral code ${referredByCode} not found or invalid.`);
           }
         } catch (error) {
           console.error("Error finding referrer by code:", error);
         }
      }


       const roleToSet = userToUpdate.role ?? existingData.role ?? 'user';

      // Ensure default values for cashback and referralCount are set if missing
      const userProfileData: Omit<UserProfile, 'uid'> & { createdAt?: any, updatedAt?: any } = {
        email: userToUpdate.email ?? existingData.email ?? null,
        displayName: userToUpdate.displayName ?? existingData.displayName ?? 'User',
        photoURL: userToUpdate.photoURL ?? existingData.photoURL ?? null,
        role: roleToSet,
        cashbackBalance: existingData.cashbackBalance ?? 0,
        pendingCashback: existingData.pendingCashback ?? 0,
        lifetimeCashback: existingData.lifetimeCashback ?? 0,
        referralCode: existingData.referralCode || generateReferralCode(), // Assign if missing
        referralCount: existingData.referralCount ?? 0, // Default to 0
         // Set referredBy only if it's a new user and a valid referrer was found
         referredBy: isNewUserDocument && referredByUid ? referredByUid : (existingData.referredBy ?? null),
         isDisabled: existingData.isDisabled ?? false,
         ...(isNewUserDocument && { createdAt: serverTimestamp() }), // Set createdAt only if truly new document
         updatedAt: serverTimestamp(),
      };

      // Ensure we don't overwrite createdAt if merging
      if (!isNewUserDocument) {
        delete userProfileData.createdAt;
      }

      // Create or update the user's profile
      await setDoc(userDocRef, userProfileData, { merge: true });
      console.log(`User profile successfully created/updated for ${userToUpdate.uid}`);

       // Increment referrer's count ONLY if it's a new user being referred by someone else
       if (canUpdateReferrerCount && referrerDocRef) {
           try {
               // IMPORTANT: This is a client-side update. For better security and reliability,
               // this should ideally be handled by a Cloud Function triggered by user creation.
               await updateDoc(referrerDocRef, {
                   referralCount: increment(1)
               });
               console.log(`Incremented referral count for referrer ${referredByUid}.`);
           } catch (incrementError) {
               console.error(`Failed to increment referral count for referrer ${referredByUid}:`, incrementError);
               // Decide how to handle this error (e.g., log, retry later?)
           }
       }

    } catch (error) {
        console.error(`Error creating/updating user profile for ${userToUpdate.uid}:`, error);
        throw error; // Re-throw to be caught by calling function
    }
  }, []); // Added dependency array for useCallback


  useEffect(() => {
    console.log("AuthProvider mounted. Firebase Available:", isFirebaseAvailable, "Initialization Error:", firebaseInitializationError);

    if (!isFirebaseAvailable || firebaseInitializationError) {
        const errorMsg = firebaseInitializationError || "Firebase services (auth/db) are not available. Skipping auth listeners.";
        console.warn(errorMsg);
        setAuthError(null); // Clear previous auth errors
        setLoading(false);
        return; // Stop execution if Firebase is not ready
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
             console.log("Raw profile data from Firestore:", data); // Log raw data
             // Helper function to safely convert Firestore Timestamps or existing Dates
              const safeToDate = (fieldValue: any): Date | null => {
                  if (fieldValue instanceof Timestamp) {
                      return fieldValue.toDate();
                  } else if (fieldValue instanceof Date) {
                      return fieldValue;
                  }
                   // Return null if the field is missing or not a valid date type
                   return null;
              };

             const createdAtDate = safeToDate(data.createdAt);
             const updatedAtDate = safeToDate(data.updatedAt);

             if (!createdAtDate) {
                 console.warn(`User ${docSnap.id} has missing or invalid createdAt field.`);
             }

            const profileData: UserProfile = {
              uid: docSnap.id,
              email: data.email ?? null,
              displayName: data.displayName ?? firebaseUser.displayName ?? 'User', // Prioritize Firestore, then auth, then default
              photoURL: data.photoURL ?? firebaseUser.photoURL ?? null, // Prioritize Firestore, then auth
              role: data.role ?? 'user',
              cashbackBalance: typeof data.cashbackBalance === 'number' ? data.cashbackBalance : 0,
              pendingCashback: typeof data.pendingCashback === 'number' ? data.pendingCashback : 0,
              lifetimeCashback: typeof data.lifetimeCashback === 'number' ? data.lifetimeCashback : 0,
              referralCode: data.referralCode ?? '', // Default to empty string if null/undefined
              referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0, // Default to 0
              referredBy: data.referredBy ?? null, // Handle undefined/null from DB
              isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false, // Handle isDisabled field, default false
              createdAt: createdAtDate || new Date(0), // Use fallback if null
              updatedAt: updatedAtDate || createdAtDate || new Date(0), // Use fallback if null
            };
            console.log("Processed profile data:", profileData); // Log processed data
            setUserProfile(profileData);
            setAuthError(null); // Clear any previous auth/profile error
          } else {
            console.warn("User profile not found in Firestore for UID:", firebaseUser.uid, "Attempting to create profile...");
             // Attempt to create profile if it doesn't exist
             createOrUpdateUserProfile(firebaseUser)
               .then(() => console.log("Profile auto-creation successful after snapshot miss."))
               .catch(err => {
                   console.error("Failed to automatically create profile for existing auth user:", err);
                   setAuthError("Failed to load or create user profile.");
                   setUserProfile(null); // Ensure profile is null if creation fails
               });
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
  }, [createOrUpdateUserProfile]); // Add createOrUpdateUserProfile to dependencies


  const signInWithGoogle = useCallback(async () => {
      if (!isFirebaseAvailable || !auth) {
        const errorMsg = "Cannot sign in with Google, Firebase auth is not initialized or available.";
        console.error(errorMsg);
        setAuthError(errorMsg);
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
            console.log("Referral code from URL:", referredByCode);
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
  }, [toast, createOrUpdateUserProfile]); // Added toast and createOrUpdateUserProfile

  const signOut = useCallback(async () => {
     if (!isFirebaseAvailable || !auth) {
       const errorMsg = "Cannot sign out, Firebase auth is not initialized or available.";
       console.error(errorMsg);
       setAuthError(errorMsg);
       return;
     }
    console.log("Signing out...");
    setLoading(true); // Indicate loading during sign out
    try {
      await firebaseSignOut(auth);
      console.log("Sign out successful via hook call.");
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
    } catch (error) { // Catch any error
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
      createOrUpdateUserProfile, // Expose the profile function
      authError, // Auth/profile errors
      initializationError: firebaseInitializationError // Pass init error down
  }), [user, userProfile, loading, signOut, signInWithGoogle, createOrUpdateUserProfile, authError]);

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
