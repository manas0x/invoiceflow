/* global process, Buffer */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const execFile = promisify(execFileCallback);
const STATIC_ROOT = resolve(process.cwd(), 'dist');
const SETUP_STATE_FILE = process.env.INVOICEFLOW_SETUP_FILE || resolve(process.cwd(), 'server/.invoiceflow-setup.json');
let setupStateCache;

const loadSetupState = async () => {
    if (setupStateCache !== undefined) return setupStateCache;
    try {
        setupStateCache = JSON.parse(await readFile(SETUP_STATE_FILE, 'utf8'));
    } catch {
        setupStateCache = null;
    }
    return setupStateCache;
};

const saveSetupState = async setup => {
    await mkdir(dirname(SETUP_STATE_FILE), { recursive: true });
    await writeFile(SETUP_STATE_FILE, JSON.stringify(setup, null, 2), 'utf8');
    setupStateCache = setup;
};

const publicSetupState = setup => {
    if (!setup) return null;
    const database = setup.database ? { ...setup.database } : undefined;
    if (database) delete database.password;
    return { ...setup, database };
};

const resolveDatabase = async database => {
    const setup = await loadSetupState();
    if (!setup?.database || !database?.type || setup.database.type !== database.type) return database;
    return {
        ...setup.database,
        ...database,
        password: setup.database.password || database.password
    };
};

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

const serveStatic = async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) return false;
    const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
    const candidate = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = resolve(STATIC_ROOT, candidate);
    const isInsideStaticRoot = filePath === STATIC_ROOT || filePath.startsWith(`${STATIC_ROOT}/`);

    let resolvedFile = isInsideStaticRoot ? filePath : resolve(STATIC_ROOT, 'index.html');
    try {
        const fileInfo = await stat(resolvedFile);
        if (!fileInfo.isFile()) throw new Error('Not a file');
    } catch {
        resolvedFile = resolve(STATIC_ROOT, 'index.html');
    }

    try {
        const content = await readFile(resolvedFile);
        response.writeHead(200, {
            'Content-Type': MIME_TYPES[extname(resolvedFile).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': extname(resolvedFile) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
        });
        if (request.method === 'HEAD') response.end();
        else response.end(content);
        return true;
    } catch {
        return false;
    }
};

const createDeploymentPackage = async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'invoiceflow-deployment-'));
    const archivePath = join(tempDir, 'InvoiceFlow-deployment.zip');
    const entries = ['dist', 'server', 'package.json', 'package-lock.json', '.env', 'README.md'];
    const availableEntries = [];
    for (const entry of entries) {
        try {
            await stat(resolve(process.cwd(), entry));
            availableEntries.push(entry);
        } catch {
            // Optional files, such as .env, can be absent on a clean server.
        }
    }

    try {
        await execFile('zip', ['-qr', archivePath, ...availableEntries], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
        return await readFile(archivePath);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
};

const writeJson = (response, status, payload) => {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    response.end(JSON.stringify(payload));
};

const readJson = (request) => new Promise((resolveBody, reject) => {
    let body = '';
    request.on('data', chunk => {
        body += chunk;
        if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
            reject(new Error('Request body is too large.'));
            request.destroy();
        }
    });
    request.on('end', () => {
        try {
            resolveBody(body ? JSON.parse(body) : {});
        } catch {
            reject(new Error('Request body must be valid JSON.'));
        }
    });
    request.on('error', reject);
});

const closeConnection = async connection => {
    if (connection?.close) await connection.close();
};

