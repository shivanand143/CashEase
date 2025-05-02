// src/hooks/use-auth.ts
"use client"; // Add "use client" directive

import { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot, DocumentData, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import type { UserProfile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // console.log("AuthProvider mounted, setting up auth listener...");
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // console.log("Auth state changed. User:", firebaseUser?.uid);
      setUser(firebaseUser);
      let unsubscribeProfile = () => {};

      if (firebaseUser) {
        setLoading(true); // Start loading profile
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        // console.log("Setting up profile listener for user:", firebaseUser.uid);

        unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          // console.log("Profile snapshot received. Exists:", docSnap.exists());
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
          } else {
            console.warn("User profile not found in Firestore for UID:", firebaseUser.uid);
            setUserProfile(null);
          }
          setLoading(false); // Profile loaded or not found
        }, (error) => {
          console.error("Error in profile snapshot listener:", error);
          setUserProfile(null);
          setLoading(false);
        });

      } else {
        // User is signed out
        // console.log("User signed out.");
        setUserProfile(null);
        setLoading(false);
      }

      // Cleanup function for profile listener
      return () => {
        // console.log("Cleaning up profile listener for user:", firebaseUser?.uid);
        unsubscribeProfile();
      };
    }, (error) => {
        // Handle errors from onAuthStateChanged itself
        console.error("Error in onAuthStateChanged listener:", error);
        setUser(null);
        setUserProfile(null);
        setLoading(false);
    });

    // Cleanup function for auth listener
    return () => {
      // console.log("Cleaning up auth listener.");
      unsubscribeAuth();
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount

  const signOut = async () => {
    // console.log("Signing out...");
    setLoading(true); // Indicate loading during sign out
    try {
      await firebaseSignOut(auth);
      // console.log("Sign out successful.");
      // State updates are handled by onAuthStateChanged
    } catch (error) {
      console.error('Error signing out:', error);
      setLoading(false); // Stop loading on error
    }
  };

  // Define the context value directly
  const authContextValue = {
      user,
      userProfile,
      loading,
      signOut
  };

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
