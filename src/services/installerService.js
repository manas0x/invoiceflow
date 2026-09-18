import { cacheStoreProfile } from '../config/storeConfig';
import { getSetupConfig, saveSetupConfig } from '../config/setupConfig';
import { getFirebaseConfig, getMissingFirebaseConfigFields } from '../config/firebaseConfig';

const now = () => new Date().toISOString();

const apiUrl = (base, path) => `${String(base || '/api').replace(/\/$/, '')}${path}`;

export const persistSetupOnServer = async setup => {
    const response = await fetch(apiUrl(setup.database.apiBaseUrl, '/setup/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok === false) {
        throw new Error(result?.message || `The installation lock could not be saved (HTTP ${response.status}).`);
    }
    return result;
};

export const downloadDeploymentPackage = async database => {
    const response = await fetch(apiUrl(database.apiBaseUrl, '/setup/package'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database })
    });
    if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || `The deployment package could not be created (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `InvoiceFlow-deployment-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

export const testDatabaseConnection = async (database, firebaseConfig = null) => {
    if (database.type === 'firebase') {
        const config = getFirebaseConfig(firebaseConfig);
        const missing = getMissingFirebaseConfigFields(config);
        if (missing.length) throw new Error(`Missing Firebase configuration values: ${missing.join(', ')}`);
        return { ok: true, message: `Firebase project ${config.projectId} is configured.` };
    }

    const response = await fetch(apiUrl(database.apiBaseUrl, '/setup/test-connection'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(database)
    });

    let result = null;
    try {
        result = await response.json();
    } catch {
        // Keep the useful HTTP error below when an API returns no JSON body.
    }

    if (!response.ok || result?.ok === false) {
        throw new Error(result?.message || `SQL connector returned HTTP ${response.status}.`);
    }

    return { ok: true, message: result?.message || 'Database connection successful.' };
};

export const initializeDatabase = async (database, storeProfile) => {
    if (database.type === 'firebase') return { ok: true, message: 'Firebase is ready.' };

    const response = await fetch(apiUrl(database.apiBaseUrl, '/setup/initialize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database, storeProfile })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok === false) {
        throw new Error(result?.message || `SQL connector returned HTTP ${response.status}.`);
    }
    return result;
};

export const completePendingSetup = async () => {
    const setup = getSetupConfig();
    if (!setup?.databaseSetupPending || setup.seedCompletedAt) return false;

    if (setup.database.type === 'firebase') {
        if (setup.importData) {
            const { firestoreService } = await import('./firestoreService');
            await firestoreService.importAllDataJSON(setup.importData);
        }
        const { firestoreService } = await import('./firestoreService');
        await firestoreService.updateAppSettings('store_profile', setup.storeProfile);
    } else {
        await initializeDatabase(setup.database, setup.storeProfile);
        if (setup.importData) {
            const response = await fetch(apiUrl(setup.database.apiBaseUrl, '/setup/import'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ database: setup.database, backup: setup.importData })
            });
            if (!response.ok) throw new Error('The SQL connector could not import the selected backup.');
        }
    }

    saveSetupConfig({ ...setup, databaseSetupPending: false, seedCompletedAt: now() });
    return true;
};

export const applySetupProfile = (profile) => {
    cacheStoreProfile(profile);
    return profile;
};
