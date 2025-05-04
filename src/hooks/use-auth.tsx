// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useContext, createContext, ReactNode, useMemo, useCallback } from 'react';
import type { User as FirebaseUser } from 'firebase/auth'; // Rename to avoid conflict
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, onSnapshot, DocumentData, Timestamp, setDoc, serverTimestamp, getDoc, collection, query, where, limit, getDocs, updateDoc, increment, runTransaction } from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, User } from '@/lib/types'; // Use the User type defined in types.ts
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';

const isFirebaseAvailable = !!auth && !!db && !firebaseInitializationError;
const googleProvider = isFirebaseAvailable ? new GoogleAuthProvider() : null; // Initialize only if available

interface AuthContextType {
  user: User | null; // Use the User type from types.ts
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  authError?: string | null;
  initializationError?: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();

  const generateReferralCode = (): string => {
    return uuidv4().substring(0, 8).toUpperCase();
  };

  const createOrUpdateUserProfile = useCallback(async (userToUpdate: User, referredByCode?: string | null): Promise<UserProfile | null> => {
    if (!userToUpdate || !db) {
      console.error("User or Firestore DB instance is null, cannot create/update profile.");
      throw new Error("User or DB not available for profile update.");
    }
    const userDocRef = doc(db, 'users', userToUpdate.uid);
    console.log(`Attempting to create/update profile for user: ${userToUpdate.uid}`);

    try {
      let finalProfileData: UserProfile | null = null;
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(userDocRef);
        let existingData: Partial<UserProfile> = {};
        let isNewUserDocument = !docSnap.exists();

        if (docSnap.exists()) {
          existingData = docSnap.data() as Partial<UserProfile>;
        }

        let referredByUid: string | null = null;
        let referrerDocRef: any = null;
        let shouldIncrementReferrer = false;

        if (isNewUserDocument && referredByCode) {
          console.log(`New user, checking referral code: ${referredByCode}`);
          const usersRef = collection(db, 'users');
          // Query outside transaction for checking existence
          const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));
          const querySnapshot = await getDocs(q); // Use getDocs here

          if (!querySnapshot.empty) {
            const referrerDoc = querySnapshot.docs[0];
            if (referrerDoc.id !== userToUpdate.uid) {
              referredByUid = referrerDoc.id;
              referrerDocRef = doc(db, 'users', referredByUid); // Prepare ref for transaction update
              // Check if referrer exists before deciding to increment
              const referrerSnap = await transaction.get(referrerDocRef);
               if (referrerSnap.exists()) {
                 shouldIncrementReferrer = true;
                 console.log(`Referrer found: ${referredByUid}`);
               } else {
                  console.warn(`Referrer document ${referredByUid} does not exist. Cannot increment count.`);
               }
            } else {
              console.warn(`Self-referral attempt ignored for user ${userToUpdate.uid}.`);
            }
          } else {
            console.warn(`Referral code ${referredByCode} not found.`);
          }
        }

        // Determine role: use provided role, then existing, default to 'user'
        const roleToSet = userToUpdate.role ?? existingData.role ?? 'user';
        const existingReferralCode = existingData.referralCode || generateReferralCode();

        const profileToSave: UserProfile = {
          uid: userToUpdate.uid, // Ensure UID is included
          email: userToUpdate.email ?? existingData.email ?? null,
          displayName: userToUpdate.displayName ?? existingData.displayName ?? 'CashEase User',
          photoURL: userToUpdate.photoURL ?? existingData.photoURL ?? null,
          role: roleToSet,
          cashbackBalance: existingData.cashbackBalance ?? 0,
          pendingCashback: existingData.pendingCashback ?? 0,
          lifetimeCashback: existingData.lifetimeCashback ?? 0,
          referralCode: existingReferralCode,
          referralCount: existingData.referralCount ?? 0,
          referralBonusEarned: existingData.referralBonusEarned ?? 0,
          referredBy: isNewUserDocument && referredByUid ? referredByUid : (existingData.referredBy ?? null),
          isDisabled: existingData.isDisabled ?? false,
          createdAt: existingData.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastPayoutRequestAt: existingData.lastPayoutRequestAt ?? null,
          payoutDetails: existingData.payoutDetails ?? undefined,
        };

        // Use set with merge: true for both create and update
        transaction.set(userDocRef, profileToSave, { merge: true });
        console.log(`User profile staged for ${isNewUserDocument ? 'creation' : 'update'} for ${userToUpdate.uid}`);

        if (shouldIncrementReferrer && referrerDocRef) {
          transaction.update(referrerDocRef, { referralCount: increment(1) });
          console.log(`Referrer count increment staged for ${referredByUid}.`);
        }

        // Prepare the data to be returned/set in state *after* the transaction
         finalProfileData = {
              ...profileToSave,
              // Convert server timestamps to Date objects for consistency in state
              createdAt: profileToSave.createdAt instanceof Timestamp ? profileToSave.createdAt.toDate() : (profileToSave.createdAt instanceof Date ? profileToSave.createdAt : new Date()),
              updatedAt: new Date(), // Use current date for immediate state update
               lastPayoutRequestAt: profileToSave.lastPayoutRequestAt instanceof Timestamp ? profileToSave.lastPayoutRequestAt.toDate() : (profileToSave.lastPayoutRequestAt instanceof Date ? profileToSave.lastPayoutRequestAt : null),
         };

      }); // Transaction commits here

      console.log(`Transaction for user ${userToUpdate.uid} profile successful.`);
      return finalProfileData; // Return the processed profile data

    } catch (error) {
      console.error(`Transaction failed for user profile ${userToUpdate.uid}:`, error);
      throw error; // Re-throw error for handling in calling functions
    }
  }, []);

  const mapFirestoreDataToProfile = (docSnap: DocumentData): UserProfile | null => {
    if (!docSnap.exists()) return null;
    const data = docSnap.data()!;
    const safeToDate = (fieldValue: any): Date | null => {
      if (fieldValue instanceof Timestamp) return fieldValue.toDate();
      if (fieldValue instanceof Date) return fieldValue;
      return null;
    };
    const createdAtDate = safeToDate(data.createdAt);
    const updatedAtDate = safeToDate(data.updatedAt);
    const lastPayoutDate = safeToDate(data.lastPayoutRequestAt);

    return {
      uid: docSnap.id,
      email: data.email ?? null,
      displayName: data.displayName ?? 'CashEase User',
      photoURL: data.photoURL ?? null,
      role: data.role ?? 'user',
      cashbackBalance: typeof data.cashbackBalance === 'number' ? data.cashbackBalance : 0,
      pendingCashback: typeof data.pendingCashback === 'number' ? data.pendingCashback : 0,
      lifetimeCashback: typeof data.lifetimeCashback === 'number' ? data.lifetimeCashback : 0,
      referralCode: data.referralCode ?? '', // Ensure referralCode exists
      referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
      referralBonusEarned: typeof data.referralBonusEarned === 'number' ? data.referralBonusEarned : 0,
      referredBy: data.referredBy ?? null,
      isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false,
      createdAt: createdAtDate || new Date(0), // Provide a default Date
      updatedAt: updatedAtDate || createdAtDate || new Date(0), // Provide a default Date
      lastPayoutRequestAt: lastPayoutDate,
      payoutDetails: data.payoutDetails ?? undefined,
    };
  };

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    if (!db) return null;
    const userDocRef = doc(db, 'users', uid);
    try {
      const docSnap = await getDoc(userDocRef);
      return mapFirestoreDataToProfile(docSnap);
    } catch (error) {
      console.error(`Error fetching user profile for UID ${uid}:`, error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseAvailable) {
      const errorMsg = firebaseInitializationError || "Firebase services not available.";
      console.warn(errorMsg);
      setAuthError(errorMsg);
      setLoading(false);
      return;
    }

    console.log("Setting up auth listener...");
    let unsubscribeProfile: () => void = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => { // Make async
      console.log("Auth state changed. Firebase User:", firebaseUser?.uid);
      setUser(firebaseUser);
      unsubscribeProfile(); // Clean up previous listener

      if (firebaseUser) {
        setLoading(true);
        setAuthError(null); // Clear previous errors
        const userDocRef = doc(db, 'users', firebaseUser.uid);

        // Initial fetch to potentially create profile faster
        try {
          const initialSnap = await getDoc(userDocRef);
          if (!initialSnap.exists()) {
            console.log(`Profile for ${firebaseUser.uid} not found on initial check. Attempting creation...`);
             // Check for referral code immediately on new user detection
              let referredByCode: string | null = null;
              if (typeof window !== 'undefined') {
                  const urlParams = new URLSearchParams(window.location.search);
                  referredByCode = urlParams.get('ref');
                  console.log("Initial check - Referral code from URL:", referredByCode);
              }
            await createOrUpdateUserProfile(firebaseUser, referredByCode);
            // Profile data will be set by the listener below
          } else {
             // If profile exists, set it immediately from initial fetch
             const initialProfile = mapFirestoreDataToProfile(initialSnap);
             setUserProfile(initialProfile);
             console.log(`Profile for ${firebaseUser.uid} found on initial check.`);
          }
        } catch (err) {
          console.error("Error during initial profile check/creation:", err);
          setAuthError(`Failed to load or create profile: ${err instanceof Error ? err.message : String(err)}`);
           setUserProfile(null); // Ensure profile is null on error
        } finally {
          // Setup the listener regardless of initial check outcome to catch future updates
            console.log("Setting up profile listener for user:", firebaseUser.uid);
            unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
              console.log("Profile snapshot received via listener. Exists:", docSnap.exists());
              const profileData = mapFirestoreDataToProfile(docSnap);
              setUserProfile(profileData); // Update state with latest data from listener
               if (profileData) {
                   console.log("Processed profile data from listener:", profileData.uid, profileData.role);
               } else {
                   console.warn("Listener received non-existent profile for logged-in user:", firebaseUser.uid);
               }
              setLoading(false); // Mark loading as complete after listener provides data (or confirms non-existence)
            }, (error) => {
              console.error("Error in profile snapshot listener:", error);
              setUserProfile(null);
              setAuthError(`Error listening to profile: ${error.message}`);
              setLoading(false);
            });
        }
      } else {
        console.log("User signed out.");
        setUserProfile(null);
        setLoading(false);
        setAuthError(null);
      }
    }, (error) => {
      console.error("Error in onAuthStateChanged listener:", error);
      setUser(null);
      setUserProfile(null);
      setAuthError(`Authentication error: ${error.message}`);
      setLoading(false);
    });

    return () => {
      console.log("Cleaning up auth and profile listeners.");
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, [createOrUpdateUserProfile, fetchUserProfile]); // Dependencies

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseAvailable || !auth || !googleProvider) {
      const errorMsg = "Cannot sign in with Google: Firebase auth/provider not available.";
      console.error(errorMsg);
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: "Error", description: "Authentication service not ready." });
      return;
    }
    setLoading(true);
    setAuthError(null);

    let referredByCode: string | null = null;
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      referredByCode = urlParams.get('ref');
      console.log("Google Sign-In - Referral code from URL:", referredByCode);
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const googleUser = result.user;
      console.log("Google Sign-In successful for user:", googleUser.uid);

      // Create/update profile, passing referral code. The auth listener will then pick up the user.
      await createOrUpdateUserProfile(googleUser, referredByCode);

      toast({ title: "Signed In", description: `Welcome, ${googleUser.displayName || googleUser.email}!` });
      // Redirect is handled by page components based on updated state

    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      let errorMessage = "Failed to sign in with Google.";
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
                 case 'auth/cancelled-popup-request':
                     errorMessage = 'Multiple sign-in windows opened. Please close the extra windows and try again.';
                     break;
                default:
                   errorMessage = `Google Sign-In failed (${error.code}). Please try again.`;
           }
        }
      setAuthError(errorMessage);
      toast({ variant: "destructive", title: "Sign-In Failed", description: errorMessage });
       setLoading(false); // Ensure loading stops on error
    }
    // Loading state will be managed by the onAuthStateChanged listener upon successful sign-in
  }, [toast, createOrUpdateUserProfile]);

  const signOut = useCallback(async () => {
    if (!isFirebaseAvailable || !auth) {
      console.error("Cannot sign out, Firebase auth is not initialized.");
      return;
    }
    console.log("Signing out...");
    // No need to setLoading(true) here, listener handles state changes
    try {
      await firebaseSignOut(auth);
      console.log("Sign out successful via hook call.");
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    } catch (error) {
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: "Sign Out Error", description: errorMsg });
    }
  }, [toast]);

  const authContextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    signOut,
    signInWithGoogle,
    fetchUserProfile,
    authError,
    initializationError: firebaseInitializationError
  }), [user, userProfile, loading, signOut, signInWithGoogle, fetchUserProfile, authError]);

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
