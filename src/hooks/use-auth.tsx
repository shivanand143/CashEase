
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
    // getRedirectResult, // Reverted from signInWithRedirect
    updateProfile as updateFirebaseAuthProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updateEmail as updateFirebaseAuthEmail,
    updatePassword as updateFirebaseAuthPassword,
    deleteUser as firebaseDeleteUser,
    sendPasswordResetEmail as firebaseSendPasswordResetEmail,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
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
    writeBatch,
    FirestoreError
} from 'firebase/firestore';
import { auth as firebaseAuthService, db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { safeToDate } from '@/lib/utils';

const AUTH_HOOK_LOG_PREFIX = "AUTH_HOOK:";

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
  const searchParams = useSearchParams(); // Can be used here if needed for referral code logic

  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} fetchUserProfile called for UID: ${uid}`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error during profile fetch.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for fetchUserProfile: ${errorMsg}`);
      setAuthError(errorMsg); // Update authError state
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
          createdAt: safeToDate(profileData.createdAt as Timestamp | undefined) || new Date(0),
          updatedAt: safeToDate(profileData.updatedAt as Timestamp | undefined) || new Date(0),
          lastPayoutRequestAt: safeToDate(profileData.lastPayoutRequestAt as Timestamp | undefined),
          payoutDetails: profileData.payoutDetails ?? null,
        };
        console.log(`${AUTH_HOOK_LOG_PREFIX} Profile fetched successfully for ${uid}. Name: ${profile.displayName}, Role: ${profile.role}`);
        return profile;
      } else {
        console.warn(`${AUTH_HOOK_LOG_PREFIX} No profile document found for UID: ${uid}. This might be a new user.`);
        return null;
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error fetching profile for ${uid}:`, err);
      setAuthError(err instanceof Error ? `Profile fetch error: ${err.message}` : "Failed to fetch user profile.");
      return null;
    }
  }, []); // Empty dependency array as fetchUserProfile itself doesn't depend on hook state changing over time

  const updateUserProfileData = useCallback(async (uid: string, data: Partial<UserProfile>) => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} updateUserProfileData called for UID: ${uid}`, data);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database connection error.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for updateUserProfileData: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatePayload: Partial<UserProfile> = { ...data };
      if (data.photoURL === '') updatePayload.photoURL = null;
      
      const dataWithTimestamp: Record<string, any> = { ...updatePayload, updatedAt: serverTimestamp() };
      await updateDoc(userDocRef, dataWithTimestamp);
      console.log(`${AUTH_HOOK_LOG_PREFIX} Firestore document updated for ${uid}.`);
      const updatedProfile = await fetchUserProfile(uid); // Refetch to ensure context has the latest
      if (updatedProfile) {
        setUserProfile(updatedProfile);
        console.log(`${AUTH_HOOK_LOG_PREFIX} Profile data updated and context state set for UID: ${uid}.`);
      }
    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error updating profile data for ${uid}:`, err);
      throw new Error(err instanceof Error ? `Profile update error: ${err.message}` : "Failed to update profile data.");
    }
  }, [fetchUserProfile]);

  const createOrUpdateUserProfile = useCallback(async (
    authUser: User,
    referredByCodeParam?: string | null
  ): Promise<UserProfile | null> => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} createOrUpdateUserProfile: Starting for UID: ${authUser.uid}. Auth DName: "${authUser.displayName}", RefParam: "${referredByCodeParam}"`);
    if (!db || firebaseInitializationError) {
      const errorMsg = firebaseInitializationError || "Database error during profile setup.";
      console.error(`${AUTH_HOOK_LOG_PREFIX} Firestore not initialized for createOrUpdateUserProfile: ${errorMsg}`);
      setAuthError(errorMsg);
      return null;
    }
    if (!authUser) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} AuthUser object is null in createOrUpdateUserProfile.`);
      return null;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    let referrerIdToUse: string | null = null;

    // Logic to determine the referral code to use
    const urlReferralCode = searchParams?.get('ref')?.trim() || null;
    let finalReferralCode = referredByCodeParam || urlReferralCode;

    // If a referral code is pending in sessionStorage (from redirect flow), prioritize it
    const pendingReferralCodeFromStorage = typeof window !== 'undefined' ? sessionStorage.getItem('pendingReferralCode') : null;
    if (pendingReferralCodeFromStorage) {
      finalReferralCode = pendingReferralCodeFromStorage;
      console.log(`${AUTH_HOOK_LOG_PREFIX} Using referral code from sessionStorage: ${finalReferralCode}`);
    }

    console.log(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] FinalReferralCode for UID ${authUser.uid}: "${finalReferralCode}"`);

    if (finalReferralCode) {
      console.log(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Searching for referrer with code: "${finalReferralCode}"`);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', finalReferralCode), limit(1));
      try {
        const referrerSnap = await getDocs(q);
        if (!referrerSnap.empty) {
          const referrerDoc = referrerSnap.docs[0];
          if (referrerDoc.id !== authUser.uid) { // Prevent self-referral
            referrerIdToUse = referrerDoc.id;
            console.log(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Referrer ID found: ${referrerIdToUse} for code ${finalReferralCode}`);
          } else {
            console.warn(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] User ${authUser.uid} attempted self-referral with code ${finalReferralCode}.`);
          }
        } else {
          console.warn(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Referrer code "${finalReferralCode}" not found.`);
        }
      } catch (queryError) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} [ReferralCheck] Error querying referrer for code ${finalReferralCode}:`, queryError);
      }
    }

    try {
      const newProfileData = await runTransaction(db, async (transaction) => {
        console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Running for UID: ${authUser.uid}`);
        const docSnap = await transaction.get(userDocRef);
        let userProfileDataToSet: UserProfile;
        let isNewUserCreation = false;

        if (docSnap.exists()) {
          isNewUserCreation = false;
          const existingData = docSnap.data() as UserProfile;
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Updating existing user: ${authUser.uid}. Current DName: "${existingData.displayName}"`);
          
          const updateData: Partial<UserProfile> = {
            displayName: authUser.displayName || existingData.displayName || "MagicSaver User",
            photoURL: authUser.photoURL || existingData.photoURL || null, // Prefer Firebase Auth photoURL if available
            email: authUser.email || existingData.email, // Sync email
            updatedAt: serverTimestamp(),
          };

          // Only apply referral if user doesn't already have one
          if (existingData.referredBy === null && referrerIdToUse) {
            updateData.referredBy = referrerIdToUse;
            console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Setting referredBy for existing user ${authUser.uid} to ${referrerIdToUse}.`);
          }
          
          // Assign admin role if this is the initial admin UID and not already admin
          if (authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && existingData.role !== 'admin') {
            updateData.role = 'admin';
             console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Promoting user ${authUser.uid} to admin.`);
          }

          transaction.update(userDocRef, updateData);
          // Construct the profile data that will be returned and set in state
          userProfileDataToSet = { ...existingData, ...updateData, uid: authUser.uid } as UserProfile; // Cast to UserProfile

        } else { // New user
          isNewUserCreation = true;
          const generatedReferralCode = uuidv4().substring(0, 8).toUpperCase();
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Creating new user: ${authUser.uid}. Assigned Referral Code: ${generatedReferralCode}`);
          
          userProfileDataToSet = {
            uid: authUser.uid,
            email: authUser.email ?? null,
            displayName: authUser.displayName || "MagicSaver User", // Use Google's display name if available
            photoURL: authUser.photoURL ?? null, // Use Google's photo URL
            role: authUser.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID ? 'admin' : 'user',
            cashbackBalance: 0,
            pendingCashback: 0,
            lifetimeCashback: 0,
            referralCode: generatedReferralCode,
            referralCount: 0,
            referralBonusEarned: 0,
            referredBy: referrerIdToUse,
            isDisabled: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastPayoutRequestAt: null,
            payoutDetails: null,
          };
          transaction.set(userDocRef, userProfileDataToSet);
        }

        // If new user was referred, update referrer's stats
        if (isNewUserCreation && referrerIdToUse) {
          console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] New user ${authUser.uid} was referred by ${referrerIdToUse}. Applying referral bonus.`);
          const referrerDocRef = doc(db, 'users', referrerIdToUse);
          // No need to get() referrerDoc inside transaction if only incrementing, but good for logging
          const referrerSnap = await transaction.get(referrerDocRef); 
          if (referrerSnap.exists()) {
            const referralBonusAmount = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_BONUS_AMOUNT || "50");
            transaction.update(referrerDocRef, {
              referralCount: increment(1),
              referralBonusEarned: increment(referralBonusAmount), // This could be pending or direct balance
              // Potentially add to pendingCashback for referrer if bonus needs confirmation
              // cashbackBalance: increment(referralBonusAmount), // If bonus is immediately available
              updatedAt: serverTimestamp(),
            });
            console.log(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Incremented referralCount and referralBonusEarned for referrer ${referrerIdToUse}.`);
          } else {
            console.warn(`${AUTH_HOOK_LOG_PREFIX} [Transaction] Referrer document ${referrerIdToUse} not found. Cannot apply bonus.`);
          }
        }
        return userProfileDataToSet;
      });

      if (newProfileData) {
        // Convert Timestamps to Dates for client-side state
        const finalProfile = { ...newProfileData } as UserProfile; // Re-cast
        if (finalProfile.createdAt instanceof Timestamp) finalProfile.createdAt = finalProfile.createdAt.toDate();
        if (finalProfile.updatedAt instanceof Timestamp) finalProfile.updatedAt = finalProfile.updatedAt.toDate();
        if (finalProfile.lastPayoutRequestAt instanceof Timestamp) finalProfile.lastPayoutRequestAt = finalProfile.lastPayoutRequestAt.toDate();
        else finalProfile.lastPayoutRequestAt = null; // Ensure it's null if not a Timestamp
        
        console.log(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Transaction successful. Profile for UID ${authUser.uid}: Name: "${finalProfile.displayName}", Role: ${finalProfile.role}`);
        if (pendingReferralCodeFromStorage && typeof window !== 'undefined') {
          sessionStorage.removeItem('pendingReferralCode');
          console.log(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Removed pendingReferralCode from sessionStorage.`);
        }
        return finalProfile;
      } else {
        console.error(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Transaction returned null/undefined profile for ${authUser.uid}.`);
        // This case should ideally not be reached if the transaction logic is correct.
        throw new Error("Profile creation/update transaction failed to return data.");
      }

    } catch (err) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} [ProfileSetup] Error in createOrUpdateUserProfile transaction for ${authUser.uid}:`, err);
      const errorMsg = err instanceof Error ? `Profile setup error: ${err.message}` : "Failed to set up profile.";
      setAuthError(errorMsg);
      if (pendingReferralCodeFromStorage && typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingReferralCode'); // Clean up on error too
      }
      return null;
    }
  }, [searchParams, fetchUserProfile]); // Added fetchUserProfile to deps for potential re-fetch logic

  // Centralized function to handle user session initialization/update
  const processUserSession = useCallback(async (currentAuthUser: User, isFromResult: boolean = false) => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} processUserSession: Processing UID: ${currentAuthUser.uid}. From Auth Result: ${isFromResult}`);
    let profile: UserProfile | null = null;
    setAuthError(null); // Clear previous errors

    try {
      profile = await fetchUserProfile(currentAuthUser.uid);

      if (profile) {
        console.log(`${AUTH_HOOK_LOG_PREFIX} processUserSession: Existing profile found for ${currentAuthUser.uid}. Name: "${profile.displayName}"`);
        // Sync if Firebase Auth user details are newer or different
        const authName = currentAuthUser.displayName;
        const authPhoto = currentAuthUser.photoURL;
        const authEmail = currentAuthUser.email;

        let needsUpdate = false;
        const updatePayload: Partial<UserProfile> = {};

        if (authName && authName !== profile.displayName && authName !== "MagicSaver User") {
          updatePayload.displayName = authName;
          needsUpdate = true;
        }
        if (authPhoto && authPhoto !== profile.photoURL) {
          updatePayload.photoURL = authPhoto;
          needsUpdate = true;
        }
        if (authEmail && authEmail !== profile.email) {
          updatePayload.email = authEmail;
          needsUpdate = true;
        }

        if (needsUpdate) {
          console.log(`${AUTH_HOOK_LOG_PREFIX} processUserSession: Syncing Firebase Auth details to Firestore profile for ${currentAuthUser.uid}.`, updatePayload);
          await updateUserProfileData(currentAuthUser.uid, updatePayload);
          profile = await fetchUserProfile(currentAuthUser.uid); // Re-fetch after update
        }
      } else {
        console.log(`${AUTH_HOOK_LOG_PREFIX} processUserSession: No existing profile for ${currentAuthUser.uid}. Creating new one.`);
        const referralCodeFromStorage = typeof window !== 'undefined' ? sessionStorage.getItem('pendingReferralCode') : null;
        profile = await createOrUpdateUserProfile(currentAuthUser, referralCodeFromStorage);
        if (profile) {
          console.log(`${AUTH_HOOK_LOG_PREFIX} processUserSession: Profile CREATED for ${currentAuthUser.uid}.`);
        } else {
          console.error(`${AUTH_HOOK_LOG_PREFIX} processUserSession: CRITICAL - Failed to create profile for ${currentAuthUser.uid}. AuthError might be set.`);
          // setAuthError is handled by createOrUpdateUserProfile
        }
      }
    } catch (error) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} processUserSession: Error processing profile for ${currentAuthUser.uid}:`, error);
      setAuthError(error instanceof Error ? `Profile processing error: ${error.message}` : "Error loading user profile.");
      profile = null; // Ensure profile is null on error
    }
    
    // This should be the final step for setting user and profile
    setUser(currentAuthUser); 
    setUserProfile(profile);
    console.log(`${AUTH_HOOK_LOG_PREFIX} processUserSession: Final states set for ${currentAuthUser.uid}. UserProfile DisplayName: ${profile?.displayName}`);
    return profile; // Return profile for potential immediate use by caller
  }, [fetchUserProfile, createOrUpdateUserProfile, updateUserProfileData]);


  useEffect(() => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} Main useEffect for auth state triggered.`);
    let isMounted = true;
    
    if (firebaseInitializationError) {
      if (isMounted) { setAuthError(firebaseInitializationError); setLoading(false); }
      return;
    }
    if (!firebaseAuthService) {
      if (isMounted) { setAuthError("Auth service not ready."); setLoading(false); }
      return;
    }

    setLoading(true); // Start loading when this effect runs
    console.log(`${AUTH_HOOK_LOG_PREFIX} useEffect: Initial setLoading(true).`);

    const unsubscribe = onAuthStateChanged(firebaseAuthService, async (authUser) => {
      if (!isMounted) {
        console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: Component unmounted, ignoring event.`);
        return;
      }
      console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: Event received. AuthUser: ${authUser ? authUser.uid : 'null'}. Current loading state: ${loading}`);

      if (authUser) {
        // User is signed in or session restored.
        // Only process if it's a new user instance or if userProfile is not yet loaded for the current user.
        if (!user || user.uid !== authUser.uid || !userProfile) {
          console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: New/different user or profile missing. Processing session for ${authUser.uid}.`);
          await processUserSession(authUser);
        } else {
          console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: User ${authUser.uid} is same, profile already loaded. No new processing needed from onAuthStateChanged directly.`);
        }
      } else {
        // User is signed out
        console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: No authUser (signed out). Resetting user, profile, and authError states.`);
        setUser(null);
        setUserProfile(null);
        setAuthError(null); // Clear any previous auth errors
      }
      if (isMounted) {
        setLoading(false); // Set loading false after all processing for this auth event is done
        console.log(`${AUTH_HOOK_LOG_PREFIX} onAuthStateChanged: setLoading(false) after processing event for ${authUser ? authUser.uid : 'null'}.`);
      }
    }, (error) => {
      // This error callback for onAuthStateChanged is for listener setup errors, not auth errors themselves.
      if (isMounted) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} Critical error in onAuthStateChanged listener:`, error);
        setAuthError(`Firebase listener error: ${error.message}`);
        setUser(null); 
        setUserProfile(null); 
        setLoading(false);
      }
    });

    return () => { 
      isMounted = false; 
      unsubscribe(); 
      console.log(`${AUTH_HOOK_LOG_PREFIX} Main useEffect cleanup. Unsubscribed from onAuthStateChanged.`);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // processUserSession is stable due to useCallback and its own stable dependencies


  const signOut = async () => {
    if (!firebaseAuthService) {
      const msg = "Auth service not available for sign out.";
      setAuthError(msg);
      toast({ variant: "destructive", title: "Sign Out Failed", description: msg});
      return;
    }
    console.log(`${AUTH_HOOK_LOG_PREFIX} Attempting sign out...`);
    setLoading(true); // Indicate loading during sign-out
    setAuthError(null);
    try {
      await firebaseSignOut(firebaseAuthService);
      // onAuthStateChanged will handle clearing user, userProfile, and setting loading to false.
      console.log(`${AUTH_HOOK_LOG_PREFIX} firebaseSignOut successful. onAuthStateChanged will handle state updates.`);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      // router.push('/'); // Redirect to home or login page after sign out
    } catch (error) {
      console.error(`${AUTH_HOOK_LOG_PREFIX} Error during firebaseSignOut:`, error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
      toast({ variant: "destructive", title: 'Sign Out Failed', description: errorMsg });
      setLoading(false); // Explicitly set loading false on error
    }
  };

  const signInWithGoogle = async () => {
    console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithGoogle (popup) called.`);
    if (firebaseInitializationError || !firebaseAuthService) {
        const errorMsg = firebaseInitializationError || "Authentication service not available.";
        console.error(`${AUTH_HOOK_LOG_PREFIX} Google Sign-In pre-check failed: ${errorMsg}`);
        setAuthError(errorMsg);
        toast({ variant: "destructive", title: "Auth Error", description: errorMsg });
        return;
    }
    
    setLoading(true); // Crucial: set loading true BEFORE async operation
    setAuthError(null);
    console.log(`${AUTH_HOOK_LOG_PREFIX} Using auth service instance for Google Sign-In:`, firebaseAuthService);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const urlReferralCode = searchParams?.get('ref')?.trim() || null;
    console.log(`${AUTH_HOOK_LOG_PREFIX} Google Sign-In initiated. Referral code from URL (if any): ${urlReferralCode}`);
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('loginRedirectUrl', router.asPath || '/dashboard'); // Store current path or default
      if (urlReferralCode) {
        sessionStorage.setItem('pendingReferralCode', urlReferralCode);
        console.log(`${AUTH_HOOK_LOG_PREFIX} Stored pendingReferralCode to sessionStorage: ${urlReferralCode}`);
      }
    }

    try {
        console.log(`${AUTH_HOOK_LOG_PREFIX} Attempting signInWithPopup...`);
        const result = await signInWithPopup(firebaseAuthService, provider);
        console.log(`${AUTH_HOOK_LOG_PREFIX} signInWithPopup successful. User from result:`, result.user?.uid);
        
        // After popup success, onAuthStateChanged will fire.
        // processUserSession will be called by onAuthStateChanged.
        // We don't need to call processUserSession directly here as onAuthStateChanged will pick it up.
        // The loading state will be managed by onAuthStateChanged.

        // Toast and redirect can happen here if needed, or rely on onAuthStateChanged logic to navigate
        // if (result.user) {
        //    toast({ title: 'Sign In Successful', description: `Welcome!`});
        //    const redirectUrl = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
        //    router.push(redirectUrl);
        //    sessionStorage.removeItem('loginRedirectUrl');
        // }
        // For now, let onAuthStateChanged handle the profile loading and subsequent UI updates.

    } catch (err: any) {
        console.error(`${AUTH_HOOK_LOG_PREFIX} Google Sign-In signInWithPopup FAILED:`, err);
        let errorMessage = "An unexpected error occurred during Google Sign-In. Please try again.";
        let toastTitle = 'Sign-In Failed';
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown_domain';

        if (err instanceof FirebaseError) {
            console.error(`${AUTH_HOOK_LOG_PREFIX} FirebaseError details: Code: ${err.code}, Message: ${err.message}`);
            toastTitle = 'Google Sign-In Error';
            switch (err.code) {
                case 'auth/popup-closed-by-user':
                case 'auth/cancelled-popup-request':
                    errorMessage = "Sign-in popup was closed or cancelled. If unintentional, please check browser settings (popups, 3rd-party cookies, tracking prevention) and try again.";
                    toastTitle = 'Sign-In Cancelled';
                    break;
                case 'auth/popup-blocked':
                     errorMessage = `Sign-in popup blocked by your browser. Please allow popups for this site (${currentDomain}) and for google.com / firebaseapp.com. Also check ad-blockers or privacy extensions.`;
                     toastTitle = 'Popup Blocked';
                     break;
                case 'auth/unauthorized-domain':
                     errorMessage = `This domain (${currentDomain}) is not authorized for Google Sign-In. Please ensure it's added to Firebase Authentication's 'Authorized domains' AND that Google Cloud Console OAuth Client ID's 'Authorized JavaScript origins' and 'Authorized redirect URIs' (for https://[PROJECT_ID].firebaseapp.com/__/auth/handler) are correctly configured.`;
                     break;
                case 'auth/internal-error':
                case 'auth/network-request-failed':
                     errorMessage = "A network or server error occurred. Please check your internet connection and try again.";
                     toastTitle = 'Network/Server Error';
                     break;
                default:
                  errorMessage = `Google Sign-In failed (${err.code || 'unknown'}). Please ensure popups and third-party cookies are allowed for related domains.`;
            }
        } else if (err instanceof Error) {
            errorMessage = `An application error occurred during Google Sign-In: ${err.message}`;
        }
        console.log(`${AUTH_HOOK_LOG_PREFIX} Setting authError after Google Sign-In failure:`, errorMessage);
        setAuthError(errorMessage);
        toast({
            variant: "destructive",
            title: toastTitle,
            description: errorMessage,
            duration: 12000, // Longer duration for complex errors
        });
        setLoading(false); // Crucial: Ensure loading is stopped on signInWithPopup failure
    }
    // setLoading(false) is handled by onAuthStateChanged on success, or by catch block on failure of signInWithPopup itself.
  };

  const authContextValue = React.useMemo(() => ({
    user,
    userProfile,
    loading,
    authError,
    signOut,
    signInWithGoogle,
    createOrUpdateUserProfile, // Exposing this if needed directly, though usually internal
    fetchUserProfile,           // Exposing for direct profile fetches if needed
    updateUserProfileData,      // Exposing for direct profile updates
  }), [
      user, userProfile, loading, authError, // States
      createOrUpdateUserProfile, fetchUserProfile, updateUserProfileData, // Callbacks
      // signOut and signInWithGoogle are stable due to useCallback wrapping them
    ]);

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

    
    