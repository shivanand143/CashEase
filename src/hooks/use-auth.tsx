"use client";

import * as React from 'react';
import {
  useState,
  useEffect,
  useCallback,
  useContext,
  createContext,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithPopup,
  GoogleAuthProvider,
  User,
  updateProfile as updateAuthProfile,
  updateEmail as updateAuthEmail,
  updatePassword as updateAuthPassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  increment,
  collection,
  query,
  where,
  getDocs,
  limit,
  updateDoc,
  writeBatch // Import writeBatch
} from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails, PayoutMethod } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseError } from 'firebase/app';

// --- Constants ---
const MIN_PAYOUT_AMOUNT = 250; // Example minimum payout
const REFERRAL_BONUS_AMOUNT = 50; // Example referral bonus

// --- Initial Admin Setup UID ---
const INITIAL_ADMIN_UID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || null;
if (typeof window !== 'undefined') { // Log only on client-side
    console.log("Initial Admin UID for Setup:", INITIAL_ADMIN_UID ? "***" : "Not Set");
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean; // Combined loading state (auth + profile)
  error: string | null; // General errors (profile fetch, etc.)
  authError: string | null; // Specific authentication errors
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  updateUserProfileData: (uid: string, data: Partial<UserProfile>) => Promise<void>;
  createOrUpdateUserProfile: (authUser: User, referralCodeFromUrl?: string | null, initialRole?: 'user' | 'admin') => Promise<UserProfile | null>;
  resetAuthError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  error: null,
  authError: null,
  signOut: async () => {},
  signInWithGoogle: async () => {},
  fetchUserProfile: async () => null,
  updateUserProfileData: async () => {},
  createOrUpdateUserProfile: async () => null,
  resetAuthError: () => {},
});

export const useAuth = () => useContext(AuthContext);

// --- Helper Functions ---
const safeToDate = (fieldValue: any): Date | null => {
    if (!fieldValue) return null;
    if (fieldValue instanceof Timestamp) return fieldValue.toDate();
    if (fieldValue instanceof Date) return fieldValue;
    // Attempt to parse if it's a string (less reliable)
    if (typeof fieldValue === 'string') {
        try {
            const date = new Date(fieldValue);
            if (!isNaN(date.getTime())) {
                return date;
            }
        } catch (e) { /* Ignore parsing errors */ }
    }
     // Handle Firestore serverTimestamp placeholder object before write
     if (typeof fieldValue === 'object' && fieldValue !== null && typeof (fieldValue as any).toDate === 'function') {
        try {
            // This might throw if it's not a real Timestamp yet
            return (fieldValue as Timestamp).toDate();
        } catch (e) { /* Ignore errors */ }
    }
    console.warn("safeToDate failed to convert value:", fieldValue);
    return null;
};


const sanitizePayoutDetails = (details: any): PayoutDetails | null => {
    if (details && typeof details === 'object' && typeof details.method === 'string' && typeof details.detail === 'string') {
        // Basic check, ensure method is a valid PayoutMethod if possible
        const validMethods: PayoutMethod[] = ['bank_transfer', 'paypal', 'gift_card'];
        if (validMethods.includes(details.method as PayoutMethod)) {
           return {
               method: details.method as PayoutMethod,
               detail: details.detail,
           };
        }
    }
    return null;
};

