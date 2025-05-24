
import { initializeApp, getApps, getApp, FirebaseApp, FirebaseOptions } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// --- Primary Firebase Project Configuration ---
const firebaseConfigPrimary: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// --- Secondary Firebase Project Configuration ---
const firebaseConfigSecondary: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_SECONDARY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_SECONDARY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID_SECONDARY,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET_SECONDARY,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_SECONDARY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_SECONDARY,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_SECONDARY, // Optional
};

// Function to check if all required keys have values for a given config
function checkFirebaseConfig(config: FirebaseOptions, configName: string): string[] {
    const requiredKeys: Array<keyof FirebaseOptions> = [
        'apiKey', 'authDomain', 'projectId', 'appId'
        // storageBucket and messagingSenderId are often optional for basic auth/firestore
    ];
    return requiredKeys.filter(key => !config[key]);
}

// --- Primary Firebase App Initialization ---
let appPrimary: FirebaseApp | null = null;
let authPrimary: Auth | null = null;
let dbPrimary: Firestore | null = null;
let firebaseInitializationErrorPrimary: string | null = null;

const missingEnvVarsPrimary = checkFirebaseConfig(firebaseConfigPrimary, "Primary");

if (missingEnvVarsPrimary.length > 0) {
  firebaseInitializationErrorPrimary = `Warning: Missing Firebase (Primary) environment variables: ${missingEnvVarsPrimary.join(', ')}. Primary Firebase features might be unavailable.`;
  console.warn(firebaseInitializationErrorPrimary);
} else {
  try {
    if (getApps().some(app => app.name === "[DEFAULT]")) {
      appPrimary = getApp("[DEFAULT]");
    } else {
      appPrimary = initializeApp(firebaseConfigPrimary, "[DEFAULT]"); // Default app
    }
    authPrimary = getAuth(appPrimary);
    dbPrimary = getFirestore(appPrimary);
    console.log("Firebase (Primary) initialized successfully.");
  } catch (error: any) {
    firebaseInitializationErrorPrimary = `Error initializing Firebase (Primary): ${error.message}`;
    console.error(firebaseInitializationErrorPrimary, firebaseConfigPrimary);
  }
}

// --- Secondary Firebase App Initialization ---
const SECONDARY_APP_NAME = "secondaryFirebaseApp"; // Unique name for the secondary app
let appSecondary: FirebaseApp | null = null;
let authSecondary: Auth | null = null;
let dbSecondary: Firestore | null = null;
let firebaseInitializationErrorSecondary: string | null = null;

const missingEnvVarsSecondary = checkFirebaseConfig(firebaseConfigSecondary, "Secondary");

if (missingEnvVarsSecondary.length > 0) {
  firebaseInitializationErrorSecondary = `Info: Missing Firebase (Secondary) environment variables: ${missingEnvVarsSecondary.join(', ')}. Secondary Firebase features will be unavailable. This might be intentional if you are not using a secondary project.`;
  // We'll only log this as info, as the secondary app might be optional
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID_SECONDARY) { // Only warn if secondary project ID was actually set
    console.warn(firebaseInitializationErrorSecondary);
  }
} else {
  try {
    // Check if an app with this name already exists
    const existingSecondaryApp = getApps().find(app => app.name === SECONDARY_APP_NAME);
    if (existingSecondaryApp) {
      appSecondary = existingSecondaryApp;
    } else {
      appSecondary = initializeApp(firebaseConfigSecondary, SECONDARY_APP_NAME);
    }
    authSecondary = getAuth(appSecondary);
    dbSecondary = getFirestore(appSecondary);
    console.log("Firebase (Secondary) initialized successfully with name:", SECONDARY_APP_NAME);
  } catch (error: any) {
    firebaseInitializationErrorSecondary = `Error initializing Firebase (Secondary): ${error.message}`;
    console.error(firebaseInitializationErrorSecondary, firebaseConfigSecondary);
  }
}

// Export instances for the primary project (you can rename these if you prefer for clarity)
export {
  appPrimary as app, // Default export remains the primary app
  authPrimary as auth, // Default export remains the primary auth
  dbPrimary as db,     // Default export remains the primary db
  firebaseInitializationErrorPrimary as firebaseInitializationError // Primary error
};

// Export instances for the secondary project
export {
  appSecondary,
  authSecondary,
  dbSecondary,
  firebaseInitializationErrorSecondary
};
