import { getSetupConfig } from '../config/setupConfig';

const apiUrl = (base, path) => `${String(base || '/api').replace(/\/$/, '')}${path}`;

const request = async (method, args) => {
    const setup = getSetupConfig();
    const database = setup?.database;
    if (!database || database.type === 'firebase') {
        throw new Error('SQL data provider is not configured.');
    }

    const response = await fetch(apiUrl(database.apiBaseUrl, '/data'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, args, database })
    });
    let result = null;
    try {
        result = await response.json();
    } catch {
        // Surface the HTTP status when the connector does not return JSON.
    }
    if (!response.ok || result?.ok === false) {
        throw new Error(result?.message || `SQL connector returned HTTP ${response.status}.`);
    }
    return result?.data;
};

const subscribe = (method, args) => {
    const callback = args[args.length - 1];
    const requestArgs = typeof callback === 'function' ? args.slice(0, -1) : args;
    let stopped = false;

    const poll = async () => {
        try {
            const data = await request(method, requestArgs);
            if (!stopped && typeof callback === 'function') callback(data);
        } catch (error) {
            if (!stopped) console.warn(`SQL ${method} unavailable:`, error.message);
        }
    };

    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
        stopped = true;
        window.clearInterval(timer);
    };
};

export const sqlService = new Proxy({}, {
    get(_target, property) {
        if (property === 'then') return undefined;
        if (typeof property !== 'string') return undefined;
        if (property.startsWith('subscribe')) return (...args) => subscribe(property, args);
        return (...args) => request(property, args);
    }
});
