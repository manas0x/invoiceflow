const STORAGE_KEY = 'invoiceflow_offline_outbox';
let isFlushing = false;

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readQueue = () => {
    if (!canUseStorage()) return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeQueue = (queue) => {
    if (!canUseStorage()) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('invoiceflow:offline-queue'));
};

export const getOfflineQueueCount = () => readQueue().length;

export const subscribeOfflineQueue = (callback) => {
    if (typeof callback !== 'function') return () => {};
    const notify = () => callback(getOfflineQueueCount());
    notify();
    window.addEventListener('invoiceflow:offline-queue', notify);
    window.addEventListener('storage', notify);
    return () => {
        window.removeEventListener('invoiceflow:offline-queue', notify);
        window.removeEventListener('storage', notify);
    };
};

export const enqueueOfflineOperation = (operation, payload) => {
    const id = `OFFLINE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const queue = readQueue();
    queue.push({
        id,
        operation,
        payload,
        createdAt: new Date().toISOString(),
        attempts: 0
    });
    writeQueue(queue);
    return id;
};

export const flushOfflineQueue = async (processor) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
    if (isFlushing || typeof processor !== 'function') return 0;

    isFlushing = true;
    let completed = 0;
    try {
        const queue = readQueue();
        for (const item of queue) {
            try {
                await processor(item);
                const remaining = readQueue().filter(entry => entry.id !== item.id);
                writeQueue(remaining);
                completed += 1;
            } catch (error) {
                const current = readQueue();
                writeQueue(current.map(entry => entry.id === item.id
                    ? { ...entry, attempts: (entry.attempts || 0) + 1, lastError: error.message }
                    : entry));
                console.warn(`Offline ${item.operation} is still pending:`, error.message);
                break;
            }
        }
    } finally {
        isFlushing = false;
    }
    return completed;
};
