import { getSetupConfig } from './setupConfig';

const environmentFirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''
};

export const getFirebaseConfig = (override = null) => ({
    ...environmentFirebaseConfig,
    ...(getSetupConfig()?.database?.firebaseConfig || {}),
    ...(override || {})
});

export const hasFirebaseConfig = (config = getFirebaseConfig()) =>
    Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

export const getMissingFirebaseConfigFields = (config = getFirebaseConfig()) => [
    ['API key', config.apiKey],
    ['Auth domain', config.authDomain],
    ['Project ID', config.projectId],
    ['App ID', config.appId]
].filter(([, value]) => !String(value || '').trim()).map(([label]) => label);