const openConnection = async database => {
    if (!database?.type) throw new Error('Choose a database type.');

    if (database.type === 'postgres') {
        const { Client } = await import('pg').catch(() => ({ Client: null }));
        if (!Client) throw new Error('PostgreSQL support is not installed. Run npm install.');
        const client = new Client({
            host: database.host,
            port: Number(database.port || 5432),
            database: database.database,
            user: database.username,
            password: database.password,
            ssl: database.ssl ? { rejectUnauthorized: false } : undefined
        });
        await client.connect();
        return {
            kind: 'postgres',
            query: (sql, params) => client.query(sql, params),
            close: () => client.end()
        };
    }

    if (database.type === 'mysql') {
        const mysql = await import('mysql2/promise').catch(() => null);
        if (!mysql?.default?.createConnection && !mysql?.createConnection) {
            throw new Error('MySQL support is not installed. Run npm install.');
        }
        const createConnection = mysql.createConnection || mysql.default.createConnection;
        const connection = await createConnection({
            host: database.host,
            port: Number(database.port || 3306),
            database: database.database,
            user: database.username,
            password: database.password,
            ssl: database.ssl ? {} : undefined
        });
        return {
            kind: 'mysql',
            query: (sql, params) => connection.query(sql, params),
            close: () => connection.end()
        };
    }

    if (database.type === 'sqlite') {
        const sqlite = await import('better-sqlite3').catch(() => null);
        const Database = sqlite?.default || sqlite;
        if (!Database) throw new Error('SQLite support is not installed. Run npm install.');
        const filePath = resolve(process.cwd(), database.filePath || './data/invoiceflow.sqlite');
        await mkdir(dirname(filePath), { recursive: true });
        const connection = new Database(filePath);
        return {
            kind: 'sqlite',
            query: async (sql, params = []) => {
                const statement = connection.prepare(sql);
                if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)) {
                    return { rows: statement.all(...params) };
                }
                return { run: statement.run(...params) };
            },
            close: () => connection.close()
        };
    }

    throw new Error(`Unsupported database type: ${database.type}`);
};

const initializeStorage = async connection => {
    if (connection.kind === 'postgres') {
        await connection.query(`CREATE TABLE IF NOT EXISTS invoiceflow_data (collection TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (collection, id))`);
    } else if (connection.kind === 'mysql') {
        await connection.query(`CREATE TABLE IF NOT EXISTS invoiceflow_data (collection VARCHAR(120) NOT NULL, id VARCHAR(190) NOT NULL, data JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (collection, id))`);
    } else {
        await connection.query(`CREATE TABLE IF NOT EXISTS invoiceflow_data (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (collection, id))`);
    }
};

const insertRow = async (connection, collection, id, data) => {
    if (connection.kind === 'postgres') {
        await connection.query(
            `INSERT INTO invoiceflow_data (collection, id, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data`,
            [collection, id, JSON.stringify(data)]
        );
    } else if (connection.kind === 'mysql') {
        await connection.query(
            `INSERT INTO invoiceflow_data (collection, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)`,
            [collection, id, JSON.stringify(data)]
        );
    } else {
        await connection.query(
            `INSERT INTO invoiceflow_data (collection, id, data) VALUES (?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data`,
            [collection, id, JSON.stringify(data)]
        );
    }
};

const importBackup = async ({ database, backup, storeProfile }) => {
    if (!backup?.data) throw new Error('Invalid InvoiceFlow backup data.');
    const connection = await openConnection(await resolveDatabase(database));
    try {
        await initializeStorage(connection);
        let imported = 0;
        for (const [collection, records] of Object.entries(backup.data)) {
            if (!Array.isArray(records)) continue;
            for (const record of records) {
                const id = String(record.docId || record.id || `${collection}-${imported + 1}`);
                const cleaned = { ...record };
                delete cleaned.docId;
                await insertRow(connection, collection, id, cleaned);
                imported += 1;
            }
        }
        if (storeProfile) await insertRow(connection, 'settings', 'store_profile', storeProfile);
        return imported;
    } finally {
        await closeConnection(connection);
    }
};

const COLLECTIONS = {
    Product: 'products', Customer: 'customers', Supplier: 'suppliers', Invoice: 'invoices',
    Purchase: 'purchases', CustomerPayment: 'customer_payments', SupplierPayment: 'supplier_payments',
    SaleReturn: 'sale_returns', PurchaseReturn: 'purchase_returns', Notification: 'notifications', User: 'users'
};

