export const SETUP_STORAGE_KEY = 'invoiceflow_setup_config';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

export const getSetupConfig = () => {
    if (!canUseStorage()) return null;

    try {
        const raw = window.localStorage.getItem(SETUP_STORAGE_KEY);
        if (!raw) return null;
        const config = JSON.parse(raw);
        return config?.completedAt ? config : null;
    } catch (error) {
        console.warn('InvoiceFlow setup configuration is unreadable:', error.message);
        return null;
    }
};

export const hasCompletedSetup = () => Boolean(getSetupConfig());

export const hydrateSetupConfig = async () => {
    const localConfig = getSetupConfig();
    if (localConfig) {
        // Recreate the server-side installation lock when upgrading from a
        // version that stored setup only in browser storage.
        try {
            const base = String(localConfig.database?.apiBaseUrl || '/api').replace(/\/$/, '');
            await fetch(`${base}/setup/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setup: localConfig })
            });
        } catch {
            // A static Firebase deployment may not have a connector process.
        }
        return localConfig;
    }

    try {
        const response = await fetch('/api/setup/status', { cache: 'no-store' });
        if (!response.ok) return null;
        const result = await response.json();
        if (!result?.installed || !result.setup?.completedAt) return null;
        return saveSetupConfig(result.setup);
    } catch {
        return null;
    }
};

export const saveSetupConfig = (config) => {
    if (!canUseStorage()) return config;
    window.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(config));
    return config;
};

export const clearSetupConfig = () => {
    if (canUseStorage()) window.localStorage.removeItem(SETUP_STORAGE_KEY);
};

export const getDatabaseLabel = (type) => ({
    firebase: 'Firebase / Cloud Firestore',
    postgres: 'PostgreSQL',
    mysql: 'MySQL / MariaDB',
    sqlite: 'SQLite'
}[type] || 'Database');
