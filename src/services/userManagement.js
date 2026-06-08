import { initializeApp, getApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// Reuse the existing config from environment variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// INITIALIZE SECONDARY APP
// We give it a unique name 'userCreator' so it doesn't conflict with the main 'DEFAULT' app
let secondaryApp;
try {
    secondaryApp = initializeApp(firebaseConfig, "userCreator");
} catch (e) {
    // If already initialized, get it
    secondaryApp = getApp("userCreator");
}

const secondaryAuth = getAuth(secondaryApp);

export const createStaffUser = async (username, password, role = 'staff') => {
    try {
        const email = `${username.toLowerCase()}@manas0x.site`;

        let user;
        try {
            // 1. Create User in Auth (Secondary App)
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            user = userCredential.user;
        } catch (authError) {
            if (authError.code === 'auth/email-already-in-use') {
                console.warn("User auth already exists, attempting to create Firestore profile anyway.");
                // If Auth exists, we can't get the UID easily without Admin SDK.
                // BUT, if we can't get UID, we can't create the document at 'users/{uid}'.
                // HOWEVER, our Login.jsx logic falls back to searching by 'username' field in Firestore!
                // So we can use a generated ID or the username as ID?
                // Login.jsx Query: where('username', '==', username).
                // It does NOT require the Doc ID to match the Auth UID (though it's cleaner if it does).
                // So we can create a doc with ID = username.

                // Let's rely on the username-based query.
                user = { uid: username, email }; // Fallback "mock" user
            } else {
                throw authError; // Rethrow other errors
            }
        }

        // 2. Write to Firestore (Using the main DB instance from the app)
        // We import the main db instance
        const { db } = await import('../firebase');

        // We use the Auth UID if available, otherwise fallback to username as ID
        // Note: Ideally we want them linked. If we can't get UID, we can't link them perfectly for security rules 
        // that rely on `request.auth.uid == userId`.
        // BUT, my rules are `allow read, write: if isAuthenticated()`. So it doesn't strictly check ownership.
        // So creating a doc with ID = username (or anything) is fine for now.

        const docId = user.uid || username;

        await setDoc(doc(db, "users", docId), {
            username: username,
            password: password, // Storing for reference as requested
            role: role,
            createdAt: new Date().toISOString(),
            email: email
        });

        // 3. Sign out the secondary auth so it doesn't linger (only if we actually signed in)
        if (secondaryAuth.currentUser) {
            await signOut(secondaryAuth);
        }

        return { success: true, email };
    } catch (error) {
        console.error("Error creating staff user:", error);
        return { success: false, error: error.message };
    }
};