const collectionForMethod = method => {
    if (method === 'getInvoice' || method === 'updateInvoice' || method === 'deleteInvoice') return 'invoices';
    if (method === 'getUserById' || method === 'getUserByAuthUidField') return 'users';
    const match = method.match(/^(?:get|add|update|delete|subscribe)(.+)$/);
    if (!match) return null;
    if (match[1] === 'AppSettings') return 'settings';
    if (match[1] === 'InvoiceCount') return 'metadata';
    return COLLECTIONS[match[1]] || {
        Products: 'products', Customers: 'customers', Suppliers: 'suppliers', Invoices: 'invoices',
        Purchases: 'purchases', CustomerPayments: 'customer_payments', SupplierPayments: 'supplier_payments',
        SaleReturns: 'sale_returns', PurchaseReturns: 'purchase_returns', Notifications: 'notifications', Users: 'users'
    }[match[1]] || null;
};

const rowsForCollection = async (connection, collection, id = null) => {
    let result;
    if (connection.kind === 'postgres') {
        result = id
            ? await connection.query('SELECT id, data FROM invoiceflow_data WHERE collection = $1 AND id = $2', [collection, id])
            : await connection.query('SELECT id, data FROM invoiceflow_data WHERE collection = $1 ORDER BY created_at DESC', [collection]);
        return result.rows.map(row => ({ id: row.id, ...row.data }));
    }
    if (connection.kind === 'mysql') {
        const [rows] = id
            ? await connection.query('SELECT id, data FROM invoiceflow_data WHERE collection = ? AND id = ?', [collection, id])
            : await connection.query('SELECT id, data FROM invoiceflow_data WHERE collection = ? ORDER BY created_at DESC', [collection]);
        return rows.map(row => ({ id: row.id, ...(typeof row.data === 'string' ? JSON.parse(row.data) : row.data) }));
    }
    const resultRows = id
        ? await connection.query('SELECT id, data FROM invoiceflow_data WHERE collection = ? AND id = ?', [collection, id])
        : await connection.query('SELECT id, data FROM invoiceflow_data WHERE collection = ? ORDER BY created_at DESC', [collection]);
    return resultRows.rows.map(row => ({ id: row.id, ...JSON.parse(row.data) }));
};

const deleteRows = async (connection, collection, id = null) => {
    if (connection.kind === 'postgres') {
        return connection.query(
            id ? 'DELETE FROM invoiceflow_data WHERE collection = $1 AND id = $2' : 'DELETE FROM invoiceflow_data WHERE collection = $1',
            id ? [collection, id] : [collection]
        );
    }
    if (connection.kind === 'mysql') {
        return connection.query(
            id ? 'DELETE FROM invoiceflow_data WHERE collection = ? AND id = ?' : 'DELETE FROM invoiceflow_data WHERE collection = ?',
            id ? [collection, id] : [collection]
        );
    }
    return connection.query(
        id ? 'DELETE FROM invoiceflow_data WHERE collection = ? AND id = ?' : 'DELETE FROM invoiceflow_data WHERE collection = ?',
        id ? [collection, id] : [collection]
    );
};

const deleteAllRows = async connection => {
    return connection.query('DELETE FROM invoiceflow_data');
};

const recordId = (collection, record) => String(record?.docId || record?.id || `${collection}-${randomUUID()}`);

const writeRecord = async (connection, collection, id, record) => {
    const cleaned = { ...record };
    delete cleaned.docId;
    await insertRow(connection, collection, id, cleaned);
    return id;
};

const itemQuantity = item => {
    const quantity = Number(item?.quantity) || 0;
    return item?.salesType === 'Loose' ? quantity / (Number(item?.bagWeight) || 50) : quantity;
};

const adjustProductStock = async (connection, productId, delta) => {
    if (!productId || !delta) return;
    const existing = (await rowsForCollection(connection, 'products', String(productId)))[0];
    if (!existing) return;
    await writeRecord(connection, 'products', String(productId), {
        ...existing,
        stock: (Number(existing.stock) || 0) + Number(delta),
        updatedAt: new Date().toISOString()
    });
};

const adjustItemsStock = async (connection, items = [], direction) => {
    for (const item of items) {
        await adjustProductStock(connection, item.id, Number(direction) * itemQuantity(item));
    }
};

