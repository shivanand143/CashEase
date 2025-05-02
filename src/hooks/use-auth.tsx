// src/hooks/use-auth.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useContext, createContext, ReactNode, useMemo, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot, DocumentData, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import type { UserProfile } from '@/lib/types';


// Check if Firebase services are available (handle potential initialization failure in config.ts)
const isFirebaseAvailable = !!auth && !!db;

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  authError?: string | null; // Make authError optional in the context type
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null); // State to hold auth errors

  useEffect(() => {
    console.log("AuthProvider mounted, checking Firebase availability...");

    if (!isFirebaseAvailable) {
        const errorMsg = "Firebase is not configured or failed to initialize. Skipping auth listeners.";
        console.warn(errorMsg); // Use warn instead of error to avoid breaking the app entirely if firebase is optional
        setAuthError(errorMsg);
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
              updatedAt: updatedAtDate, // Added updatedAt
            };
            // console.log("Profile data:", profileData);
            setUserProfile(profileData);
            setAuthError(null); // Clear any previous error
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
        setAuthError(null); // Clear error on sign out
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
       console.error("Cannot sign out, Firebase auth is not initialized.");
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
       // Even on error, onAuthStateChanged might fire or might not.
       // If it doesn't fire, we need to ensure loading stops eventually.
       // However, setting it false here might race with the listener.
       // It's safer to rely on the listener, but add a fallback timeout if needed.
       // setLoading(false); // Temporarily removed, rely on listener
    }
  }, []); // isFirebaseAvailable is constant after mount, no need to include

  // Memoize the context value to prevent unnecessary re-renders
  const authContextValue = useMemo(() => ({
      user,
      userProfile,
      loading,
      signOut,
      authError // Include authError in context if needed elsewhere
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