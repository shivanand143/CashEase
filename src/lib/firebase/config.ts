// src/lib/firebase/config.ts
import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
// import { getFunctions } from "firebase/functions"; // Uncomment if using Firebase Functions

// Ensure your Firebase project credentials are set in your environment variables.
// Create a .env.local file in the project root if it doesn't exist.
// See .env.local.example for required variables.

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};

// Function to check if all required keys have values
function checkFirebaseConfig(config: FirebaseOptions): string[] {
    const requiredKeys: Array<keyof FirebaseOptions> = [
        'apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'
    ];
    return requiredKeys.filter(key => !config[key]);
}

let app: ReturnType<typeof initializeApp> | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let firebaseInitializationError: string | null = null;

const missingEnvVars = checkFirebaseConfig(firebaseConfig);

if (missingEnvVars.length > 0) {
  firebaseInitializationError = `Warning: Missing Firebase environment variables: ${missingEnvVars.join(', ')}. Firebase features will be unavailable. Please check your .env.local or environment configuration.`;
  console.warn(firebaseInitializationError); // Use warn instead of error
  // Ensure services remain null
  app = null;
  auth = null;
  db = null;
} else {
  try {
    // Initialize Firebase only if config is valid and no previous error occurred
    if (!firebaseInitializationError) {
        app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
        auth = getAuth(app);
        db = getFirestore(app);
        // const functions = getFunctions(app); // Uncomment if using Firebase Functions
        console.log("Firebase initialized successfully.");
    }
  } catch (error: any) {
    firebaseInitializationError = `Error initializing Firebase: ${error.message}`;
    console.error(firebaseInitializationError);
    // Log the specific config used if it helps debugging (mask API key)
    console.error("Firebase Config used (API Key masked):", {
        ...firebaseConfig,
        apiKey: firebaseConfig.apiKey ? '***' : 'MISSING',
    });
    // Set services to null on error
    app = null;
    auth = null;
    db = null;
  }
}

// Export the potentially null services and the error state
export { app, auth, db, firebaseInitializationError /*, functions*/ };
