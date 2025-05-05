
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
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, Timestamp, increment, collection, query, where, getDocs, limit, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails } from '@/lib/types'; // Assuming types are defined
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseError } from 'firebase/app';

// --- Initial Admin Setup UID ---
// IMPORTANT: Replace with the actual UID you want for initial admin setup.
// In production, manage roles securely (e.g., via Cloud Functions).
const INITIAL_ADMIN_UID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || null;
console.log("Initial Admin UID for Setup:", INITIAL_ADMIN_UID ? "***" : "Not Set"); // Log without exposing UID

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  authError: string | null;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  updateUserProfileData: (uid: string, data: Partial<UserProfile>) => Promise<void>;
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
  resetAuthError: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// --- Helper Functions ---
const safeToDate = (fieldValue: any): Date | null => {
  if (fieldValue instanceof Timestamp) return fieldValue.toDate();
  if (fieldValue instanceof Date) return fieldValue;
  return null;
};

const sanitizePayoutDetails = (details: any): PayoutDetails | null => {
    if (details && typeof details === 'object' && details.method && details.detail) {
        // Basic check, refine as needed based on PayoutDetails structure
        return details as PayoutDetails;
    }
    return null;
};

// --- Auth Provider ---
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const resetAuthError = useCallback(() => setAuthError(null), []);

  // Fetch User Profile
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
        return {
          uid: docSnap.id,
          email: data.email ?? null,
          displayName: data.displayName ?? 'User',
          photoURL: data.photoURL ?? null,
          role: data.role ?? 'user',
          cashbackBalance: typeof data.cashbackBalance === 'number' ? data.cashbackBalance : 0,
          pendingCashback: typeof data.pendingCashback === 'number' ? data.pendingCashback : 0,
          lifetimeCashback: typeof data.lifetimeCashback === 'number' ? data.lifetimeCashback : 0,
          referralCode: data.referralCode ?? null, // Ensure it's null if missing
          referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
          referralBonusEarned: typeof data.referralBonusEarned === 'number' ? data.referralBonusEarned : 0,
          referredBy: data.referredBy ?? null,
          isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false,
          createdAt: safeToDate(data.createdAt) || new Date(0),
          updatedAt: safeToDate(data.updatedAt) || new Date(0),
          lastPayoutRequestAt: safeToDate(data.lastPayoutRequestAt),
          payoutDetails: sanitizePayoutDetails(data.payoutDetails),
        } as UserProfile;
      } else {
        console.warn(`fetchUserProfile: No profile found for UID ${uid}`);
        return null;
      }
    } catch (fetchError: any) {
      console.error(`Error fetching user profile for UID ${uid}:`, fetchError);
      setError(`Failed to load profile: ${fetchError.message}`);
      return null;
    }
  }, []); // Removed dependency on setError

  // Increment Referrer Count
  const incrementReferralCount = useCallback(async (referralCode: string): Promise<void> => {
    if (!db || !referralCode) return;
    console.log(`Attempting to increment referral count for code: ${referralCode}`);
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('referralCode', '==', referralCode), limit(1));
    try {
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const referrerDocRef = querySnapshot.docs[0].ref;
        // TODO: Define referral bonus amount
        const referralBonus = 50; // Example bonus amount
        await updateDoc(referrerDocRef, {
          referralCount: increment(1),
          referralBonusEarned: increment(referralBonus), // Increment bonus
          // Potentially add bonus to cashbackBalance too, depending on rules
          // cashbackBalance: increment(referralBonus),
          updatedAt: serverTimestamp(),
        });
        console.log(`Referral count and bonus incremented for code: ${referralCode}`);
      } else {
        console.warn(`No user found with referral code: ${referralCode}`);
      }
    } catch (incrementError: any) {
      console.error("Error incrementing referral count:", incrementError);
      // Log but don't block signup
    }
  }, []);

  // Create or Update User Profile (Core Logic)
  const createOrUpdateUserProfile = useCallback(async (
    authUser: User,
    referralCodeFromUrl: string | null,
    initialRole?: 'user' | 'admin' // Optional initial role override
  ): Promise<UserProfile | null> => {
    if (!db || !authUser) {
      console.error("DB not initialized or authUser is null.");
      setError("Database error. Profile cannot be saved.");
      return null;
    }
    setError(null); // Clear previous general errors

    const userDocRef = doc(db, 'users', authUser.uid);
    let finalProfileData: UserProfile | null = null;
    let isNewUser = false;

    try {
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        isNewUser = true;
        const referralCode = uuidv4().substring(0, 8).toUpperCase();
        const profileToCreate: Omit<UserProfile, 'createdAt' | 'updatedAt'> = { // Omit timestamps for serverTimestamp
          uid: authUser.uid,
          email: authUser.email ?? null,
          displayName: authUser.displayName ?? 'CashEase User',
          photoURL: authUser.photoURL ?? null,
          // Set role: use initialRole if provided, check INITIAL_ADMIN_UID, default to 'user'
          role: initialRole ?? (INITIAL_ADMIN_UID === authUser.uid ? 'admin' : 'user'),
          cashbackBalance: 0,
          pendingCashback: 0,
          lifetimeCashback: 0,
          referralCode: referralCode,
          referralCount: 0,
          referralBonusEarned: 0,
          referredBy: referralCodeFromUrl ?? null,
          isDisabled: false,
          lastPayoutRequestAt: null,
          payoutDetails: null,
        };
        await setDoc(userDocRef, {
            ...profileToCreate,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        finalProfileData = {
            ...profileToCreate,
            createdAt: new Date(), // Estimate client-side for immediate use
            updatedAt: new Date(), // Estimate client-side for immediate use
        } as UserProfile; // Cast after adding estimated dates
        console.log("Created new user profile:", finalProfileData?.uid);

        // Handle referral increment for new users
        if (referralCodeFromUrl) {
          await incrementReferralCount(referralCodeFromUrl);
        }

      } else {
        // Existing user - Merge data safely
        const existingData = docSnap.data() as UserProfile; // Assume type for existing data
        const updates: Partial<UserProfile> = {
            // Only update if auth provider info is newer or different
            email: authUser.email !== existingData.email ? authUser.email : existingData.email,
            displayName: authUser.displayName !== existingData.displayName ? authUser.displayName : existingData.displayName,
            photoURL: authUser.photoURL !== existingData.photoURL ? authUser.photoURL : existingData.photoURL,
            // DO NOT automatically update role on login, handle role changes separately
            // role: initialRole ?? existingData.role ?? 'user', // Only use initialRole if explicitly passed
            updatedAt: serverTimestamp(),
        };

        // Ensure referral code exists if somehow missing
        if (!existingData.referralCode) {
            updates.referralCode = uuidv4().substring(0, 8).toUpperCase();
        }

        await updateDoc(userDocRef, updates);
        console.log("Updated existing user profile:", authUser.uid);

        // Fetch the updated profile to return
        finalProfileData = await fetchUserProfile(authUser.uid);
      }

      // Toast notification
      toast({
        title: isNewUser ? "Welcome!" : "Login Successful",
        description: isNewUser ? "Your account has been created." : `Welcome back, ${finalProfileData?.displayName || 'User'}!`,
      });

      return finalProfileData; // Return the created/fetched profile

    } catch (profileError: any) {
      console.error("Error in createOrUpdateUserProfile:", profileError);
      setError(`Profile save error: ${profileError.message}`);
      toast({ variant: "destructive", title: 'Profile Error', description: `Could not save profile: ${profileError.message}` });
      return null; // Return null on error
    }
  }, [fetchUserProfile, incrementReferralCount, toast]); // Removed setError dependency

   // Update User Profile Data (for specific field updates like settings)
   const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>): Promise<void> => {
     if (!db || !uid) {
       console.error("DB not initialized or UID missing.");
       throw new Error("Database error.");
     }
     const userDocRef = doc(db, 'users', uid);
     try {
       // Remove uid from data to prevent trying to update it
       const { uid: _uid, ...updateData } = data;
       await updateDoc(userDocRef, {
         ...updateData,
         updatedAt: serverTimestamp(),
       });
       console.log(`User profile data updated for UID: ${uid}`);
       // Optionally refresh local profile state
       const refreshedProfile = await fetchUserProfile(uid);
       setUserProfile(refreshedProfile);
     } catch (updateError: any) {
       console.error(`Error updating profile data for UID ${uid}:`, updateError);
       throw new Error(`Profile update failed: ${updateError.message}`);
     }
   }, [fetchUserProfile]); // Add fetchUserProfile dependency


  // Auth State Change Listener
  useEffect(() => {
    if (firebaseInitializationError) {
      console.warn("AuthProvider: Firebase not initialized. Skipping auth listener.");
      setError("Firebase configuration error.");
      setLoading(false);
      return;
    }
    if (!auth) {
      console.error("AuthProvider: Firebase Auth service not available.");
      setError("Authentication service failed.");
      setLoading(false);
      return;
    }

    console.log("AuthProvider: Setting up onAuthStateChanged listener.");
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);
      setError(null);
      setAuthError(null);
      if (authUser) {
        console.log("onAuthStateChanged: User detected, UID:", authUser.uid);
        setUser(authUser);
        try {
          console.log("onAuthStateChanged: Fetching profile for:", authUser.uid);
          const profile = await fetchUserProfile(authUser.uid);
          if (profile) {
             console.log("onAuthStateChanged: Profile found:", profile.uid);
             setUserProfile(profile); // Set profile from fetch
          } else {
             // This case should ideally only happen on the very first signup
             // before the profile creation call completes.
             // We attempt creation here as a fallback.
             console.warn("onAuthStateChanged: Profile not found for user:", authUser.uid, ". Attempting fallback creation.");
             // Pass null for referral code here, as this listener runs on subsequent logins too
             const createdProfile = await createOrUpdateUserProfile(authUser, null);
             setUserProfile(createdProfile); // Set the newly created/fetched profile
          }
        } catch (profileErr: any) {
          console.error("onAuthStateChanged: Error fetching/creating profile:", profileErr);
          setError(profileErr.message || "Failed to load user profile.");
          setUserProfile(null);
        }
      } else {
        console.log("onAuthStateChanged: No user detected.");
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => {
      console.log("AuthProvider: Cleaning up listener.");
      unsubscribe();
    };
  }, [fetchUserProfile, createOrUpdateUserProfile]); // Dependencies


  // Google Sign-In
  const signInWithGoogle = async () => {
    setError(null);
    setAuthError(null);
    if (!auth) {
      setAuthError("Firebase Auth is not initialized.");
      toast({ variant: "destructive", title: 'Sign-In Error', description: "Authentication service failed." });
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      // Profile creation/update is handled by the onAuthStateChanged listener
      console.log("Google Sign-In successful, UID:", result.user.uid);
      // Redirect is implicitly handled by state updates triggering page logic/guards
    } catch (err: unknown) {
      console.error("Google Sign-In failed:", err);
      let errorMessage = "An unexpected error occurred during Google Sign-In.";
      if (err instanceof FirebaseError) {
         // Handle specific Firebase errors
         switch (err.code) {
           case 'auth/popup-closed-by-user':
             errorMessage = 'Sign-in popup closed before completion.';
             break;
           case 'auth/account-exists-with-different-credential':
             errorMessage = 'Account already exists with a different sign-in method.';
             break;
           case 'auth/unauthorized-domain':
             const domain = typeof window !== 'undefined' ? window.location.hostname : 'your app domain';
             errorMessage = `Domain (${domain}) not authorized. Check Firebase console.`;
             break;
           case 'auth/cancelled-popup-request':
              errorMessage = 'Sign-in cancelled. Multiple popups may be open.';
              break;
           case 'auth/operation-not-allowed':
               errorMessage = 'Google Sign-In is not enabled in Firebase.';
               break;
           default:
             errorMessage = `Google Sign-In error (${err.code}).`;
         }
      } else if (err instanceof Error) {
          errorMessage = err.message;
      }
      setAuthError(errorMessage);
      toast({ variant: "destructive", title: 'Sign-In Failed', description: errorMessage });
    }
  };

  // Sign Out
  const signOut = async () => {
    setError(null);
    setAuthError(null);
     if (!auth) {
       setAuthError("Firebase Auth is not initialized.");
       toast({ variant: "destructive", title: 'Sign Out Error', description: "Authentication service failed." });
       return;
     }
    try {
      await firebaseSignOut(auth);
      // State updates are handled by onAuthStateChanged
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // Redirect to home or login page after sign out
      // router.push('/'); // Or '/login'
    } catch (error: any) {
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error.message || String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
    }
  };

  // Memoize context value
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
    resetAuthError,
  }), [
    user,
    userProfile,
    loading,
    error,
    authError,
    signOut, // Include actual function reference
    signInWithGoogle,
    fetchUserProfile,
    updateUserProfileData,
    resetAuthError,
  ]);

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};
