import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseConfig } from './config/firebaseConfig';

const firebaseConfig = getFirebaseConfig();

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

let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
} catch (error) {
    // Fall back gracefully in browsers where IndexedDB is blocked or an older
    // tab already initialized Firestore with different settings.
    console.warn('Offline Firestore cache unavailable:', error.message);
    db = getFirestore(app);
}
const auth = getAuth(app);

// Explicitly set persistence to local storage for better reliability in restricted environments
import { setPersistence, browserLocalPersistence } from "firebase/auth";
setPersistence(auth, browserLocalPersistence).catch(err => console.error("Persistence error:", err));

const googleProvider = new GoogleAuthProvider();
const messaging = null; // Legacy placeholder

export { app, analytics, db, auth, googleProvider, signInWithPopup, messaging };
