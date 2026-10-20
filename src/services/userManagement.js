import { initializeApp, getApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { appConfig } from "../config/appConfig";
import { getFirebaseConfig } from "../config/firebaseConfig";

const firebaseConfig = getFirebaseConfig();

let secondaryApp;
try {
    secondaryApp = initializeApp(firebaseConfig, "userCreator");
} catch {
    secondaryApp = getApp("userCreator");
}

const secondaryAuth = getAuth(secondaryApp);

export const verifyDeveloperAdminPassword = async (password) => {
    if (!password) throw new Error('Enter the dev_admin password.');

    // The developer account is a Firebase Auth account, so verify it directly
    // instead of listing the users collection just to discover its email.
    // This avoids an unnecessary Firestore list permission during unlock.
    const developerEmail = `dev_admin@${appConfig.passwordAuthDomain}`;

    try {
        const credential = await signInWithEmailAndPassword(secondaryAuth, developerEmail, password);
        if (credential.user.email !== developerEmail) {
            throw new Error('Developer account verification failed.');
        }
        return true;
    } finally {
        if (secondaryAuth.currentUser) await signOut(secondaryAuth);
    }
};

const assertAdmin = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('You must be signed in as an administrator.');

    const token = await currentUser.getIdTokenResult(true);
    const userService = (await import('./firestoreService')).firestoreService;
    const profile = await userService.getUserById(currentUser.uid)
        || await userService.getUserByAuthUidField(currentUser.uid);
    const role = token.claims.role || (token.claims.dev_admin ? 'dev_admin' : token.claims.admin ? 'admin' : profile?.role);
    const isAdmin = role === 'admin' || role === 'dev_admin';
    if (!isAdmin) throw new Error('Only an administrator can create staff accounts.');
};

export const createStaffUser = async ({ username, password, name }) => {
    await assertAdmin();

    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername || !password || password.length < 6) {
        throw new Error('Username is required and the password must contain at least 6 characters.');
    }

    const loginEmail = `${normalizedUsername}@${appConfig.passwordAuthDomain}`;
    let createdUser = null;

    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, loginEmail, password);
        createdUser = userCredential.user;

        // Store only profile metadata. Firebase Authentication owns the password.
        await setDoc(doc(db, 'users', createdUser.uid), {
            username: normalizedUsername,
            name: name?.trim() || normalizedUsername,
            role: 'staff',
            createdAt: new Date().toISOString(),
            email: loginEmail,
            authEmail: loginEmail,
            authUid: createdUser.uid
        });

        return { success: true, email: loginEmail, uid: createdUser.uid };
    } catch (error) {
        if (createdUser) {
            try {
                await deleteUser(createdUser);
            } catch (cleanupError) {
                console.warn('Unable to remove incomplete staff account:', cleanupError);
            }
        }
        throw error;
    } finally {
        if (secondaryAuth.currentUser) await signOut(secondaryAuth);
    }
};
