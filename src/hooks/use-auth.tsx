// src/hooks/use-auth.tsx
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
                createdAt: createdAt || new Date(0),
                updatedAt: updatedAt || new Date(0),
                lastPayoutRequestAt: lastPayoutRequestAt,
                payoutDetails: profileData.payoutDetails ?? null,
              };
              console.log(`Profile found for ${uid}.`);
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
      const updatedProfile = await fetchUserProfile(uid);
      if (updatedProfile) {
        setUserProfile(updatedProfile); // Update local state
      }
      console.log(`Profile data updated successfully for UID: ${uid}`);
    } catch (err) {
      console.error(`Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
 }, [fetchUserProfile]); // Include fetchUserProfile

  // Function to create or update user profile in Firestore, handling referrals
  const createOrUpdateUserProfile = useCallback(async (
      authUser: User,
      referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
      if (!db) {
          console.error("Firestore not initialized for createOrUpdateUserProfile");
          setAuthError("Database connection error.");
          return null;
      }

      const referredByCode = (referredByCodeParam ?? searchParams?.get('ref'))?.trim() || null;
      console.log(`[Profile] Starting for UID: ${authUser.uid}. Input Referral Code: ${referredByCode}`);

      const userDocRef = doc(db, 'users', authUser.uid);
      let referrerRef: DocumentReference | null = null;
      let referrerId: string | null = null;
      let referrerData: UserProfile | null = null; // Store referrer's data

      // --- Find Referrer (if applicable) ---
      if (referredByCode) {
          console.log(`[Profile] Searching for referrer with code: "${referredByCode}"`);
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('referralCode', '==', referredByCode), limit(1));
          try {
              const referrerSnap = await getDocs(q);
              if (!referrerSnap.empty) {
                  const referrerDoc = referrerSnap.docs[0];
                  if (referrerDoc.id === authUser.uid) {
                      console.warn(`[Profile] User ${authUser.uid} tried to refer themselves. Ignoring.`);
                  } else {
                      referrerRef = doc(db, 'users', referrerDoc.id);
                      referrerId = referrerDoc.id;
                      referrerData = referrerDoc.data() as UserProfile; // Store potential referrer data
                      console.log(`[Profile] Referrer found: ${referrerId}`);
                  }
              } else {
                  console.warn(`[Profile] Referrer with code "${referredByCode}" not found.`);
              }
          } catch (queryError) {
              console.error("[Profile] Error querying referrer:", queryError);
              // Log but proceed without referral if query fails
              referrerRef = null;
              referrerId = null;
              referrerData = null;
          }
      } else {
          console.log("[Profile] No referral code provided.");
      }

      // --- Firestore Transaction ---
      try {
          const profile = await runTransaction(db, async (transaction) => {
              console.log(`[Transaction] Running for UID: ${authUser.uid}`);
              const docSnap = await transaction.get(userDocRef);
              let userProfileData: UserProfile;
              let isNewUser = false;

              if (docSnap.exists()) {
                  // --- Update Existing User ---
                  const existingData = docSnap.data() as UserProfile;
                  console.log(`[Transaction] Updating existing user: ${authUser.uid}`);
                  const updateData: Partial<UserProfile> = {
                      displayName: authUser.displayName || existingData.displayName,
                      photoURL: authUser.photoURL || existingData.photoURL,
                      email: authUser.email || existingData.email, // Keep email consistent
                      updatedAt: serverTimestamp(),
                      // Only update specific fields, preserve others like role, balances, referral info
                  };
                  transaction.update(userDocRef, updateData);
                  userProfileData = { ...existingData, ...updateData }; // Merge updateData into existing
                  isNewUser = false;
                   console.log("[Transaction] Existing user profile updated.");

              } else {
                  // --- Create New User ---
                  isNewUser = true;
                  const referralCode = uuidv4().substring(0, 8).toUpperCase();
                  console.log(`[Transaction] Creating new user: ${authUser.uid}, Referral Code: ${referralCode}`);

                  // Check if a valid referrer was found *before* creating the profile
                  const actualReferredById = referrerId; // Use the ID found before transaction

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
                      referredBy: actualReferredById, // Set referredBy ID here
                      isDisabled: false,
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp(),
                      lastPayoutRequestAt: null,
                      payoutDetails: null,
                  };
                  transaction.set(userDocRef, userProfileData);
                  console.log(`[Transaction] New user profile data prepared. Referred By ID: ${actualReferredById}`);
              }

              // --- Update Referrer Count (Only for NEW users with a VALID referrer) ---
              if (isNewUser && referrerRef && referrerId) {
                   console.log(`[Transaction] New user referred by ${referrerId}. Attempting to update referrer's count.`);
                    try {
                        // Read the referrer document *within* the transaction to ensure atomicity
                        const referrerDocSnap = await transaction.get(referrerRef);
                        if (referrerDocSnap.exists()) {
                            transaction.update(referrerRef, {
                                referralCount: increment(1),
                                // NOTE: Awarding bonus (e.g., 50 INR) should ideally happen via a Cloud Function
                                // triggered AFTER the new user makes a qualifying purchase/action.
                                // Directly incrementing bonus here might be premature.
                                // referralBonusEarned: increment(50), // Example - REMOVE if handled elsewhere
                                updatedAt: serverTimestamp(),
                            });
                            console.log(`[Transaction] Referrer count update prepared for: ${referrerId}`);
                        } else {
                             console.warn(`[Transaction] Referrer ${referrerId} document disappeared during transaction. Cannot update count.`);
                        }
                    } catch (referrerUpdateError) {
                        console.error(`[Transaction] Failed to read/update referrer ${referrerId} within transaction:`, referrerUpdateError);
                        // Allow signup to succeed, but log the referrer update failure.
                        // To fail the signup if referrer update fails, re-throw the error:
                        // throw referrerUpdateError;
                    }
              } else if (isNewUser) {
                   console.log("[Transaction] New user, but no valid referrer or self-referral attempt. Skipping referrer update.");
              }

              return userProfileData; // Return profile data
          });

          // --- Convert Timestamps and Return ---
          if (profile) {
              const finalProfile = { ...profile } as UserProfile; // Create a mutable copy
              // Convert server timestamps to Dates for client-side use
              if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
              if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
              if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
              else finalProfile.lastPayoutRequestAt = null; // Ensure it's Date or null

              console.log(`[Profile] Operation complete for ${authUser.uid}. Final Profile:`, finalProfile);
              return finalProfile;
          } else {
              throw new Error("Profile creation/update transaction failed unexpectedly.");
          }

      } catch (err) {
          console.error(`[Profile] Error in profile transaction for ${authUser.uid}:`, err);
          setAuthError(err instanceof Error ? `Profile setup error: ${err.message}` : "Failed to set up profile.");
          return null;
      }
  }, [setAuthError, searchParams, fetchUserProfile, updateUserProfileData]); // Include updateUserProfileData

  // Effect to listen for authentication state changes
  useEffect(() => {
      if (firebaseInitializationError) {
          setAuthError(firebaseInitializationError);
          setLoading(false);
          return;
      }
      if (!auth) {
          setAuthError("Authentication service not available.");
          setLoading(false);
          return;
      }

      console.log("Setting up onAuthStateChanged listener...");
      const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
          console.log("Auth state changed. User:", authUser?.uid);
          setAuthError(null);

          if (authUser) {
              setUser(authUser);
              try {
                  let profile = await fetchUserProfile(authUser.uid);
                  if (!profile) {
                      console.log(`Profile not found for ${authUser.uid}, attempting creation...`);
                      const urlReferralCode = searchParams?.get('ref');
                      profile = await createOrUpdateUserProfile(authUser, urlReferralCode);
                  } else {
                      console.log(`Profile fetched successfully for ${authUser.uid}`);
                  }

                  if (profile) {
                      setUserProfile(profile);
                  } else {
                      console.error("Failed to load or create profile for user:", authUser.uid);
                      setAuthError("Failed to load or create user profile.");
                      // Consider signing out if profile is mandatory
                      // await firebaseSignOut(auth);
                      // setUser(null);
                  }
              } catch (profileError) {
                   console.error("Error during profile fetch/create in onAuthStateChanged:", profileError);
                   setAuthError(profileError instanceof Error ? profileError.message : "An error occurred loading profile data.");
                   // setUserProfile(null); // Clear profile on error
              } finally {
                   setLoading(false);
              }
          } else {
              setUser(null);
              setUserProfile(null);
              setLoading(false);
          }
      },
      (error) => {
          console.error("Error in onAuthStateChanged listener:", error);
          setAuthError(`Authentication listener error: ${error.message}`);
          setUser(null);
          setUserProfile(null);
          setLoading(false);
      });

      return () => {
          console.log("Cleaning up auth subscription.");
          unsubscribe();
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Keep dependencies minimal for listener setup

  // Function to sign out the user
  const signOut = async () => {
    if (!auth) {
      setAuthError("Authentication service not available.");
      return;
    }
    setLoading(true);
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // State updates handled by onAuthStateChanged
    } catch (error) {
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false); // Ensure loading is false on error
    }
  };

  // Function to sign in with Google
  const signInWithGoogle = async () => {
    if (!auth) {
        setAuthError("Authentication service not available.");
        toast({ variant: "destructive", title: "Auth Error", description: "Authentication service failed." });
        return;
    }
    setLoading(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    const urlReferralCode = searchParams?.get('ref'); // Get referral code *before* popup

    try {
        const result = await signInWithPopup(auth, provider);
        const authUser = result.user;
        console.log("Google Sign-In successful for user:", authUser.uid);

        // Explicitly call createOrUpdateUserProfile *after* successful Google sign-in
        // This ensures the profile is handled correctly, especially for new users with referrals
        const profile = await createOrUpdateUserProfile(authUser, urlReferralCode);

        if (profile) {
           setUserProfile(profile); // Update local state immediately
           toast({ title: "Sign-In Successful", description: `Welcome, ${profile.displayName || 'User'}!` });
           router.push('/dashboard');
        } else {
            // Handle profile creation/update failure after sign-in
            throw new Error("Failed to setup profile after Google Sign-In.");
        }

    } catch (err) {
        console.error("Google Sign-In or profile setup failed:", err);
        let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';

        if (err instanceof FirebaseError) {
            switch (err.code) {
                case 'auth/popup-closed-by-user':
                case 'auth/cancelled-popup-request':
                    errorMessage = "Sign-in cancelled. The Google sign-in window was closed or the request was cancelled.";
                    break;
                case 'auth/popup-blocked':
                    errorMessage = "Sign-in popup blocked. Please allow popups for this site and try again.";
                    break;
                case 'auth/unauthorized-domain':
                    errorMessage = `Sign-in failed. This domain (${currentDomain}) is not authorized for Firebase Authentication. Please check your Firebase console settings. Ensure '${currentDomain}' and potentially 'localhost' or '127.0.0.1' (with port if needed) are added.`;
                    break;
                case 'auth/internal-error':
                    errorMessage = "An internal error occurred during sign-in. Please try again later.";
                    break;
                case 'auth/network-request-failed':
                    errorMessage = "Network error during sign-in. Please check your connection.";
                    break;
                default:
                    errorMessage = `Sign-in error (${err.code || 'unknown'}). Please try again.`;
            }
        } else if (err instanceof Error) {
            errorMessage = err.message; // Use the message from the profile setup error
        }

        setAuthError(errorMessage);
        toast({
            variant: "destructive",
            title: 'Sign-In Failed',
            description: errorMessage,
            duration: 9000,
        });
        setLoading(false);
    }
    // Loading state is handled by onAuthStateChanged or the catch block
  };


  // Memoize the context value
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      signOut,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      signInWithGoogle,
      createOrUpdateUserProfile,
      fetchUserProfile,
      updateUserProfileData
  ]);

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
