
// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import {
    onAuthStateChanged,
    User,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    signInWithRedirect,
    getRedirectResult,
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
    FirestoreError
} from 'firebase/firestore';
import { auth as firebaseAuthService, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { safeToDate } from '@/lib/utils';

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`AUTH: fetchUserProfile called for UID: ${uid}`);
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
          createdAt: safeToDate(profileData.createdAt) || new Date(0),
          updatedAt: safeToDate(profileData.updatedAt) || new Date(0),
          lastPayoutRequestAt: safeToDate(profileData.lastPayoutRequestAt),
          payoutDetails: profileData.payoutDetails ?? null,
        };
        console.log(`AUTH: Profile fetched successfully for ${uid}. Profile:`, profile);
        return profile;
      } else {
        console.warn(`AUTH: No profile found for UID: ${uid} in fetchUserProfile.`);
        return null;
      }
    } catch (err) {
      console.error(`AUTH: Error fetching user profile for ${uid}:`, err);
      setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch profile.");
      return null;
    }
  }, []);

  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
    console.log(`AUTH: updateUserProfileData called for UID: ${uid}`, data);
    if (!db) {
      console.error("AUTH: Firestore not initialized for updateUserProfileData");
      throw new Error("Database connection error.");
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatePayload: Partial<UserProfile> = { ...data };
      if (data.photoURL === '') updatePayload.photoURL = null;
      
      const dataWithTimestamp: Record<string, any> = { ...updatePayload, updatedAt: serverTimestamp() };
      if (data.createdAt === undefined && !updatePayload.createdAt) { // Only set createdAt if not already present
         // dataWithTimestamp.createdAt = serverTimestamp(); // This should only be set on creation.
      }


      await updateDoc(userDocRef, dataWithTimestamp);
      const updatedProfile = await fetchUserProfile(uid);
      if (updatedProfile) {
        setUserProfile(updatedProfile);
        console.log(`AUTH: Profile data updated and re-fetched successfully for UID: ${uid}`);
      } else {
        console.warn(`AUTH: Profile data updated for UID: ${uid}, but re-fetch returned null.`);
      }
    } catch (err) {
      console.error(`AUTH: Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
  }, [fetchUserProfile]);

  const createOrUpdateUserProfile = useCallback(async (
    authUser: User,
    referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
    console.log(`AUTH: createOrUpdateUserProfile called for UID: ${authUser.uid}. AuthUser display Name: ${authUser.displayName}`);
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

    const sessionReferralCode = typeof window !== 'undefined' ? sessionStorage.getItem('pendingReferralCode') : null;
    const potentialReferralCodeFromUrl = searchParams?.get('ref')?.trim() || null;
    const finalReferralCode = referredByCodeParam || sessionReferralCode || potentialReferralCodeFromUrl;

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
            displayName: authUser.displayName || existingData.displayName || "MagicSaver User",
            photoURL: authUser.photoURL || existingData.photoURL || null,
            email: authUser.email || existingData.email, // AuthUser email is source of truth
            updatedAt: serverTimestamp(),
            // Only set referredBy if it's currently null and a valid referrerIdToUse is found
            referredBy: existingData.referredBy === null && referrerIdToUse ? referrerIdToUse : existingData.referredBy,
          };
          
          if (authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && existingData.role !== 'admin') {
            updateData.role = 'admin';
          } else if (!existingData.role) {
            updateData.role = 'user';
          }

          transaction.update(userDocRef, updateData);
          // Construct the profile data based on existing data + updates
          userProfileData = {
            ...existingData,
            ...updateData,
            uid: existingData.uid, // Ensure UID is from existing data
            role: updateData.role || existingData.role || 'user', // Ensure role is set
            createdAt: safeToDate(existingData.createdAt) || serverTimestamp(), // Keep existing or set new
          };
        } else {
          isNewUserCreation = true;
          const referralCodeValue = uuidv4().substring(0, 8).toUpperCase();
          console.log(`AUTH: [Transaction] Creating new user: ${authUser.uid}, DisplayName from Auth: ${authUser.displayName}, Assigned Referral Code: ${referralCodeValue}, Referred By ID: ${referrerIdToUse}`);
          
          userProfileData = {
            uid: authUser.uid,
            email: authUser.email ?? null,
            displayName: authUser.displayName || "MagicSaver User", // Use Google's display name or default
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
        }

        if (isNewUserCreation && referrerIdToUse) {
          console.log(`AUTH: [Transaction] New user ${authUser.uid} was referred by ${referrerIdToUse}. Incrementing referrer's count.`);
          const referrerDocRef = doc(db, 'users', referrerIdToUse);
          const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");

          transaction.update(referrerDocRef, {
            referralCount: increment(1),
            referralBonusEarned: increment(referralBonusAmount),
            updatedAt: serverTimestamp(),
          });
        }
        return userProfileData;
      });

      if (newProfileData) {
        const finalProfile = { ...newProfileData } as UserProfile;
        // Convert server timestamps to JS Dates for client-side state
        if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
        else if (typeof finalProfile.createdAt === 'object' && finalProfile.createdAt !== null) finalProfile.createdAt = new Date();
        else if (!finalProfile.createdAt) finalProfile.createdAt = new Date();

        if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
        else if (typeof finalProfile.updatedAt === 'object' && finalProfile.updatedAt !== null) finalProfile.updatedAt = new Date();
        else if (!finalProfile.updatedAt) finalProfile.updatedAt = new Date();

        if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
        else finalProfile.lastPayoutRequestAt = null;

        console.log(`AUTH: [Profile Setup] Operation complete for ${authUser.uid}. Profile to set in state:`, finalProfile);
        setUserProfile(finalProfile); // This should trigger re-render in Header
        if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
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
      if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
      return null;
    }
  }, [searchParams]);

  useEffect(() => {
    console.log("AUTH: useEffect for auth state triggered.");
    if (firebaseInitializationError) {
      console.error("AUTH: Firebase initialization failed:", firebaseInitializationError);
      setAuthError(firebaseInitializationError);
      setLoading(false);
      return () => {};
    }
    if (!firebaseAuthService) {
      console.warn("AUTH: Auth service not yet available in useEffect listener setup.");
      setLoading(false); // Can't proceed without auth service
      return () => {};
    }

    let processingRedirectResult = false; // Flag to prevent onAuthStateChanged during redirect processing

    const handleAuthFlow = async (authUser: User | null) => {
      setAuthError(null);
      if (authUser) {
        console.log(`AUTH: User [${authUser.uid}] detected. Fetching/creating profile...`);
        setUser(authUser); // Set Firebase auth user immediately
        try {
          let profile = await fetchUserProfile(authUser.uid);
          if (!profile) {
            console.log(`AUTH: No profile for ${authUser.uid}, attempting to create...`);
            const referralCode = sessionStorage.getItem('pendingReferralCode');
            profile = await createOrUpdateUserProfile(authUser, referralCode);
            if (profile) {
              console.log(`AUTH: Profile created for ${authUser.uid}:`, profile);
              if (typeof window !== 'undefined') sessionStorage.removeItem('pendingReferralCode');
            } else {
              console.error(`AUTH: CRITICAL - Failed to create profile for ${authUser.uid}.`);
              setAuthError("Failed to initialize user profile. Please try logging out and in again.");
              setUserProfile(null); // Ensure profile is null if creation failed
              return; // Exit early if profile creation fails
            }
          } else {
             console.log(`AUTH: Existing profile found for ${authUser.uid}:`, profile);
             // Optional: Sync if Firebase Auth user details (displayName, photoURL) are newer
            if (
                (authUser.displayName && authUser.displayName !== profile.displayName) ||
                (authUser.photoURL && authUser.photoURL !== profile.photoURL) ||
                (authUser.email && authUser.email !== profile.email)
            ) {
                console.log(`AUTH: Syncing profile for ${authUser.uid} with latest auth data.`);
                await updateUserProfileData(authUser.uid, {
                    displayName: authUser.displayName,
                    photoURL: authUser.photoURL,
                    email: authUser.email,
                });
                profile = await fetchUserProfile(authUser.uid); // Re-fetch after update
            }
          }
          setUserProfile(profile);
          console.log(`AUTH: Final user profile state set for ${authUser.uid}:`, profile);

          // Handle redirection after profile is set up
          const redirectUrl = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
          const source = sessionStorage.getItem('loginRedirectSource');
          // Only redirect if coming from login/signup or if explicitly told to redirect
          if (source === 'loginPage' || source === 'signupPage' || resultForRedirect?.user) {
            console.log(`AUTH: Redirecting to ${redirectUrl} from ${source || 'redirect result'}`);
            router.push(redirectUrl);
            sessionStorage.removeItem('loginRedirectUrl');
            sessionStorage.removeItem('loginRedirectSource');
          }

        } catch (profileError) {
          console.error("AUTH: Error during profile processing:", profileError);
          setAuthError(profileError instanceof Error ? profileError.message : "Error loading profile.");
          setUserProfile(null);
        }
      } else {
        console.log("AUTH: No authUser. Resetting user and profile states.");
        setUser(null);
        setUserProfile(null);
      }
    };

    // Process redirect result first
    let resultForRedirect: any = null; // Store redirect result to influence redirection logic later
    if (firebaseAuthService) {
        processingRedirectResult = true;
        console.log("AUTH: Attempting to get redirect result...");
        getRedirectResult(firebaseAuthService)
            .then(async (result) => {
                resultForRedirect = result; // Store result
                if (result && result.user) {
                    console.log(`AUTH: Google Sign-In (redirect) successful for UID: ${result.user.uid}`);
                    // User object is now available, onAuthStateChanged will handle profile creation/fetching
                    // We don't call handleAuthFlow here directly to avoid race conditions with onAuthStateChanged
                } else {
                    console.log("AUTH: No redirect result or no user in redirect result.");
                }
            })
            .catch((err) => {
                console.error("AUTH: Error processing getRedirectResult:", err);
                setAuthError(err instanceof Error ? err.message : "Error processing sign-in redirect.");
                toast({ variant: "destructive", title: "Sign-In Error", description: err instanceof Error ? err.message : "Could not process sign-in redirect." });
            })
            .finally(() => {
                processingRedirectResult = false;
                console.log("AUTH: Finished processing redirect result. Current user state (before onAuthStateChanged):", firebaseAuthService.currentUser?.uid);
                // Now that redirect is processed, onAuthStateChanged can reliably handle the current auth state.
                // If onAuthStateChanged already fired, this might trigger a re-evaluation.
                // If a user was found by getRedirectResult, onAuthStateChanged should subsequently fire with that user.
                setLoading(false); // Set loading to false *after* redirect attempt
            });
    } else {
        setLoading(false); // No auth service, so not loading
    }

    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (authUser) => {
      console.log("AUTH: onAuthStateChanged event. Current authUser:", authUser ? authUser.uid : 'null', "Processing redirect flag:", processingRedirectResult);
      if (processingRedirectResult) {
        console.log("AUTH: onAuthStateChanged: still processing redirect result, deferring full handling.");
        // If authUser exists, we can set it, but full profile logic waits for redirect processing.
        if (authUser && !user) { // Only set if different to avoid loop
            setUser(authUser);
        } else if (!authUser && user) {
            setUser(null);
            setUserProfile(null);
        }
        // setLoading will be managed by getRedirectResult's finally block
        return;
      }
      setLoading(true); // Set loading true for auth state change processing
      await handleAuthFlow(authUser);
      setLoading(false);
    }, (error) => {
      console.error("AUTH: Error in onAuthStateChanged listener:", error);
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
  }, []); // Keep dependencies minimal, rely on internal logic and callbacks for updates.

  const signOut = async () => {
    if (!firebaseAuthService) {
      setAuthError("Authentication service not available.");
      return;
    }
    console.log("AUTH: Signing out user...");
    setLoading(true);
    setAuthError(null);
    try {
      await firebaseSignOut(firebaseAuthService);
      console.log("AUTH: Firebase sign out successful.");
      // onAuthStateChanged will handle setting user and userProfile to null
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      router.push('/'); // Redirect to home after sign out
    } catch (error) {
      console.error('AUTH: Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false); // Ensure loading stops on sign-out error
    }
    // setLoading(false) will be handled by onAuthStateChanged setting user to null
  };

  const signInWithGoogle = async () => {
    console.log("AUTH: signInWithGoogle called.");
    if (firebaseInitializationError || !firebaseAuthService) {
        const errorMsg = firebaseInitializationError || "Authentication service not available.";
        console.error("AUTH: Google Sign-In pre-check failed:", errorMsg);
        setAuthError(errorMsg);
        toast({ variant: "destructive", title: "Auth Error", description: errorMsg });
        setLoading(false);
        return;
    }
    
    setLoading(true); // Set loading before async operation
    setAuthError(null);
    console.log("AUTH: Starting Google Sign-In with Redirect...");

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const urlReferralCode = searchParams?.get('ref');
    if (urlReferralCode && typeof window !== 'undefined') {
        sessionStorage.setItem('pendingReferralCode', urlReferralCode);
        console.log(`AUTH: Stored pendingReferralCode in sessionStorage for redirect: ${urlReferralCode}`);
    } else if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingReferralCode');
    }

    try {
        console.log("AUTH: Using auth service instance:", firebaseAuthService);
        console.log("AUTH: Attempting signInWithRedirect...");
        await signInWithRedirect(firebaseAuthService, provider);
        // Redirect is in progress. Actual sign-in completion is handled by getRedirectResult
        // and onAuthStateChanged when the user returns.
        console.log("AUTH: signInWithRedirect initiated. Waiting for user to return from Google.");
        // setLoading will be handled by getRedirectResult or onAuthStateChanged
    } catch (err: any) {
        console.error("AUTH: Google signInWithRedirect initiation failed:", err);
        let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
        let toastTitle = 'Sign-In Failed';
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';

        if (err instanceof FirebaseError) {
            toastTitle = 'Google Sign-In Error';
            console.error(`AUTH: FirebaseError code: ${err.code}, message: ${err.message}`);
            switch (err.code) {
                case 'auth/popup-blocked':
                    errorMessage = "Sign-in popup blocked by your browser. Please allow popups for this site and try again.";
                    toastTitle = 'Popup Blocked';
                    break;
                case 'auth/popup-closed-by-user':
                case 'auth/cancelled-popup-request':
                    errorMessage = "Sign-in cancelled. If you didn't close it, please check browser settings (popups, third-party cookies, tracking prevention) or try again.";
                    toastTitle = 'Sign-In Cancelled';
                    break;
                case 'auth/redirect-operation-pending':
                    errorMessage = "A sign-in process is already in progress. Please complete or cancel it before trying again.";
                    toastTitle = 'Sign-In In Progress';
                    break;
                case 'auth/unauthorized-domain':
                    errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Domain: ${currentDomain}. Please contact support. Admin: Verify authorized domains in Firebase Auth & Google Cloud OAuth settings.`;
                    break;
                case 'auth/internal-error':
                case 'auth/network-request-failed':
                     errorMessage = "A network or server error occurred during sign-in. Please check your internet connection and try again later.";
                     toastTitle = 'Network/Server Error';
                     break;
                default:
                    errorMessage = `An error occurred (${err.code || 'unknown'}). Please try again.`;
            }
        } else if (err instanceof Error) {
            errorMessage = `An application error occurred: ${err.message}`;
        }
        console.log("AUTH: Setting authError:", errorMessage);
        setAuthError(errorMessage);
        toast({
            variant: "destructive",
            title: toastTitle,
            description: errorMessage,
            duration: 9000,
        });
        setLoading(false); // Critical: ensure loading is false if redirect initiation fails
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
