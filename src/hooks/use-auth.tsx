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
import { doc, onSnapshot, DocumentData, Timestamp, setDoc, serverTimestamp, getDoc, collection, query, where, limit, getDocs, updateDoc, increment, runTransaction } from 'firebase/firestore'; // Added updateDoc, increment, runTransaction
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
  createOrUpdateUserProfile: (userToUpdate: User & { role?: 'admin' | 'user' }, referredByCode?: string | null) => Promise<void>; // Expose for admin actions
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>; // Add function to fetch profile
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

   // Internal function to create/update profile, handles referral atomically
    const createOrUpdateUserProfile = useCallback(async (userToUpdate: User & { role?: 'admin' | 'user' }, referredByCode?: string | null) => {
        if (!userToUpdate || !db) {
            console.error("User or Firestore DB instance is null, cannot create/update profile.");
            return;
        }
        const userDocRef = doc(db, 'users', userToUpdate.uid);
        console.log(`Attempting to create/update profile for user: ${userToUpdate.uid}`);

        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(userDocRef);
                let existingData: Partial<UserProfile> = {};
                let isNewUserDocument = !docSnap.exists();

                if (docSnap.exists()) {
                    existingData = docSnap.data() as Partial<UserProfile>;
                    console.log("Existing profile data found for merge:", existingData);
                } else {
                    console.log("No existing profile found, creating new one.");
                }

                let referredByUid: string | null = null;
                let referrerDocRef: any = null;
                let canUpdateReferrerCount = false;

                // Find referrer ONLY if it's a new document and a valid code is provided
                if (isNewUserDocument && referredByCode) {
                    console.log(`New user document, checking referral code: ${referredByCode}`);
                    const usersRef = collection(db, 'users');
                    const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));
                    const querySnapshot = await getDocs(q); // Use getDocs, not transaction.get for query

                    if (!querySnapshot.empty) {
                        const referrerDoc = querySnapshot.docs[0];
                        if (referrerDoc.id !== userToUpdate.uid) { // Prevent self-referral
                            referredByUid = referrerDoc.id;
                            referrerDocRef = doc(db, 'users', referredByUid); // Get DocumentReference for transaction update
                            canUpdateReferrerCount = true;
                            console.log(`Referrer found for code ${referredByCode}: User ID ${referredByUid}`);
                        } else {
                            console.warn(`User ${userToUpdate.uid} attempted self-referral with code ${referredByCode}. Ignoring.`);
                        }
                    } else {
                        console.warn(`Referral code ${referredByCode} not found or invalid.`);
                    }
                }

                const roleToSet = userToUpdate.role ?? existingData.role ?? 'user';

                const userProfileData: Omit<UserProfile, 'uid'> & { createdAt?: any, updatedAt?: any } = {
                    email: userToUpdate.email ?? existingData.email ?? null,
                    displayName: userToUpdate.displayName ?? existingData.displayName ?? 'User',
                    photoURL: userToUpdate.photoURL ?? existingData.photoURL ?? null,
                    role: roleToSet,
                    cashbackBalance: existingData.cashbackBalance ?? 0,
                    pendingCashback: existingData.pendingCashback ?? 0,
                    lifetimeCashback: existingData.lifetimeCashback ?? 0,
                    referralCode: existingData.referralCode || generateReferralCode(),
                    referralCount: existingData.referralCount ?? 0,
                    referredBy: isNewUserDocument && referredByUid ? referredByUid : (existingData.referredBy ?? null),
                    isDisabled: existingData.isDisabled ?? false,
                    createdAt: existingData.createdAt || serverTimestamp(), // Ensure createdAt is only set once
                    updatedAt: serverTimestamp(),
                };

                // Remove createdAt if updating an existing document
                if (!isNewUserDocument) {
                    delete userProfileData.createdAt;
                }

                // Perform writes within the transaction
                transaction.set(userDocRef, userProfileData, { merge: true });
                console.log(`User profile successfully staged for create/update for ${userToUpdate.uid}`);

                // Increment referrer's count ONLY if conditions met
                if (canUpdateReferrerCount && referrerDocRef) {
                    transaction.update(referrerDocRef, { referralCount: increment(1) });
                    console.log(`Referrer count increment staged for ${referredByUid}.`);
                }
            }); // Transaction commits here

            console.log(`Transaction for user ${userToUpdate.uid} profile successful.`);

        } catch (error) {
            console.error(`Transaction failed for user profile ${userToUpdate.uid}:`, error);
            // Propagate error for handling in calling functions (like signup/login)
            throw error;
        }
    }, []); // Empty dependency array as it relies on args and has no external deps



  // Helper function to map Firestore data to UserProfile
  const mapFirestoreDataToProfile = (docSnap: DocumentData): UserProfile => {
       const data = docSnap.data()!; // Assert data exists
       const safeToDate = (fieldValue: any): Date | null => {
           if (fieldValue instanceof Timestamp) return fieldValue.toDate();
           if (fieldValue instanceof Date) return fieldValue;
           // Handle potential invalid date values if necessary
           if (typeof fieldValue === 'object' && fieldValue !== null && typeof fieldValue.toDate === 'function') {
                try {
                    return fieldValue.toDate();
                } catch (e) {
                    console.warn("Error converting Firestore timestamp:", e);
                    return null; // Return null if conversion fails
                }
           }
           // Add more checks if needed (e.g., for string dates)
           return null; // Default to null if not a recognized date/timestamp type
       };
       const createdAtDate = safeToDate(data.createdAt);
       const updatedAtDate = safeToDate(data.updatedAt);
       return {
           uid: docSnap.id,
           email: data.email ?? null,
           displayName: data.displayName ?? 'User',
           photoURL: data.photoURL ?? null,
           role: data.role ?? 'user',
           cashbackBalance: typeof data.cashbackBalance === 'number' ? data.cashbackBalance : 0,
           pendingCashback: typeof data.pendingCashback === 'number' ? data.pendingCashback : 0,
           lifetimeCashback: typeof data.lifetimeCashback === 'number' ? data.lifetimeCashback : 0,
           referralCode: data.referralCode ?? '',
           referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
           referredBy: data.referredBy ?? null,
           isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false,
           createdAt: createdAtDate || new Date(0),
           updatedAt: updatedAtDate || createdAtDate || new Date(0),
       };
  };


  // Function to fetch user profile data on demand
  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
      if (!db) return null;
      const userDocRef = doc(db, 'users', uid);
      try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
              return mapFirestoreDataToProfile(docSnap);
          } else {
              console.warn(`fetchUserProfile: No profile found for UID ${uid}`);
              return null;
          }
      } catch (error) {
          console.error(`Error fetching user profile for UID ${uid}:`, error);
          return null;
      }
  }, []);


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
            const profileData = mapFirestoreDataToProfile(docSnap);
            console.log("Processed profile data from listener:", profileData); // Log processed data
            setUserProfile(profileData);
            setAuthError(null); // Clear any previous auth/profile error
          } else {
            console.warn("User profile not found in Firestore for UID:", firebaseUser.uid, "Attempting to create profile...");
            // Try to create profile if it doesn't exist - this might happen on first sign-in
            // Only attempt creation if not already loading profile data
              if (!loading) { // Avoid potential race conditions
                  createOrUpdateUserProfile(firebaseUser, null) // No referral code here
                      .then(() => {
                          console.log("Profile created successfully via listener.");
                          // The listener will trigger again with the new data
                      })
                      .catch(err => {
                          console.error("Error creating profile via listener:", err);
                          setAuthError(`Failed to create user profile: ${err.message}`);
                          setLoading(false); // Ensure loading stops even on error
                      });
              }
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
  }, [createOrUpdateUserProfile, loading]); // Added loading to dependency


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
        let errorMessage = "Failed to sign in with Google."; // Renamed variable to avoid conflict
        if (error.code) {
            switch (error.code) {
                case 'auth/popup-closed-by-user':
                    errorMessage = 'Sign-in cancelled. Please try again.';
                    break;
                case 'auth/account-exists-with-different-credential':
                    errorMessage = 'An account already exists with this email. Try signing in with your original method.';
                    break;
                 case 'auth/network-request-failed':
                      errorMessage = 'Network error during sign-in. Please check your connection.';
                      break;
                // Add other specific error codes as needed
                default:
                    errorMessage = `Google Sign-In failed (${error.code}).`;
            }
        }
        setAuthError(errorMessage);
        toast({ variant: "destructive", title: "Sign-In Failed", description: errorMessage });
      } finally {
        setLoading(false); // Ensure loading is false after sign-in attempt (success or fail)
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
    } catch (err: any) { // Changed variable name to avoid conflict
      console.error('Error signing out:', err);
      const errorMsg = `Sign out error: ${err instanceof Error ? err.message : String(err)}`;
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
      createOrUpdateUserProfile, // Expose for admin actions
      fetchUserProfile, // Expose fetchUserProfile
      authError, // Auth/profile errors
      initializationError: firebaseInitializationError // Pass init error down
  }), [user, userProfile, loading, signOut, signInWithGoogle, createOrUpdateUserProfile, fetchUserProfile, authError]);

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

