// src/lib/firebase/config.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// import { getFunctions } from "firebase/functions"; // Uncomment if using Firebase Functions

// Log environment variables for debugging (remove in production)
// console.log("NEXT_PUBLIC_FIREBASE_API_KEY:", process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
// console.log("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
// console.log("NEXT_PUBLIC_FIREBASE_PROJECT_ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
// console.log("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
// console.log("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:", process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
// console.log("NEXT_PUBLIC_FIREBASE_APP_ID:", process.env.NEXT_PUBLIC_FIREBASE_APP_ID);


// Check for missing required Firebase config variables
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    `Error: Missing Firebase environment variables: ${missingEnvVars.join(', ')}. Please check your .env.local or environment configuration.`
  );
  // Optionally throw an error to prevent initialization with incomplete config
  // throw new Error(`Missing Firebase environment variables: ${missingEnvVars.join(', ')}`);
}

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Uncomment if needed
};

let app;
let auth: any; // Use 'any' temporarily if initialization fails
let db: any; // Use 'any' temporarily if initialization fails

try {
  // Initialize Firebase only if config is valid
  if (missingEnvVars.length === 0) {
      app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      auth = getAuth(app);
      db = getFirestore(app);
      // const functions = getFunctions(app); // Uncomment if using Firebase Functions
  } else {
      console.error("Firebase initialization skipped due to missing environment variables.");
      // Set to null or handle appropriately if initialization fails
      app = null;
      auth = null;
      db = null;
  }

} catch (error: any) {
    console.error("Error initializing Firebase:", error);
    // Log the specific config used if it helps debugging
    console.error("Firebase Config used:", {
        apiKey: firebaseConfig.apiKey ? '***' : 'MISSING', // Mask API key
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        // etc.
    });
     // Rethrow or handle as needed
     // throw error;
}

// Export potentially null values if initialization failed
export { app, auth, db /*, functions*/ };