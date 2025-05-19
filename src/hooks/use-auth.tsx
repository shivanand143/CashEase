
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
    updateEmail as updateFirebaseAuthEmail,
    updatePassword as updateFirebaseAuthPassword
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
    WriteBatch,
    FirestoreError,
    deleteField // Import deleteField
} from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails, CashbackStatus } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { safeToDate } from '@/lib/utils';

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
       console.log(`AUTH: Fetching profile for UID: ${uid}`);
       if (!db) {
           console.error("AUTH: Firestore not initialized for fetchUserProfile");
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
                console.log(`AUTH: Profile fetched successfully for ${uid}. Role: ${profile.role}`);
               return profile;
           } else {
               console.log(`AUTH: No profile found for UID: ${uid}`);
               return null;
           }
       } catch (err) {
           console.error(`AUTH: Error fetching user profile for ${uid}:`, err);
           setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch profile.");
           return null;
       }
   }, [setAuthError]);


 // Function to update user profile data in Firestore
  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
     console.log(`AUTH: Updating profile data for UID: ${uid}`, data);
     if (!db) {
       console.error("AUTH: Firestore not initialized for updateUserProfileData");
       throw new Error("Database connection error.");
     }
     const userDocRef = doc(db, 'users', uid);
     try {
        // Ensure that potentially undefined fields that should be null are set to null
        const updatePayload: Partial<UserProfile> = { ...data };
        if (data.photoURL === '') updatePayload.photoURL = null;
        if (data.payoutDetails && data.payoutDetails.detail === '') {
            // If detail is empty, consider making the whole payoutDetails null or specific parts
            // For now, let's assume if detail is empty, it's an attempt to clear it
        }
        // If a field should be removed, use deleteField()
        // Example: if (data.someOptionalField === undefined) updatePayload.someOptionalField = deleteField();


       await updateDoc(userDocRef, {
         ...updatePayload,
         updatedAt: serverTimestamp(),
       });
       const updatedProfile = await fetchUserProfile(uid); // Refetch to get server-generated timestamps
       if (updatedProfile) {
         setUserProfile(updatedProfile); // Update local state
       }
        console.log(`AUTH: Profile data updated successfully for UID: ${uid}`);
     } catch (err) {
       console.error(`AUTH: Error updating profile data for ${uid}:`, err);
       throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
     }
  }, [fetchUserProfile]);


   const createOrUpdateUserProfile = useCallback(async (
      authUser: User,
      referredByCodeParam?: string | null
    ): Promise<UserProfile | null> => {
      if (!db) {
        console.error("AUTH: Firestore not initialized for createOrUpdateUserProfile");
        setAuthError("Database connection error.");
        return null;
      }
      if (!authUser) {
         console.error("AUTH: AuthUser object is null in createOrUpdateUserProfile.");
         return null;
      }

      const userDocRef = doc(db, 'users', authUser.uid);
      let referrerIdToUse: string | null = null;
      let newProfileData: UserProfile | null = null;
      let isNewUserCreation = false;

      const potentialReferralCodeFromUrl = searchParams?.get('ref')?.trim() || null;
      const finalReferralCode = referredByCodeParam || potentialReferralCodeFromUrl;

      console.log(`AUTH: [Profile Setup] Starting for UID: ${authUser.uid}. Final Referral Code to check: "${finalReferralCode}"`);

      if (finalReferralCode) {
        console.log(`AUTH: [Referral Check] Searching for referrer with code: "${finalReferralCode}"`);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('referralCode', '==', finalReferralCode), limit(1));
        try {
          const referrerSnap = await getDocs(q);
          if (!referrerSnap.empty) {
            const referrerDoc = referrerSnap.docs[0];
            if (referrerDoc.id !== authUser.uid) {
              referrerIdToUse = referrerDoc.id;
              console.log(`AUTH: [Referral Check] Referrer ID found: ${referrerIdToUse} for code ${finalReferralCode}`);
            } else {
              console.warn(`AUTH: [Referral Check] Self-referral attempt ignored for code "${finalReferralCode}".`);
            }
          } else {
            console.warn(`AUTH: [Referral Check] Referrer with code "${finalReferralCode}" not found.`);
          }
        } catch (queryError) {
          console.error("AUTH: [Referral Check] Error querying referrer:", queryError);
        }
      } else {
        console.log("AUTH: [Referral Check] No referral code provided or found.");
      }

      try {
        newProfileData = await runTransaction(db, async (transaction) => {
          console.log(`AUTH: [Transaction] Running for UID: ${authUser.uid}`);
          const docSnap = await transaction.get(userDocRef);
          let userProfileData: UserProfile;

          if (docSnap.exists()) {
            const existingData = docSnap.data() as UserProfile;
            console.log(`AUTH: [Transaction] Updating existing user: ${authUser.uid}. Current referredBy: ${existingData.referredBy}`);
            const updateData: Partial<UserProfile> = {
              displayName: authUser.displayName || existingData.displayName || "User",
              photoURL: authUser.photoURL || existingData.photoURL,
              email: authUser.email || existingData.email,
              updatedAt: serverTimestamp(),
              referredBy: existingData.referredBy === null && referrerIdToUse ? referrerIdToUse : existingData.referredBy,
            };
             if ('role' in authUser && (authUser as any).role === 'admin' && existingData.role !== 'admin') {
                console.log("AUTH: [Transaction] Promoting user to admin role.");
                updateData.role = 'admin';
            } else if ('role' in authUser && (authUser as any).role !== existingData.role) {
                console.warn(`AUTH: [Transaction] Unauthorized role change attempt for ${authUser.uid} from ${existingData.role} to ${(authUser as any).role}. Ignoring.`);
            }


            transaction.update(userDocRef, updateData);
             // Reconstruct the profile with updates, ensuring all fields are present
            userProfileData = {
                ...existingData, // Start with all existing fields
                ...updateData,   // Override with new/updated fields
                // Explicitly carry over fields that should not change if not in updateData
                uid: existingData.uid,
                role: updateData.role || existingData.role,
                cashbackBalance: existingData.cashbackBalance ?? 0,
                pendingCashback: existingData.pendingCashback ?? 0,
                lifetimeCashback: existingData.lifetimeCashback ?? 0,
                referralCode: existingData.referralCode, // Should not change on update
                referralCount: existingData.referralCount ?? 0,
                referralBonusEarned: existingData.referralBonusEarned ?? 0,
                isDisabled: existingData.isDisabled ?? false,
                createdAt: existingData.createdAt, // Should not change
                lastPayoutRequestAt: existingData.lastPayoutRequestAt,
                payoutDetails: existingData.payoutDetails,
            };

             if (userProfileData.createdAt instanceof Timestamp) userProfileData.createdAt = userProfileData.createdAt.toDate();
             userProfileData.updatedAt = new Date(); // Set to current date for updates
             if (userProfileData.lastPayoutRequestAt instanceof Timestamp) userProfileData.lastPayoutRequestAt = userProfileData.lastPayoutRequestAt.toDate();
             else userProfileData.lastPayoutRequestAt = null;
            console.log(`AUTH: [Transaction] Existing user profile update prepared. Referred By: ${userProfileData.referredBy}, Role: ${userProfileData.role}`);
          } else {
            isNewUserCreation = true;
            const referralCodeValue = uuidv4().substring(0, 8).toUpperCase();
            console.log(`AUTH: [Transaction] Creating new user: ${authUser.uid}, Assigned Referral Code: ${referralCodeValue}`);
            console.log(`AUTH: [Transaction] Setting referredBy field for new user to: ${referrerIdToUse}`);

            userProfileData = {
              uid: authUser.uid,
              email: authUser.email ?? null,
              displayName: authUser.displayName ?? "New User",
              photoURL: authUser.photoURL ?? null,
              role: authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID ? 'admin' : 'user',
              cashbackBalance: 0,
              pendingCashback: 0,
              lifetimeCashback: 0,
              referralCode: referralCodeValue,
              referralCount: 0,
              referralBonusEarned: 0,
              referredBy: referrerIdToUse,
              isDisabled: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              lastPayoutRequestAt: null,
              payoutDetails: null,
            };
            transaction.set(userDocRef, userProfileData);
            console.log(`AUTH: [Transaction] New user profile data prepared. Referred By ID: ${userProfileData.referredBy}, Role: ${userProfileData.role}`);
          }

          if (isNewUserCreation && referrerIdToUse) {
            console.log(`AUTH: [Transaction] New user was referred by ${referrerIdToUse}. Preparing referrer update.`);
            const referrerDocRef = doc(db, 'users', referrerIdToUse);
            // No need to transaction.get(referrerDocRef) again if we're just updating
            // However, if you needed to read its current state to make a conditional update, you would.
            const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");
            transaction.update(referrerDocRef, {
              referralCount: increment(1),
              // referralBonusEarned: increment(referralBonusAmount), // Let's assume bonus is given after first purchase confirmation
              updatedAt: serverTimestamp(),
            });
            console.log(`AUTH: [Transaction] Referrer count update prepared for: ${referrerIdToUse}. Bonus will be applied later.`);
          } else if (isNewUserCreation) {
             console.log("AUTH: [Transaction] New user, but no valid referrer ID. Skipping referrer update.");
          }
          return userProfileData;
        });

        if (newProfileData) {
          const finalProfile = { ...newProfileData } as UserProfile;
          if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
          finalProfile.updatedAt = new Date();
          if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
           else finalProfile.lastPayoutRequestAt = null;


          console.log(`AUTH: [Profile Setup] Operation complete for ${authUser.uid}. Final Profile State:`, JSON.stringify(finalProfile, null, 2));
          setUserProfile(finalProfile);
          return finalProfile;
        } else {
          throw new Error("Profile creation/update transaction returned null.");
        }
      } catch (err) {
        console.error(`AUTH: [Profile Setup] Error in profile transaction for ${authUser.uid}:`, err);
        let errorMsg = "Failed to set up profile.";
        if (err instanceof FirestoreError) {
            errorMsg = `Firestore error (${err.code}): ${err.message}`;
        } else if (err instanceof Error) {
            errorMsg = `Profile setup error: ${err.message}`;
        }
        setAuthError(errorMsg);
        return null;
      }
    }, [setAuthError, searchParams, fetchUserProfile]); // fetchUserProfile removed as it's stable


  // Effect to listen for authentication state changes
  useEffect(() => {
    if (firebaseInitializationError) {
        console.error("AUTH: Firebase initialization failed:", firebaseInitializationError);
        setAuthError(firebaseInitializationError);
        setLoading(false);
        return () => {};
    }
    if (!auth) {
        console.warn("AUTH: Auth service not yet available in useEffect listener setup.");
        return () => {};
    }

    console.log("AUTH: Setting up onAuthStateChanged listener...");
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      console.log("AUTH: Auth state changed. Current authUser:", authUser ? authUser.uid : 'null');
      setAuthError(null);

      if (authUser) {
        console.log(`AUTH: User ${authUser.uid} detected by onAuthStateChanged. Attempting to set user and fetch/create profile.`);
        setUser(authUser); // Set Firebase User object
        try {
          let profile = await fetchUserProfile(authUser.uid);
          if (!profile) {
             console.log(`AUTH: No Firestore profile found for ${authUser.uid}, attempting to create/update...`);
             const urlReferralCode = searchParams?.get('ref');
             profile = await createOrUpdateUserProfile(authUser, urlReferralCode);
             if (profile) {
                console.log(`AUTH: Firestore profile created/updated successfully for ${authUser.uid}.`);
             } else {
                console.error(`AUTH: CRITICAL - Failed to create/update Firestore profile for ${authUser.uid} after auth state change.`);
                // This is a critical failure. We might not want to proceed with setting userProfile to null,
                // as it could hide underlying issues or lead to inconsistent states.
                // Setting authError is important here.
                setAuthError("Failed to establish user profile during sign-in. Please try again or contact support.");
                setUserProfile(null); // Explicitly nullify if profile setup fails.
                setLoading(false);
                return; // Exit early if profile setup fails critically
             }
          } else {
             console.log(`AUTH: Firestore profile successfully fetched for ${authUser.uid}.`);
             // Sync Auth display name/photo with Firestore if necessary
              if (
                 (authUser.displayName && profile.displayName !== authUser.displayName) ||
                 (authUser.photoURL && profile.photoURL !== authUser.photoURL) ||
                 (authUser.email && profile.email !== authUser.email)
               ) {
                 console.log(`AUTH: Auth user data mismatch for ${authUser.uid}. Syncing Firestore profile.`);
                 await updateUserProfileData(authUser.uid, {
                   displayName: authUser.displayName,
                   photoURL: authUser.photoURL,
                   email: authUser.email,
                 });
                 profile = await fetchUserProfile(authUser.uid); // Re-fetch after update
               }
          }
          setUserProfile(profile);
          console.log(`AUTH: User profile set for ${authUser.uid}. Loading complete.`);
        } catch (profileError) {
          console.error("AUTH: Error during profile processing in onAuthStateChanged:", profileError);
          setAuthError(profileError instanceof Error ? profileError.message : "Error loading profile.");
          setUserProfile(null);
        } finally {
          setLoading(false);
        }
      } else {
        console.log("AUTH: No authUser in onAuthStateChanged. User signed out.");
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    },
    (error) => {
      console.error("AUTH: Error in onAuthStateChanged listener itself:", error);
      setAuthError(`Authentication listener error: ${error.message}`);
      setUser(null);
      setUserProfile(null);
      setLoading(false);
    });

    return () => {
      console.log("AUTH: Cleaning up onAuthStateChanged listener.");
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData removed to break potential loops, they use useCallback


  // Function to sign out the user
  const signOut = async () => {
    if (!auth) {
      setAuthError("Authentication service not available.");
      return;
    }
    console.log("AUTH: Signing out...");
    setLoading(true);
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      console.log("AUTH: Sign out successful. onAuthStateChanged will handle state reset.");
    } catch (error) {
      console.error('AUTH: Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false);
    }
  };

  // Function to sign in with Google
  const signInWithGoogle = async () => {
    if (firebaseInitializationError || !auth) {
      setAuthError(firebaseInitializationError || "Authentication service not available.");
      toast({ variant: "destructive", title: "Auth Error", description: firebaseInitializationError || "Authentication service failed." });
      setLoading(false);
      return;
    }
    console.log("AUTH: Starting Google Sign-In...");
    setLoading(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Force account chooser

    const urlReferralCode = searchParams?.get('ref');
    console.log(`AUTH: Google Sign-In initiated. Referral code from URL (if any): ${urlReferralCode}`);

    try {
      console.log("AUTH: Calling signInWithPopup...");
      const result = await signInWithPopup(auth, provider);
      const authUser = result.user;
      console.log("AUTH: Google signInWithPopup successful for user:", authUser.uid, "Email:", authUser.email);
      console.log("AUTH: User credential from popup:", result); // Log the full result for more info
      console.log("AUTH: onAuthStateChanged will now handle profile creation/update for this user.");
      // Profile creation/update & success toast are handled by onAuthStateChanged listener
      // which will be triggered by the auth state change.
      // It's important that onAuthStateChanged is robust.
    } catch (err) {
      console.error("AUTH: Google Sign-In signInWithPopup FAILED:", err); // Log the full error
      let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
      let toastTitle = 'Sign-In Failed';
      const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';

      if (err instanceof FirebaseError) {
        toastTitle = 'Google Sign-In Error';
        console.error(`AUTH: FirebaseError code: ${err.code}, message: ${err.message}`);
        switch (err.code) {
          case 'auth/popup-closed-by-user':
          case 'auth/cancelled-popup-request':
             errorMessage = "Sign-in cancelled. If you didn't close the window, please check your browser settings (popups, third-party cookies, extensions) or try an incognito window. Also ensure this domain is authorized in Firebase and Google Cloud Console.";
             toastTitle = 'Sign-In Cancelled or Interrupted';
             console.log("AUTH: Google Sign-In popup closed by user or cancelled. This might also indicate a redirect URI or domain authorization issue after Google's part.");
             break;
          case 'auth/popup-blocked':
             errorMessage = "Sign-in popup blocked by your browser. Please allow popups for this site and try again. Also check for ad-blockers or privacy extensions.";
             toastTitle = 'Popup Blocked';
             console.warn("AUTH: Google Sign-In popup blocked by browser.");
             break;
          case 'auth/unauthorized-domain':
             errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Please contact support if this issue persists. Admin: Ensure this domain is in Firebase Auth authorized domains and Google Cloud Console OAuth redirect URIs.`;
             console.error(`AUTH: Unauthorized domain: ${currentDomain}.`);
             break;
          case 'auth/internal-error':
             errorMessage = "An internal error occurred on the authentication server (e.g., misconfiguration, temporary issue). Please try again later.";
             console.error("AUTH: Internal Firebase error during sign-in:", err);
             break;
          case 'auth/network-request-failed':
             errorMessage = "Network error during sign-in. Please check your internet connection and try again.";
             console.warn("AUTH: Network error during Google sign-in.");
             break;
         default:
           errorMessage = `Google Sign-In failed (${err.code || 'unknown'}). Please try again. Details: ${err.message}`;
           console.error(`AUTH: Unknown Firebase error during sign-in: ${err.code}`, err);
       }
     } else if (err instanceof Error) { // Handle non-Firebase errors
         errorMessage = `An application error occurred: ${err.message}`;
         console.error(`AUTH: Non-Firebase error during Google sign-in process: ${err.message}`, err);
     }

      setAuthError(errorMessage);
      toast({
        variant: "destructive",
        title: toastTitle,
        description: errorMessage,
        duration: 15000, // Longer duration for detailed messages
      });
      setLoading(false); // Ensure loading stops on any error during the popup phase
    }
  };


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
  }), [user, userProfile, loading, authError, signOut, signInWithGoogle, createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData]);


  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

    