// --- Auth Provider ---
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Tracks combined auth and profile loading
  const [error, setError] = useState<string | null>(null); // For general/profile errors
  const [authError, setAuthError] = useState<string | null>(null); // For specific auth action errors
  const router = useRouter();
  const { toast } = useToast();

  const resetAuthError = useCallback(() => setAuthError(null), []);

  // Fetch User Profile - Wrapped in useCallback for stability
  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    // Ensure DB is checked *inside* the function in case it initializes later
    if (!db) {
        console.error("Firestore DB is not available in fetchUserProfile.");
        // Avoid setting a general error here, let the caller handle it if needed
        // setError("Database error: Cannot fetch profile.");
        return null;
    }
    if (!uid) {
        console.warn("fetchUserProfile called with no UID.");
        return null;
    }

    const userDocRef = doc(db, 'users', uid);
    console.log(`Fetching profile for UID: ${uid}`); // Log fetch attempt

    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
         console.log(`Profile data fetched for ${uid}:`, data); // Log fetched data
        // **Crucial:** Provide defaults for potentially missing fields
        return {
          uid: docSnap.id,
          email: data.email ?? null,
          displayName: data.displayName ?? 'User',
          photoURL: data.photoURL ?? null,
          role: data.role ?? 'user',
          cashbackBalance: typeof data.cashbackBalance === 'number' ? data.cashbackBalance : 0,
          pendingCashback: typeof data.pendingCashback === 'number' ? data.pendingCashback : 0,
          lifetimeCashback: typeof data.lifetimeCashback === 'number' ? data.lifetimeCashback : 0,
          referralCode: data.referralCode ?? null,
          referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
          referralBonusEarned: typeof data.referralBonusEarned === 'number' ? data.referralBonusEarned : 0,
          referredBy: data.referredBy ?? null,
          isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false,
          createdAt: safeToDate(data.createdAt) || new Date(0), // Provide default date
          updatedAt: safeToDate(data.updatedAt) || new Date(0), // Provide default date
          lastPayoutRequestAt: safeToDate(data.lastPayoutRequestAt), // Can be null
          payoutDetails: sanitizePayoutDetails(data.payoutDetails), // Use sanitizer
        };
      } else {
        console.warn(`fetchUserProfile: No profile found for UID ${uid}`);
        return null;
      }
    } catch (fetchError: any) {
      console.error(`Error fetching user profile for UID ${uid}:`, fetchError);
      // Set general error, not authError
      setError(`Failed to load profile: ${fetchError.message}`);
      return null;
    }
  }, []); // No dependencies needed here

  // Increment Referrer Count - Wrapped in useCallback
  const incrementReferralCount = useCallback(async (referralCode: string): Promise<void> => {
    if (!db) {
        console.error("Firestore DB is not available in incrementReferralCount.");
        return;
    }
    if (!referralCode) {
        console.warn("incrementReferralCount called with no referralCode.");
        return;
    }

    console.log(`Attempting to increment referral count for code: ${referralCode}`);
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('referralCode', '==', referralCode), limit(1));
    try {
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const referrerDocRef = querySnapshot.docs[0].ref;
        const batch = writeBatch(db); // Use a batch for atomic update
        batch.update(referrerDocRef, {
          referralCount: increment(1),
          referralBonusEarned: increment(REFERRAL_BONUS_AMOUNT),
          // Decide if bonus should immediately go to cashbackBalance
          // cashbackBalance: increment(REFERRAL_BONUS_AMOUNT),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        console.log(`Referral count and bonus incremented for code: ${referralCode}`);
      } else {
        console.warn(`No user found with referral code: ${referralCode}`);
      }
    } catch (incrementError: any) {
      console.error("Error incrementing referral count:", incrementError);
      // Log but don't block signup flow unnecessarily
      // Maybe show a subtle toast? toast({ variant: "destructive", title: "Referral Error", description: "Could not apply referral bonus." });
    }
  }, []); // No dependencies needed here

  // Create or Update User Profile - Wrapped in useCallback
  const createOrUpdateUserProfile = useCallback(async (
    authUser: User,
    referralCodeFromUrl: string | null = null, // Default to null
    initialRole?: 'user' | 'admin'
  ): Promise<UserProfile | null> => {
    if (!db) {
        console.error("Firestore DB is not available in createOrUpdateUserProfile.");
        setError("Database error: Profile cannot be saved.");
        return null;
    }
     if (!authUser) {
        console.error("createOrUpdateUserProfile called with null authUser.");
        setError("Authentication error: Cannot save profile.");
        return null;
    }

    // Reset errors specific to this operation
    setError(null);

    const userDocRef = doc(db, 'users', authUser.uid);
    let finalProfileData: UserProfile | null = null;
    let isNewUser = false;

    try {
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        isNewUser = true;
        const newReferralCode = uuidv4().substring(0, 8).toUpperCase(); // Generate unique code

         // Determine role, prioritizing passed initialRole, then env var, then default 'user'
         const role = initialRole ?? (INITIAL_ADMIN_UID === authUser.uid ? 'admin' : 'user');

        // Define the structure for the new profile, ensuring all fields have defaults
        const profileToCreate: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
          uid: authUser.uid,
          email: authUser.email ?? null, // Use null if email is missing
          displayName: authUser.displayName?.trim() || `User_${authUser.uid.substring(0, 5)}`, // Ensure display name isn't empty
          photoURL: authUser.photoURL ?? null,
          role: role,
          cashbackBalance: 0,
          pendingCashback: 0,
          lifetimeCashback: 0,
          referralCode: newReferralCode, // Assign the generated code
          referralCount: 0,
          referralBonusEarned: 0,
          referredBy: referralCodeFromUrl ?? null,
          isDisabled: false,
          lastPayoutRequestAt: null,
          payoutDetails: null,
        };

        // Perform the write operation
        await setDoc(userDocRef, {
          ...profileToCreate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

         // Estimate data for immediate use in state
         finalProfileData = {
            ...profileToCreate,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        console.log(`Created new user profile for ${authUser.uid}, Role: ${role}, Referral Code: ${newReferralCode}`);

        // Increment referrer count if applicable *after* profile creation
        if (referralCodeFromUrl) {
          await incrementReferralCount(referralCodeFromUrl);
        }
      } else {
        // Existing user - merge data carefully
        const existingData = docSnap.data() as UserProfile;
        const updates: Partial<UserProfile> = {};

        // Only update if data from auth provider is different and not null/empty
        if (authUser.email && authUser.email !== existingData.email) {
            updates.email = authUser.email;
        }
        if (authUser.displayName && authUser.displayName.trim() !== existingData.displayName) {
            updates.displayName = authUser.displayName.trim();
        }
        if (authUser.photoURL && authUser.photoURL !== existingData.photoURL) {
            updates.photoURL = authUser.photoURL;
        }
        // Ensure referral code exists (might have been missed in earlier versions)
        if (!existingData.referralCode) {
            updates.referralCode = uuidv4().substring(0, 8).toUpperCase();
        }
        // **Do not** update role automatically on login. Handle separately.
         // If `initialRole` is provided (e.g., during initial admin setup), update it.
         if (initialRole && initialRole !== existingData.role) {
            updates.role = initialRole;
            console.log(`Updating role for ${authUser.uid} to ${initialRole}`);
        }


        // Only perform update if there are actual changes
        if (Object.keys(updates).length > 0) {
            updates.updatedAt = serverTimestamp(); // Always update timestamp if other fields change
            await updateDoc(userDocRef, updates);
            console.log(`Updated existing user profile for ${authUser.uid} with changes:`, Object.keys(updates));
        } else {
            console.log(`No profile updates needed for existing user ${authUser.uid}`);
        }

        // Fetch the potentially updated profile to return the most current state
        finalProfileData = await fetchUserProfile(authUser.uid);
      }

      // Show appropriate toast
      toast({
        title: isNewUser ? "Welcome!" : "Login Successful",
        description: isNewUser ? "Your CashEase account has been created." : `Welcome back, ${finalProfileData?.displayName || 'User'}!`,
      });

      return finalProfileData; // Return the final profile state

    } catch (profileError: any) {
      console.error(`Error in createOrUpdateUserProfile for ${authUser.uid}:`, profileError);
      setError(`Profile save error: ${profileError.message}`); // Set general error
      toast({ variant: "destructive", title: 'Profile Error', description: `Could not save profile: ${profileError.message}` });
      return null; // Indicate failure
    }
  }, [fetchUserProfile, incrementReferralCount, toast]); // Dependencies

  // Update Specific User Profile Data - Wrapped in useCallback
  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>): Promise<void> => {
    if (!db) {
        console.error("Firestore DB is not available in updateUserProfileData.");
        throw new Error("Database error.");
    }
    if (!uid) {
        console.error("updateUserProfileData called with no UID.");
        throw new Error("User ID missing.");
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      // Remove uid from data to prevent trying to update the ID field itself
      const { uid: _uid, ...updateData } = data;
      // Ensure we always include the updatedAt timestamp
      await updateDoc(userDocRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
      });
      console.log(`User profile data updated for UID: ${uid}`);
      // Refresh local profile state after successful update
      const refreshedProfile = await fetchUserProfile(uid);
      setUserProfile(refreshedProfile); // Update the context state
    } catch (updateError: any) {
      console.error(`Error updating profile data for UID ${uid}:`, updateError);
      // Let the caller handle UI feedback (e.g., toast)
      throw new Error(`Profile update failed: ${updateError.message}`);
    }
  }, [fetchUserProfile]); // Depends on fetchUserProfile

  // Auth State Change Listener - Refined Logic
  useEffect(() => {
    // Initial check for Firebase initialization
    if (firebaseInitializationError) {
        console.error("AuthProvider: Firebase initialization failed:", firebaseInitializationError);
        setError(firebaseInitializationError);
        setLoading(false);
        return;
    }
    if (!auth) {
        console.error("AuthProvider: Firebase Auth service is not available.");
        setError("Authentication service unavailable.");
        setLoading(false);
        return;
    }

    console.log("AuthProvider: Setting up onAuthStateChanged listener.");
    setLoading(true); // Set loading true when listener starts

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
        console.log("onAuthStateChanged triggered. Auth User:", authUser?.uid || "null");
        // Reset errors on each auth state change
        setError(null);
        setAuthError(null);

        if (authUser) {
            setUser(authUser);
            // Fetch profile *immediately* after detecting authUser
            const profile = await fetchUserProfile(authUser.uid);
            if (profile) {
                setUserProfile(profile);
            } else {
                // If profile doesn't exist after initial fetch, attempt creation
                // This is more likely on first sign-up/sign-in
                console.warn(`Profile not found for ${authUser.uid}, attempting creation/update.`);
                const createdProfile = await createOrUpdateUserProfile(authUser); // Referral code handled internally if needed
                setUserProfile(createdProfile); // Set the result (might be null if creation failed)
            }
        } else {
            // User is signed out
            setUser(null);
            setUserProfile(null);
        }
        setLoading(false); // Set loading false *after* processing auth state and profile
    },
    // Error handler for the listener itself (less common)
    (listenerError) => {
        console.error("onAuthStateChanged listener error:", listenerError);
        setError("Authentication listener failed.");
        setUser(null);
        setUserProfile(null);
        setLoading(false);
    });

    // Cleanup function
    return () => {
      console.log("AuthProvider: Cleaning up onAuthStateChanged listener.");
      unsubscribe();
    };
    // fetchUserProfile and createOrUpdateUserProfile are stable due to useCallback
  }, [fetchUserProfile, createOrUpdateUserProfile]);


  // Google Sign-In - Refined Error Handling
  const signInWithGoogle = async () => {
    setError(null); // Clear general errors
    setAuthError(null); // Clear previous auth errors
    if (!auth) {
      setAuthError("Authentication service failed.");
      toast({ variant: "destructive", title: 'Sign-In Error', description: "Authentication service unavailable." });
      return;
    }
    console.log("Attempting Google Sign-In...");
    try {
      const provider = new GoogleAuthProvider();
      // Consider custom parameters if needed:
      // provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      console.log("Google Sign-In successful, UID:", result.user.uid);
      // Profile creation/update is now handled reliably by the onAuthStateChanged listener
      // No explicit redirect needed here usually, state updates handle it.
    } catch (err: unknown) {
      console.error("Google Sign-In process failed:", err); // Log the raw error
      let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain'; // Get current domain

      // Firebase authentication error handling
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = 'Sign-in cancelled. The popup was closed before completion.';
            break;
          case 'auth/cancelled-popup-request':
             errorMessage = 'Sign-in cancelled. Only one sign-in popup can be open at a time.';
             break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = 'An account already exists with this email address using a different sign-in method (e.g., password). Try logging in with that method.';
            break;
          case 'auth/unauthorized-domain':
            errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Please contact support or check Firebase configuration.`;
            break;
          case 'auth/operation-not-allowed':
            errorMessage = 'Google Sign-In is not enabled for this application. Please contact support.';
            break;
           case 'auth/network-request-failed':
             errorMessage = 'Network error during sign-in. Please check your internet connection.';
             break;
          default:
            errorMessage = `Google Sign-In error (${err.code || 'unknown'}). Please try again.`;
        }
      } else if (err instanceof Error) {
          // Handle generic errors
          errorMessage = err.message;
      }
      setAuthError(errorMessage); // Set specific auth error state
      toast({
        variant: "destructive",
        title: err instanceof FirebaseError && err.code === 'auth/popup-closed-by-user' ? 'Sign-In Cancelled' : 'Google Sign-In Failed',
        description: errorMessage,
        duration: 7000, // Slightly longer duration for errors
      });
    }
  };

  // Sign Out - Refined
  const signOut = async () => {
    setError(null); // Clear general errors
    setAuthError(null); // Clear auth errors
     if (!auth) {
       setAuthError("Authentication service failed.");
       toast({ variant: "destructive", title: 'Sign Out Error', description: "Authentication service unavailable." });
       return;
     }
    console.log("Attempting Sign Out...");
    try {
      await firebaseSignOut(auth);
      // State updates (user=null, profile=null) are handled by onAuthStateChanged
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push('/'); // Redirect to homepage after sign out
    } catch (error: any) {
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error.message || String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
    }
  };

  // Memoize context value to prevent unnecessary re-renders
  const authContextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    error,
    authError,
    signOut,
    signInWithGoogle,
    fetchUserProfile,
    updateUserProfileData,
    createOrUpdateUserProfile, // Export the creation/update function
    resetAuthError,
  }), [
    user,
    userProfile,
    loading,
    error,
    authError,
    // Include stable function references from useCallback:
    signOut,
    signInWithGoogle,
    fetchUserProfile,
    updateUserProfileData,
    createOrUpdateUserProfile,
    resetAuthError,
  ]);

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};
