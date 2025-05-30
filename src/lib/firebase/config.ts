import { initializeApp, getApps, getApp, FirebaseApp, FirebaseOptions } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// Load environment variables using Next.js's built-in support
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Function to check if all required keys have values
function checkFirebaseConfig(config: FirebaseOptions): string[] {
    const requiredKeys: Array<keyof FirebaseOptions> = [
        'apiKey', 'authDomain', 'projectId', 'appId' // These are generally critical
    ];
    // storageBucket and messagingSenderId are often essential too depending on features used.
    // measurementId is for Analytics and is often optional for core functionality.
    const missing = requiredKeys.filter(key => !config[key]);
    return missing;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let firebaseInitializationError: string | null = null;

const missingEnvVars = checkFirebaseConfig(firebaseConfig);

if (missingEnvVars.length > 0) {
  firebaseInitializationError = `Warning: Missing Firebase environment variables for the primary project: ${missingEnvVars.join(', ')}. Firebase features will be unavailable. Please check your .env.local or environment configuration.`;
  console.warn(firebaseInitializationError); // Use warn for client-side visibility
  // Ensure services remain null
  app = null;
  auth = null;
  db = null;
} else {
  try {
    // Initialize Firebase only if config is valid and no previous error occurred
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        console.log("Firebase primary app initialized successfully.");
    } else {
        app = getApp(); // Get default app if already initialized
        console.log("Firebase primary app already initialized, using existing instance.");
    }
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error: any) {
    firebaseInitializationError = `Error initializing Firebase primary app: ${error.message}`;
    console.error(firebaseInitializationError);
    // Log the specific config used if it helps debugging (mask API key)
    console.error("Primary Firebase Config used (API Key masked):", {
        ...firebaseConfig,
        apiKey: firebaseConfig.apiKey ? 'PRESENT' : 'MISSING_OR_INVALID',
    });
    // Set services to null on error
    app = null;
    auth = null;
    db = null;
  }
}

// Export the potentially null services and the error state
export { app, auth, db, firebaseInitializationError };