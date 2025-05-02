// src/lib/firebase/config.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// import { getFunctions } from "firebase/functions"; // Uncomment if using Firebase Functions

// Ensure your Firebase project credentials are set in your environment variables.
// For local development, create a .env.local file in the project root:
//
// NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
// NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
// NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
// NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
// NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
// NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID
// NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=YOUR_MEASUREMENT_ID (Optional)
//
// For deployment, configure these environment variables in your hosting provider's settings.

// Check for required Firebase config variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Uncomment if needed
};

const requiredEnvVars = Object.entries(firebaseConfig)
    .filter(([key]) => key !== 'measurementId') // measurementId is optional
    .filter(([, value]) => !value)
    .map(([key]) => key);

let app;
let auth: any = null; // Initialize as null
let db: any = null; // Initialize as null
let firebaseInitializationError: string | null = null;

if (requiredEnvVars.length > 0) {
    firebaseInitializationError = `Missing Firebase environment variables: ${requiredEnvVars.join(', ')}. Please check your .env.local or environment configuration. Create a '.env.local' file in the root directory and add the required variables. See .env.local.example for a template.`;
    console.warn(firebaseInitializationError); // Use warn to avoid breaking server-side rendering completely if Firebase is optional downstream
} else {
    try {
        // Initialize Firebase only if config is valid
        app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
        auth = getAuth(app);
        db = getFirestore(app);
        // const functions = getFunctions(app); // Uncomment if using Firebase Functions
        console.log("Firebase initialized successfully.");
    } catch (error: any) {
        firebaseInitializationError = `Error initializing Firebase: ${error.message}`;
        console.error(firebaseInitializationError);
        // Log the specific config used if it helps debugging (mask API key)
        console.error("Firebase Config used:", {
            apiKey: firebaseConfig.apiKey ? '***' : 'MISSING',
            authDomain: firebaseConfig.authDomain ?? 'MISSING',
            projectId: firebaseConfig.projectId ?? 'MISSING',
            storageBucket: firebaseConfig.storageBucket ?? 'MISSING',
            messagingSenderId: firebaseConfig.messagingSenderId ?? 'MISSING',
            appId: firebaseConfig.appId ?? 'MISSING',
        });
        // Set services to null on error
        app = null;
        auth = null;
        db = null;
    }
}


export { app, auth, db, firebaseInitializationError /*, functions*/ };
