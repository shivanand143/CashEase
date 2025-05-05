// src/hooks/use-auth.tsx
"use client";

import * as React from 'react'; // Ensure React is imported
import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, collection, query, where, getDocs, Timestamp, increment, limit } from 'firebase/firestore'; // Added Timestamp, increment, limit
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config'; // Import firebaseInitializationError
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseError } from 'firebase/app'; // Import FirebaseError type

// Define the shape of the Auth context
interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null; // General profile/DB errors
  authError: string | null; // Separate state for auth-specific errors
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  createOrUpdateUserProfile: (user: User, referralCodeFromUrl: string | null) => Promise<void>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  resetAuthError: () => void; // Function to clear auth errors
}

// Create the Auth context with default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  error: null,
  authError: null, // Initialize authError
  signOut: () => Promise.resolve(),
  signInWithGoogle: () => Promise.resolve(),
  createOrUpdateUserProfile: async () => {},
  fetchUserProfile: async () => null,
  resetAuthError: () => {}, // Provide default function
});

// Custom hook to use the Auth context
export const useAuth = () => useContext(AuthContext);

// AuthProvider component to wrap the application
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Combined loading state
  const [error, setError] = useState<string | null>(null); // General profile/DB errors
  const [authError, setAuthError] = useState<string | null>(null); // Auth operation errors
  const router = useRouter();
  const { toast } = useToast();

  // Reset auth error state
   const resetAuthError = useCallback(() => {
     setAuthError(null);
   }, []);


  // Function to fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
      if (!db || !uid) {
         console.warn("DB not initialized or UID missing in fetchUserProfile");
         return null;
      }
       const userDocRef = doc(db, 'users', uid);
       try {
           const docSnap = await getDoc(userDocRef);
           if (docSnap.exists()) {
                const data = docSnap.data();
                 // Manual mapping to handle potential Timestamp conversion
                 const safeToDate = (fieldValue: any): Date | null => {
                    if (fieldValue instanceof Timestamp) return fieldValue.toDate();
                    if (fieldValue instanceof Date) return fieldValue;
                    return null;
                 };

                 // Ensure payoutDetails is either an object or null, not undefined
                 const payoutDetails = (data.payoutDetails && typeof data.payoutDetails === 'object' && Object.keys(data.payoutDetails).length > 0)
                  ? data.payoutDetails
                  : null;


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
                     referralBonusEarned: typeof data.referralBonusEarned === 'number' ? data.referralBonusEarned : 0,
                     referredBy: data.referredBy ?? null,
                     isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false,
                     createdAt: safeToDate(data.createdAt) || new Date(0),
                     updatedAt: safeToDate(data.updatedAt) || new Date(0),
                     lastPayoutRequestAt: safeToDate(data.lastPayoutRequestAt),
                     payoutDetails: payoutDetails, // Use the sanitized value
                 } as UserProfile;
           } else {
               console.warn(`fetchUserProfile: No profile found for UID ${uid}`);
               return null;
           }
       } catch (fetchError: any) {
           console.error(`Error fetching user profile for UID ${uid}:`, fetchError);
            setError(`Failed to load profile: ${fetchError.message}`); // Set general error
           return null;
       }
   }, []); // No dependencies needed if db is stable

  // Function to create or update user profile in Firestore
  const createOrUpdateUserProfile = useCallback(async (user: User | ({role: string} & User) , referralCodeFromUrl: string | null): Promise<void> => {
    if (!db || !user) {
      console.error("DB not initialized or user is null. Cannot create profile.");
      setError("Database connection error. Profile cannot be saved."); // Set general error
      return;
    }
    setError(null); // Clear general errors before operation

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);

      let finalProfileData: Partial<UserProfile>; // Use Partial for update/merge
      let isNewUser = false;

      if (!docSnap.exists()) {
        isNewUser = true;
        // Generate referral code only for new users
        const referralCode = uuidv4().substring(0, 8).toUpperCase(); // Slightly longer code
        finalProfileData = {
          uid: user.uid,
          email: user.email ?? null,
          displayName: user.displayName ?? 'User',
          photoURL: user.photoURL ?? null,
          role: (user as any).role ?? 'user', // Allow initial role setting
          cashbackBalance: 0,
          pendingCashback: 0,
          lifetimeCashback: 0,
          referralCode: referralCode, // Assign generated code
          referralCount: 0,
          referralBonusEarned: 0,
          referredBy: referralCodeFromUrl ?? null,
          isDisabled: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastPayoutRequestAt: null,
          payoutDetails: null, // Initialize as null explicitly
        };
        console.log("Preparing to create new user profile:", finalProfileData);
      } else {
        // Prepare update data for existing user
        const existingData = docSnap.data() as UserProfile;
        finalProfileData = {
          // Only update fields that might change on login/update
          email: user.email ?? existingData.email ?? null,
          displayName: user.displayName ?? existingData.displayName ?? 'User',
          photoURL: user.photoURL ?? existingData.photoURL ?? null,
          // Allow role update if provided in the user object
          role: (user as any).role ?? existingData.role ?? 'user',
          // Ensure balances are numbers, default to 0 if missing/invalid
          cashbackBalance: typeof existingData.cashbackBalance === 'number' ? existingData.cashbackBalance : 0,
          pendingCashback: typeof existingData.pendingCashback === 'number' ? existingData.pendingCashback : 0,
          lifetimeCashback: typeof existingData.lifetimeCashback === 'number' ? existingData.lifetimeCashback : 0,
          referralCode: existingData.referralCode || uuidv4().substring(0, 8).toUpperCase(), // Ensure referral code exists
          referralCount: typeof existingData.referralCount === 'number' ? existingData.referralCount : 0,
          referralBonusEarned: typeof existingData.referralBonusEarned === 'number' ? existingData.referralBonusEarned : 0,
          referredBy: existingData.referredBy ?? null, // Keep original referrer
          isDisabled: typeof existingData.isDisabled === 'boolean' ? existingData.isDisabled : false,
          lastPayoutRequestAt: existingData.lastPayoutRequestAt ?? null,
          // Keep existing payout details unless explicitly updated elsewhere
          payoutDetails: (existingData.payoutDetails && typeof existingData.payoutDetails === 'object') ? existingData.payoutDetails : null,
          updatedAt: serverTimestamp(), // Always update timestamp
        };
         // Don't overwrite createdAt if it exists
         if (existingData.createdAt) {
            finalProfileData.createdAt = existingData.createdAt;
         } else {
            finalProfileData.createdAt = serverTimestamp(); // Set if missing
         }

        console.log("Preparing to update existing user profile:", finalProfileData);
      }

      // Use set with merge: true for robust create/update
       await setDoc(userDocRef, finalProfileData, { merge: true });
       console.log(`User profile ${isNewUser ? 'created' : 'updated'} successfully for UID: ${user.uid}`);


      // Increment referrer count if it's a new user with a valid referral code
      if (isNewUser && referralCodeFromUrl) {
        await incrementReferralCount(referralCodeFromUrl);
      }

      // Refresh local profile state after successful Firestore operation
      const refreshedProfile = await fetchUserProfile(user.uid);
      setUserProfile(refreshedProfile); // Update local state

      // Toast notification based on action
      toast({
        title: isNewUser ? "Welcome!" : "Profile Updated",
        description: isNewUser ? "Your account has been created." : "Your profile information is up-to-date.",
      });

    } catch (profileError: any) {
      console.error("Error creating or updating user profile:", profileError);
       setError(`Profile save error: ${profileError.message}`); // Set general error
      toast({
        variant: "destructive",
        title: 'Profile Update Failed',
        description: `Could not save profile: ${profileError.message}`,
      });
    }
  }, [fetchUserProfile, toast]); // Include fetchUserProfile and toast


   // Function to increment referral count for the referrer
   const incrementReferralCount = useCallback(async (referralCode: string): Promise<void> => {
      if (!db || !referralCode) {
        console.warn("DB not initialized or referral code missing in incrementReferralCount.");
        return;
      }
      console.log(`Attempting to increment referral count for code: ${referralCode}`);
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('referralCode', '==', referralCode), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const referrerDocRef = querySnapshot.docs[0].ref;
          // Use Firestore's FieldValue.increment for atomic updates
          await updateDoc(referrerDocRef, {
            referralCount: increment(1),
             referralBonusEarned: increment(50), // Example bonus
            updatedAt: serverTimestamp(),
          });
          console.log(`Referral count incremented successfully for code: ${referralCode}`);
        } else {
          console.warn(`No user found with referral code: ${referralCode}`);
        }
      } catch (incrementError: any) {
        console.error("Error incrementing referral count:", incrementError);
        // Don't block the main signup flow, maybe log this error separately
        // setError(`Referral count update failed: ${incrementError.message}`);
      }
    }, []); // db should be stable, no other deps needed

  // Effect to listen for Firebase Auth state changes
  useEffect(() => {
     // Check for Firebase initialization error first
     if (firebaseInitializationError) {
       console.warn("AuthProvider useEffect: Firebase not initialized. Skipping auth listener.", firebaseInitializationError);
       setError("Firebase is not configured correctly. Please check setup.");
       setLoading(false); // Stop loading if Firebase is not initialized
       return;
     }
     if (!auth) {
        console.error("AuthProvider useEffect: Firebase Auth service is not available.");
        setError("Authentication service failed to initialize.");
        setLoading(false);
        return;
     }

    console.log("AuthProvider useEffect: Setting up onAuthStateChanged listener.");
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true); // Set loading true at the start of auth state change
      setError(null); // Clear general errors on auth change
      setAuthError(null); // Clear auth errors on auth change
      if (user) {
        console.log("onAuthStateChanged: User detected, UID:", user.uid);
        setUser(user);
        try {
           console.log("onAuthStateChanged: Fetching profile for user:", user.uid);
           const profile = await fetchUserProfile(user.uid);
           if (profile) {
              console.log("onAuthStateChanged: Profile found:", profile);
              setUserProfile(profile);
           } else {
               // Profile doesn't exist, attempt to create it
               console.warn("onAuthStateChanged: Profile not found for user:", user.uid, "Attempting to create.");
               // Important: Check if referral info exists in URL *only* during initial signup/login flow if needed
               // For general auth state changes, don't pass referral code unless intended.
               // Passing null here prevents accidentally applying referrals on subsequent logins.
               await createOrUpdateUserProfile(user, null);
           }
        } catch (profileErr: any) {
          console.error("onAuthStateChanged: Error fetching/creating profile:", profileErr);
          setError(profileErr.message || "Failed to load user profile.");
          setUserProfile(null); // Ensure profile is null on error
        }
      } else {
        console.log("onAuthStateChanged: No user detected.");
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false); // Set loading false after all operations complete
    });

    // Cleanup function
    return () => {
       console.log("AuthProvider useEffect: Cleaning up onAuthStateChanged listener.");
       unsubscribe();
    };
  // Add fetchUserProfile and createOrUpdateUserProfile as dependencies
  }, [fetchUserProfile, createOrUpdateUserProfile]);


  // Google Sign-In handler
  const signInWithGoogle = async () => {
    setError(null);
    setAuthError(null); // Reset auth-specific errors
    try {
      // Ensure auth is initialized before using
      if (!auth) {
        throw new Error("Firebase Auth is not initialized.");
      }

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const referralCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') : null; // check on signup
      console.log("Google Sign-In successful, UID:", user.uid, "Referral code from URL:", referralCode);
      await createOrUpdateUserProfile(user, referralCode); // common function for Google Sign-in too.

       toast({
         title: "Sign-in Successful",
         description: "You have been successfully signed in with Google.",
       });
       // Redirect handled by onAuthStateChanged or calling page

    } catch (err: unknown) { // Use unknown type for caught errors
      console.error("Google Sign-In failed:", err);

      let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain'; // Get current domain

      // Firebase authentication error handling
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = 'The sign-in popup was closed before completion.';
            break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = 'An account with this email already exists using a different sign-in method.';
            break;
          case 'auth/auth-domain-config-required':
            errorMessage = 'The Auth domain is not properly configured. Please contact support.';
            break;
          case 'auth/cancelled-popup-request':
            errorMessage = 'Multiple sign-in popups were opened. Please close the others and try again.';
            break;
          case 'auth/operation-not-allowed':
             errorMessage = 'Google Sign-In is not enabled for this project in the Firebase Console (Authentication -> Sign-in method).';
             break;
          case 'auth/unauthorized-domain':
             errorMessage = `This domain (${currentDomain}) is not authorized for Firebase Authentication. Check your Firebase Console settings.`;
             break;
          default:
            errorMessage = `Google Sign-In error (${err.code}): ${err.message}`;
        }
      } else if (err instanceof Error) {
         // Handle generic errors
         errorMessage = err.message;
      }

      setAuthError(errorMessage); // Use setAuthError for auth-related issues
      toast({
        variant: "destructive",
        title: 'Sign-In Cancelled', // Use a more appropriate title for popup closed
        description: errorMessage,
        duration: 7000, // Slightly shorter duration as it's often user action
      });
       // Do not automatically sign out here, let the user retry or choose another method
    }
  };

  // Sign out handler
  const signOut = async () => {
    setError(null);
    setAuthError(null); // Clear auth errors on sign out attempt
    try {
       // Ensure auth is initialized before using
       if (!auth) {
         throw new Error("Firebase Auth is not initialized.");
       }
      await firebaseSignOut(auth);
       toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
    } catch (error) {
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
       toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
    }
  };

  // Memoize the context value to prevent unnecessary re-renders
  const authContextValue = React.useMemo(() => ({
    user,
    userProfile,
    loading,
    error,
    authError,
    signOut,
    signInWithGoogle,
    createOrUpdateUserProfile,
    fetchUserProfile,
    resetAuthError,
  }), [
    user,
    userProfile,
    loading,
    error,
    authError,
    signOut, // Include signOut in dependency array
    signInWithGoogle,
    createOrUpdateUserProfile,
    fetchUserProfile,
    resetAuthError,
  ]);


  // Provide the authentication context to children components
  // Ensure correct JSX syntax
  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};