const createCustomerFromInvoice = async (connection, invoice) => {
    if (!invoice?.customerName) return;
    const customers = await rowsForCollection(connection, 'customers');
    const existing = customers.find(customer =>
        (invoice.customerPhone && customer.phone === invoice.customerPhone)
        || (invoice.customerName && customer.name === invoice.customerName)
    );
    const id = String(existing?.id || invoice.customerPhone || invoice.customerName.trim().replace(/\s+/g, '_').toLowerCase());
    await writeRecord(connection, 'customers', id, {
        ...(existing || {}),
        name: invoice.customerName,
        phone: invoice.customerPhone || existing?.phone || '',
        address: invoice.customerAddress || existing?.address || '',
        lastVisit: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString()
    });
};

const findMethodCollection = method => collectionForMethod(method);

const handleDataRequest = async ({ database, method, args = [] }) => {
    const connection = await openConnection(await resolveDatabase(database));
    try {
        await initializeStorage(connection);
        const collection = collectionForMethod(method);

        if (method === 'flushOfflineQueue' || method === 'sendNewBillEmail') return true;
        if (method === 'getInvoiceCount') {
            const rows = await rowsForCollection(connection, 'metadata', 'counters');
            return Number(rows[0]?.invoiceCount || 0);
        }
        if (method === 'updateInvoiceCount') {
            await writeRecord(connection, 'metadata', 'counters', { invoiceCount: Number(args[0]) || 0, updatedAt: new Date().toISOString() });
            return true;
        }
        if (method === 'getUserByEmail') {
            const email = String(args[0] || '').trim().toLowerCase();
            const users = await rowsForCollection(connection, 'users');
            return users.find(user => String(user.email || '').toLowerCase() === email
                || String(user.username || '').toLowerCase() === email) || null;
        }
        if (method === 'removeStoredUserPasswords') {
            const users = await rowsForCollection(connection, 'users');
            let changed = 0;
            for (const user of users) {
                if (!Object.prototype.hasOwnProperty.call(user, 'password')) continue;
                const { password: _password, ...safeUser } = user;
                await writeRecord(connection, 'users', user.id, { ...safeUser, securityUpdatedAt: new Date().toISOString() });
                changed += 1;
            }
            return changed;
        }
        if (method === 'removeStoredEmailCredentials') {
            const settings = (await rowsForCollection(connection, 'settings', 'email_notifications'))[0];
            if (!settings) return false;
            const protectedFields = ['brevoApiKey', 'smtpPass', 'smtpHost', 'smtpPort', 'smtpUser'];
            const hasCredentials = protectedFields.some(field => Object.prototype.hasOwnProperty.call(settings, field));
            if (!hasCredentials) return false;
            const cleaned = { ...settings, securityUpdatedAt: new Date().toISOString() };
            protectedFields.forEach(field => delete cleaned[field]);
            await writeRecord(connection, 'settings', 'email_notifications', cleaned);
            return true;
        }
        if (method === 'cleanExpiredNotifications') {
            const notifications = await rowsForCollection(connection, 'notifications');
            const now = Date.now();
            let removed = 0;
            for (const notification of notifications) {
                const expiry = notification.expiresAt
                    ? new Date(notification.expiresAt).getTime()
                    : new Date(notification.createdAt || 0).getTime() + 7 * 24 * 60 * 60 * 1000;
                if (Number.isFinite(expiry) && expiry <= now) {
                    await deleteRows(connection, 'notifications', notification.id);
                    removed += 1;
                }
            }
            return removed;
        }
        if (method === 'getAppSettings') {
            const rows = await rowsForCollection(connection, 'settings', String(args[0]));
            return rows[0] ? { ...rows[0], id: undefined } : null;
        }
        if (method === 'updateAppSettings') {
            const existing = await rowsForCollection(connection, 'settings', String(args[0]));
            await writeRecord(connection, 'settings', String(args[0]), { ...(existing[0] || {}), ...(args[1] || {}), updatedAt: new Date().toISOString() });
            return true;
        }
        if (method === 'exportAllDataJSON') {
            const data = {};
            for (const name of Object.values(COLLECTIONS).filter((value, index, list) => list.indexOf(value) === index)) {
                data[name] = (await rowsForCollection(connection, name)).map(({ id, ...record }) => ({ ...record, docId: id }));
            }
            return { version: '1.0', timestamp: new Date().toISOString(), data };
        }
        if (method === 'importAllDataJSON') {
            const imported = await importBackup({ database, backup: args[0] });
            return imported;
        }
        if (method === 'cleanWipeSoftware') {
            await deleteAllRows(connection);
            return 0;
        }
        if (method === 'migrateInvoiceIds') return { migratedCount: 0, skippedCount: (await rowsForCollection(connection, 'invoices')).length };
        if (['deduplicateCustomers', 'syncCustomerIds', 'resequenceInvoices'].includes(method)) return 0;
        if (['updateLinkedRecordsName', 'repairOrphanedInvoices'].includes(method)) return true;
        if (method === 'clearAllNotifications') return deleteRows(connection, 'notifications');
        if (method === 'markNotificationAsRead') {
            const existing = await rowsForCollection(connection, 'notifications', String(args[0]));
            if (existing[0]) await writeRecord(connection, 'notifications', String(args[0]), { ...existing[0], read: true });
            return true;
        }

        if (method.startsWith('subscribe')) {
            if (method === 'subscribeAppSettings') {
                const settings = await rowsForCollection(connection, 'settings', String(args[0]));
                return settings[0] ? (() => { const { id: _id, ...data } = settings[0]; return data; })() : null;
            }
            const rows = await rowsForCollection(connection, findMethodCollection(method));
            if (method === 'subscribeNotifications') {
                const now = Date.now();
                return rows.filter(notification => {
                    const expiry = notification.expiresAt
                        ? new Date(notification.expiresAt).getTime()
                        : new Date(notification.createdAt || 0).getTime() + 7 * 24 * 60 * 60 * 1000;
                    return !Number.isFinite(expiry) || expiry > now;
                }).slice(0, 50);
            }
            if (method === 'subscribeRecentInvoices') return rows.slice(0, Number(args[1]) || 50);
            return rows;
        }

        if (!collection) throw new Error(`SQL data method is not supported: ${method}`);
        if (method.startsWith('get')) {
            if (method === 'getInvoice') return (await rowsForCollection(connection, collection, String(args[0])))[0] || null;
            if (method === 'getUserById') return (await rowsForCollection(connection, collection, String(args[0])))[0] || null;
            if (method === 'getUserByAuthUidField') return (await rowsForCollection(connection, collection)).find(row => row.authUid === args[0]) || null;
            return rowsForCollection(connection, collection);
        }
        if (method.startsWith('add')) {
            const payload = { ...(args[0] || {}), createdAt: args[0]?.createdAt || new Date().toISOString() };
            if (method === 'addCustomer') payload.id = payload.id || payload.phone || payload.name?.trim().replace(/\s+/g, '_').toLowerCase();
            if (method === 'addInvoice') {
                const counter = (await rowsForCollection(connection, 'metadata', 'counters'))[0];
                const nextNumber = Number(counter?.invoiceCount || 0) + 1;
                payload.id = payload.id || `INV-${String(nextNumber).padStart(4, '0')}`;
                await adjustItemsStock(connection, payload.items, -1);
                await createCustomerFromInvoice(connection, payload);
                await writeRecord(connection, 'metadata', 'counters', { invoiceCount: nextNumber, updatedAt: new Date().toISOString() });
            }
            if (method === 'addPurchase') await adjustItemsStock(connection, payload.items, 1);
            if (method === 'addSaleReturn') await adjustItemsStock(connection, payload.items, 1);
            if (method === 'addPurchaseReturn') await adjustItemsStock(connection, payload.items, -1);
            const id = recordId(collection, payload);
            return writeRecord(connection, collection, id, payload);
        }
        if (method.startsWith('update')) {
            const id = String(args[0]);
            const existing = (await rowsForCollection(connection, collection, id))[0] || {};
            if (method === 'updateInvoice') {
                await adjustItemsStock(connection, existing.items, 1);
                await adjustItemsStock(connection, args[1]?.items, -1);
            }
            if (method === 'updatePurchase') {
                await adjustItemsStock(connection, existing.items, -1);
                await adjustItemsStock(connection, args[1]?.items, 1);
            }
            return writeRecord(connection, collection, id, { ...existing, ...(args[1] || {}), updatedAt: new Date().toISOString() });
        }
        if (method.startsWith('delete')) {
            const existing = (await rowsForCollection(connection, collection, String(args[0])))[0];
            if (method === 'deleteInvoice') await adjustItemsStock(connection, existing?.items, 1);
            if (method === 'deletePurchase') await adjustItemsStock(connection, existing?.items, -1);
            if (method === 'deleteSaleReturn') await adjustItemsStock(connection, existing?.items, -1);
            if (method === 'deletePurchaseReturn') await adjustItemsStock(connection, existing?.items, 1);
            await deleteRows(connection, collection, String(args[0]));
            return true;
        }
        throw new Error(`SQL data method is not supported: ${method}`);
    } finally {
        await closeConnection(connection);
    }
};

