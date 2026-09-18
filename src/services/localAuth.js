import { getSetupConfig } from '../config/setupConfig';

const PBKDF2_ITERATIONS = 120000;

const bytesToBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const base64ToBytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

const derivePasswordHash = async (password, salt) => {
    if (!globalThis.crypto?.subtle) throw new Error('Secure password hashing is unavailable in this browser.');
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    return bytesToBase64(bits);
};

export const createAdminCredentials = async ({ username, password, name }) => {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return {
        username: username.trim().toLowerCase(),
        name: name.trim() || username.trim(),
        algorithm: 'PBKDF2-SHA-256',
        iterations: PBKDF2_ITERATIONS,
        salt: bytesToBase64(salt),
        hash: await derivePasswordHash(password, salt)
    };
};

export const isLocalAuthMode = () => getSetupConfig()?.database?.type !== 'firebase';

export const authenticateLocalUser = async (username, password) => {
    const setup = getSetupConfig();
    const normalizedUsername = username.trim().toLowerCase();
    const users = [
        ...(setup?.localUsers || []),
        setup?.adminCredentials ? {
            id: 'local-admin',
            username: setup.adminCredentials.username,
            name: setup.adminCredentials.name,
            role: 'admin',
            credentials: setup.adminCredentials
        } : null
    ].filter(Boolean);
    const localUser = users.find(user => user.username === normalizedUsername);
    const credentials = localUser?.credentials;
    if (!credentials) {
        throw new Error('Invalid username or password.');
    }

    const hash = await derivePasswordHash(password, base64ToBytes(credentials.salt));
    if (hash !== credentials.hash) throw new Error('Invalid username or password.');

    return {
        id: localUser.id || `local-${localUser.username}`,
        authUid: localUser.id || `local-${localUser.username}`,
        authProvider: 'local',
        username: credentials.username,
        name: credentials.name,
        role: localUser.role || 'staff',
        loginTime: Date.now()
    };
};
