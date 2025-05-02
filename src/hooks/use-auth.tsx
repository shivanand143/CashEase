// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useContext, createContext, ReactNode, useMemo, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot, DocumentData, Timestamp } from 'firebase/firestore';
import { auth, db, firebaseInitializationError } from '@/lib/firebase/config'; // Import error state
import type { UserProfile } from '@/lib/types';

// Check if Firebase services are available (handle potential initialization failure in config.ts)
const isFirebaseAvailable = !!auth && !!db && !firebaseInitializationError;

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  authError?: string | null; // Error related to auth state or profile loading
  initializationError?: string | null; // Error during Firebase init
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null); // Auth/profile specific errors

  useEffect(() => {
    console.log("AuthProvider mounted. Firebase Initialization Error:", firebaseInitializationError);

    if (firebaseInitializationError) {
        console.warn("Firebase initialization failed. Skipping auth listeners.");
        setAuthError(null); // Clear previous auth errors if any
        setLoading(false);
        return;
    }

    if (!isFirebaseAvailable) {
        // This case should theoretically be covered by firebaseInitializationError check,
        // but kept as a safeguard.
        const errorMsg = "Firebase services (auth/db) are not available. Skipping auth listeners.";
        console.warn(errorMsg);
        setAuthError(null);
        setLoading(false);
        return;
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
            const data = docSnap.data() as DocumentData;
            // Convert Firestore Timestamp to JS Date safely
            const createdAtDate = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
            const updatedAtDate = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : createdAtDate; // Use createdAt as fallback

            const profileData: UserProfile = {
              uid: docSnap.id,
              email: data.email ?? null,
              displayName: data.displayName ?? null,
              photoURL: data.photoURL ?? null,
              role: data.role ?? 'user',
              cashbackBalance: data.cashbackBalance ?? 0,
              pendingCashback: data.pendingCashback ?? 0,
              lifetimeCashback: data.lifetimeCashback ?? 0,
              referralCode: data.referralCode,
              referredBy: data.referredBy,
              createdAt: createdAtDate,
              updatedAt: updatedAtDate,
            };
            setUserProfile(profileData);
            setAuthError(null); // Clear any previous auth/profile error
          } else {
            console.warn("User profile not found in Firestore for UID:", firebaseUser.uid);
            setUserProfile(null);
            setAuthError("User profile not found."); // Indicate profile issue
          }
          setLoading(false); // Profile loaded or not found
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
  }, []); // Empty dependency array ensures this effect runs only once on mount

  const signOut = useCallback(async () => {
     if (!isFirebaseAvailable) {
       console.error("Cannot sign out, Firebase auth is not initialized or available.");
       setAuthError("Firebase not available. Cannot sign out.");
       return;
     }
    console.log("Signing out...");
    setLoading(true); // Indicate loading during sign out
    try {
      await firebaseSignOut(auth);
      console.log("Sign out successful via hook call.");
      // State updates (user=null, profile=null, loading=false) are handled by onAuthStateChanged
    } catch (error) {
      console.error('Error signing out:', error);
      const errorMsg = `Sign out error: ${error instanceof Error ? error.message : String(error)}`;
      setAuthError(errorMsg);
    } finally {
       // Ensure loading state is reset even if listener doesn't fire immediately after error
       setLoading(false);
    }
  }, []); // isFirebaseAvailable is effectively constant after mount

  // Memoize the context value to prevent unnecessary re-renders
  const authContextValue = useMemo(() => ({
      user,
      userProfile,
      loading,
      signOut,
      authError, // Auth/profile errors
      initializationError: firebaseInitializationError // Pass init error down
  }), [user, userProfile, loading, signOut, authError]);

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