const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') return writeJson(response, 204, {});
    if (!request.url?.startsWith('/api/')) {
        if (await serveStatic(request, response)) return;
        return writeJson(response, 404, { ok: false, message: 'Not found.' });
    }
    if (request.url === '/api/setup/status' && request.method === 'GET') {
        const setup = await loadSetupState();
        return writeJson(response, 200, { ok: true, installed: Boolean(setup), setup: publicSetupState(setup) });
    }
    if (request.method !== 'POST') return writeJson(response, 405, { ok: false, message: 'Use POST for connector setup endpoints.' });

    try {
        const body = await readJson(request);
        if (request.url === '/api/setup/test-connection') {
            const connection = await openConnection(body);
            try {
                if (connection.kind === 'postgres') await connection.query('SELECT 1');
                else if (connection.kind === 'mysql') await connection.query('SELECT 1');
                else await connection.query('SELECT 1');
                return writeJson(response, 200, { ok: true, message: `${body.type} connection successful.` });
            } finally {
                await closeConnection(connection);
            }
        }

        if (request.url === '/api/setup/initialize') {
            const connection = await openConnection(await resolveDatabase(body.database));
            try {
                await initializeStorage(connection);
                if (body.storeProfile) await insertRow(connection, 'settings', 'store_profile', body.storeProfile);
                return writeJson(response, 200, { ok: true, message: `${body.database.type} tables are ready.` });
            } finally {
                await closeConnection(connection);
            }
        }

        if (request.url === '/api/setup/complete') {
            if (!body.setup?.completedAt || !body.setup?.database?.type) {
                throw new Error('A completed setup configuration is required.');
            }
            const existingSetup = await loadSetupState();
            const setup = {
                ...body.setup,
                database: {
                    ...(existingSetup?.database || {}),
                    ...(body.setup.database || {}),
                    password: body.setup.database.password || existingSetup?.database?.password
                }
            };
            await saveSetupState(setup);
            return writeJson(response, 200, { ok: true, installed: true });
        }

        if (request.url === '/api/setup/package') {
            if (!(await loadSetupState())) throw new Error('Complete the installation before creating a deployment package.');
            const archive = await createDeploymentPackage();
            response.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="InvoiceFlow-deployment.zip"',
                'Content-Length': archive.length,
                'Access-Control-Allow-Origin': '*'
            });
            return response.end(archive);
        }

        if (request.url === '/api/setup/import') {
            const imported = await importBackup(body);
            return writeJson(response, 200, { ok: true, imported, message: `Imported ${imported} records.` });
        }

        if (request.url === '/api/data') {
            const data = await handleDataRequest(body);
            return writeJson(response, 200, { ok: true, data });
        }

        return writeJson(response, 404, { ok: false, message: 'Connector endpoint not found.' });
    } catch (error) {
        console.error('InvoiceFlow connector error:', error.message);
        return writeJson(response, 400, { ok: false, message: error.message });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`InvoiceFlow connector listening on http://127.0.0.1:${PORT}`);
});
