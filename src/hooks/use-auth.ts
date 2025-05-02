// src/hooks/use-auth.ts
import { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, DocumentData } from 'firebase/firestore';
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
    // This function runs when the component mounts and sets up the listener
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
       // This callback runs whenever the auth state changes
      setUser(firebaseUser);
      let unsubscribeProfile = () => {}; // Initialize with an empty function

      if (firebaseUser) {
        // User is signed in, fetch profile
        setLoading(true); // Start loading profile
        const userDocRef = doc(db, 'users', firebaseUser.uid);

        // Set up a real-time listener for the user profile
        unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          // This callback runs when the profile document changes
          if (docSnap.exists()) {
            const data = docSnap.data() as DocumentData; // Get data object
            // Explicitly map fields to the UserProfile type
            const profileData: UserProfile = {
              uid: docSnap.id,
              email: data.email ?? null,
              displayName: data.displayName ?? null,
              photoURL: data.photoURL ?? null,
              role: data.role ?? 'user', // Default role
              cashbackBalance: data.cashbackBalance ?? 0,
              pendingCashback: data.pendingCashback ?? 0,
              lifetimeCashback: data.lifetimeCashback ?? 0,
              referralCode: data.referralCode,
              referredBy: data.referredBy,
              createdAt: data.createdAt?.toDate() ?? new Date(), // Convert Timestamp or use current date
            };
            setUserProfile(profileData);
          } else {
            // User exists in Auth but not Firestore
            console.error("User profile not found in Firestore for UID:", firebaseUser.uid);
            setUserProfile(null);
          }
          setLoading(false); // Profile loaded or not found
        }, (error) => {
           // Handle errors during profile listening
          console.error("Error fetching user profile:", error);
          setUserProfile(null);
          setLoading(false); // Error occurred
        });

      } else {
        // User is signed out
        setUserProfile(null);
        setLoading(false);
      }

      // Return the cleanup function for the profile listener
      // This will run when the firebaseUser changes (sign in/out) *before* the next profile listener is set up
      return () => {
        unsubscribeProfile();
      };

    });

    // Return the cleanup function for the auth state listener
    // This will run when the AuthProvider component unmounts
    return () => {
      unsubscribeAuth();
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount

  const signOut = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      // State updates (user=null, userProfile=null, loading=false) handled by the onAuthStateChanged listener
    } catch (error) {
      console.error('Error signing out:', error);
      setLoading(false); // Stop loading on error if sign out fails
    }
  };

  // Prepare the value for the context provider
  const authContextValue = { user, userProfile, loading, signOut };

  return (
    // Provide the authentication context to children components
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to easily consume the authentication context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Ensure the hook is used within the provider tree
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
