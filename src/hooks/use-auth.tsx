"use client";

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
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { v4 as uuidv4 } from 'uuid';
//import { env } from '@/env.mjs'; // Import the validated environment variables

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  authError: string | null;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  createOrUpdateUserProfile: (user:User,ref:string|null) => Promise<void>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  resetAuthError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  error: null,
  authError: null,
  signOut: () => Promise.resolve(),
  signInWithGoogle: () => Promise.resolve(),
  createOrUpdateUserProfile: async () => {},
  fetchUserProfile: async () => null,
  resetAuthError: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
   const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log("Auth State Changed: User logged in, UID:", user.uid);
        setUser(user); // Set Firebase Auth user

        // Fetch or create user profile document in Firestore
        try {
          const profile = await fetchUserProfile(user.uid);
           setUserProfile(profile);
        } catch (profileErr: any) {
          console.error("Error fetching or creating user profile:", profileErr);
          setError(profileErr.message || "Failed to fetch or create user profile.");
           setUserProfile(null);
        } finally {
          setLoading(false); // Ensure loading is set to false after attempt
        }
      } else {
        console.log("Auth State Changed: No user logged in.");
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe(); // Cleanup subscription on unmount
  }, [router, setError]); // Removed createOrUpdateUserProfile from dependency array


  const resetAuthError = () => {
    setAuthError(null);
  };

  // Function to fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
      if (!db || !uid) return null;
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
                     payoutDetails: (existingData.payoutDetails && Object.keys(existingData.payoutDetails).length > 0) ? existingData.payoutDetails : null as any,
                 } as UserProfile;
           } else {
               console.warn(`fetchUserProfile: No profile found for UID ${uid}`);
               return null;
           }
       } catch (error) {
           console.error(`Error fetching user profile for UID ${uid}:`, error);
           return null;
       }
   }, []);

  const createOrUpdateUserProfile = async (user: User, referralCodeFromUrl: string | null): Promise<void> => {
    if (!db || !user) {
      console.error("DB is not initialized, or user is null. Cannot create profile.");
      return;
    }
    setError(null);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        // Generate referral code only for new users
        const referralCode = uuidv4().substring(0, 6).toUpperCase();
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email ?? null,
          displayName: user.displayName ?? 'User',
          photoURL: user.photoURL ?? null,
          role: 'user',
          cashbackBalance: 0,
          pendingCashback: 0,
          lifetimeCashback: 0,
          referralCode: referralCode,
          referralCount: 0,
          referralBonusEarned: 0,
          referredBy: referralCodeFromUrl ?? null, // Track referral code
          isDisabled: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastPayoutRequestAt: null,
          payoutDetails: null as any,
        };
         await setDoc(userDocRef, newProfile);
        console.log("New user profile created in Firestore:", user.uid);
         if (referralCodeFromUrl) {
             // Update the referrer's referralCount
             await incrementReferralCount(referralCodeFromUrl);
             console.log(`Referral count incremented for referrer: ${referralCodeFromUrl}`);
           }

         toast({
           title: "Welcome!",
           description: "Your account has been created successfully.",
         });


      } else {
        // Update existing user profile
         const existingData = docSnap.data();

         const data: Partial<UserProfile> = {
           uid: user.uid,
           email: user.email ?? null,
           displayName: user.displayName ?? 'User',
           photoURL: user.photoURL ?? null,
           role: existingData.role ?? 'user',
           cashbackBalance: typeof existingData.cashbackBalance === 'number' ? existingData.cashbackBalance : 0,
           pendingCashback: typeof existingData.pendingCashback === 'number' ? existingData.pendingCashback : 0,
           lifetimeCashback: typeof existingData.lifetimeCashback === 'number' ? existingData.lifetimeCashback : 0,
           referralCode: existingData.referralCode ?? uuidv4().substring(0, 6).toUpperCase(),
           referralCount: typeof existingData.referralCount === 'number' ? existingData.referralCount : 0,
           referralBonusEarned: typeof existingData.referralBonusEarned === 'number' ? existingData.referralBonusEarned : 0,
           referredBy: existingData.referredBy ?? null,
           isDisabled: typeof existingData.isDisabled === 'boolean' ? existingData.isDisabled : false,
           createdAt: existingData.createdAt || serverTimestamp(),
           updatedAt: serverTimestamp(),
           lastPayoutRequestAt: existingData.lastPayoutRequestAt ?? null,
           payoutDetails: (existingData.payoutDetails && Object.keys(existingData.payoutDetails).length > 0) ? existingData.payoutDetails : null as any,
         };

         // Use set with merge: true for both create and update
         await setDoc(userDocRef, data, { merge: true });
         console.log("Existing user profile updated in Firestore:", user.uid);
         toast({
           title: "Profile Updated",
           description: "Your profile has been updated.",
         });
      }

      // Finally, trigger a profile refresh after any changes
      const profile = await fetchUserProfile(user.uid);
       setUserProfile(profile);

    } catch (err: any) {
      console.error("Error creating or updating user profile:", err);
      setError(err.message || "Failed to create or update user profile.");
      toast({
        variant: "destructive",
        title: 'Profile Update Failed',
        description: err.message || "Could not create/update user profile. Please try again.",
      });
    }
  };


  const signInWithGoogle = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const referralCode =  new URLSearchParams(window.location.search).get('ref'); //check on signup
      console.log("Google Sign-In successful, UID:", user.uid, "Referral code from URL:", referralCode);
      await createOrUpdateUserProfile(user,referralCode); // common function for Google Sign-in too.

       toast({
         title: "Sign-in Successful",
         description: "You have been successfully signed in with Google.",
       });

    } catch (err: any) {
       console.error("Google Sign-In failed:", err);
       let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
        if (err.code) {
           switch (err.code) {
             case 'auth/popup-closed-by-user':
               errorMessage = 'The sign-in popup was closed by the user before completion.';
               break;
             case 'auth/account-exists-with-different-credential':
               errorMessage = 'An account with the same email address already exists but with different sign-in details. Please try another login method.';
               break;
             case 'auth/auth-domain-config-required':
               errorMessage = 'The Auth domain is not properly configured. Please contact support.';
               break;
             default:
               errorMessage = `Google Sign-In error (${err.code}): ${err.message}`;
           }
         }
         setError(errorMessage);
         toast({
           variant: "destructive",
           title: 'Google Sign-In Failed',
           description: errorMessage,
         });
    }
  };

  const signOut = async () => {
    setError(null);
    try {
      await firebaseSignOut(auth);
       toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
    } catch (error:any) {
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
       toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
    }
  };

  // Implement function to increment referral count
 async function incrementReferralCount(referralCode: string): Promise<void> {
   if (!db) {
     console.error("DB is not initialized, cannot increment referral count.");
     return;
   }

   try {
     const usersRef = collection(db, 'users');
     const q = query(usersRef, where('referralCode', '==', referralCode), limit(1));
     const querySnapshot = await getDocs(q);

     if (!querySnapshot.empty) {
       const userDoc = querySnapshot.docs[0].ref; // Get the DocumentReference
       await updateDoc(userDoc, {
         referralCount:  increment(1), // Increment using FieldValue.increment()
         referralBonusEarned: increment(50), // add 50 cash bonus too
         updatedAt: serverTimestamp(),
       });
       console.log(`Referral count incremented successfully for code: ${referralCode}`);
     } else {
       console.warn(`No user found with referral code: ${referralCode}`);
     }
   } catch (err: any) {
     console.error("Error incrementing referral count:", err);
     setError(`Failed to increment referral count. ${err.message}`);
   }
 }


  const authContextValue: AuthContextType = {
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
  };

  // Ensure correct JSX syntax
  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};
