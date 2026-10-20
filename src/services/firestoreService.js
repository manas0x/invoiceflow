import { getSetupConfig } from '../config/setupConfig';
import { sqlService } from './sqlService';

let firebaseServicePromise;

const loadFirebaseService = () => {
    if (!firebaseServicePromise) {
        firebaseServicePromise = import('./firebaseService.js').then(({ firestoreService }) => firestoreService);
    }
    return firebaseServicePromise;
};

const callFirebase = (property, args) => loadFirebaseService().then(service => service[property](...args));

const subscribeFirebase = (property, args) => {
    let stopped = false;
    let unsubscribe;

    loadFirebaseService().then(service => {
        if (!stopped) unsubscribe = service[property](...args);
    });

    return () => {
        stopped = true;
        unsubscribe?.();
    };
};

export const firestoreService = new Proxy({}, {
    get(_target, property) {
        if (property === 'then') return undefined;
        if (typeof property !== 'string') return undefined;

        if (getSetupConfig()?.database?.type !== 'firebase') {
            return sqlService[property];
        }

        if (property.startsWith('subscribe')) {
            return (...args) => subscribeFirebase(property, args);
        }

        return (...args) => callFirebase(property, args);
    }
});
