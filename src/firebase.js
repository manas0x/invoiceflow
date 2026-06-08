import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics Safely
import { isSupported } from "firebase/analytics";
let analytics = null;
if (typeof window !== 'undefined') {
    isSupported().then(supported => {
        if (supported) analytics = getAnalytics(app);
    }).catch(err => console.log("Analytics not supported:", err.message));
}

const db = getFirestore(app);
const auth = getAuth(app);

// Explicitly set persistence to local storage for better reliability in restricted environments
import { setPersistence, browserLocalPersistence } from "firebase/auth";
setPersistence(auth, browserLocalPersistence).catch(err => console.error("Persistence error:", err));

const googleProvider = new GoogleAuthProvider();
const messaging = null; // Legacy placeholder

export { app, analytics, db, auth, googleProvider, signInWithPopup, messaging };
