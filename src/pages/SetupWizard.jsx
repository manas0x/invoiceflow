import React, { useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    Database,
    FileJson,
    LockKeyhole,
    Server,
    ShieldCheck,
    Sparkles,
    Store,
    Upload,
    Wifi,
    XCircle
} from 'lucide-react';
import { applySetupProfile, downloadDeploymentPackage, initializeDatabase, persistSetupOnServer, testDatabaseConnection } from '../services/installerService';
import { getDatabaseLabel, saveSetupConfig } from '../config/setupConfig';
import { getFirebaseConfig, getMissingFirebaseConfigFields, hasFirebaseConfig } from '../config/firebaseConfig';
import { createAdminCredentials } from '../services/localAuth';

const STEPS = ['Store profile', 'Database', 'Install'];

const DATABASES = [
    { id: 'firebase', title: 'Firebase', subtitle: 'Cloud Firestore', icon: Sparkles, color: '#f59e0b', description: 'Use the existing Firebase project and authentication setup.' },
    { id: 'postgres', title: 'PostgreSQL', subtitle: 'Recommended SQL', icon: Server, color: '#2563eb', description: 'Connect through the secure InvoiceFlow server connector.' },
    { id: 'mysql', title: 'MySQL', subtitle: 'MySQL / MariaDB', icon: Database, color: '#0f766e', description: 'Connect an existing MySQL or MariaDB database.' },
    { id: 'sqlite', title: 'SQLite', subtitle: 'Single-file database', icon: FileJson, color: '#7c3aed', description: 'Use a local SQLite file through the server connector.' }
];

const DEFAULT_DATABASE_PORTS = { postgres: '5432', mysql: '3306' };

const inputClass = 'w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-emerald-500/20';

const Field = ({ label, hint, children }) => (
    <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
        {children}
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
);

const DatabaseCard = ({ database, selected, onSelect }) => {
    const Icon = database.icon;
    return (
        <button
            type="button"
            onClick={() => onSelect(database.id)}
            className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
        >
            <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: database.color }}>
                    <Icon size={21} />
                </span>
                {selected && <CheckCircle2 className="text-emerald-600" size={20} />}
            </div>
            <p className="mt-4 font-bold text-slate-900">{database.title}</p>
            <p className="text-xs font-semibold text-slate-500">{database.subtitle}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{database.description}</p>
        </button>
    );
};

const SetupWizard = ({ onComplete }) => {
    const [step, setStep] = useState(0);
    const savedFirebaseConfig = getFirebaseConfig();
    const [profile, setProfile] = useState({
        storeName: '',
        tagline: 'Billing, inventory and customer management',
        address: '',
        phone: '',
        adminUsername: '',
        adminName: '',
        adminPassword: '',
        adminPasswordConfirm: '',
        currency: '₹',
        timezone: 'Asia/Kolkata'
    });
    const [database, setDatabase] = useState({
        type: 'firebase',
        apiBaseUrl: '/api',
        host: 'localhost',
        port: '5432',
        database: '',
        username: '',
        password: '',
        ssl: false,
        filePath: ''
    });
    const [firebaseConfig, setFirebaseConfig] = useState(savedFirebaseConfig);
    const [createDatabaseSchema, setCreateDatabaseSchema] = useState(true);
    const [importData, setImportData] = useState(null);
    const [importName, setImportName] = useState('');
    const [error, setError] = useState('');
    const [connectionMessage, setConnectionMessage] = useState('');
    const [connectionState, setConnectionState] = useState('idle');
    const [installing, setInstalling] = useState(false);

    const updateProfile = (key, value) => setProfile(current => ({ ...current, [key]: value }));
    const updateDatabase = (key, value) => setDatabase(current => ({ ...current, [key]: value }));
    const updateFirebaseConfig = (key, value) => setFirebaseConfig(current => ({ ...current, [key]: value }));
    const handleDatabaseSelect = (type) => {
        setDatabase(current => ({
            ...current,
            type,
            port: DEFAULT_DATABASE_PORTS[type] && ['5432', '3306'].includes(current.port)
                ? DEFAULT_DATABASE_PORTS[type]
                : current.port
        }));
        setConnectionState('idle');
        setConnectionMessage('');
        setError('');
    };

    const validateStep = () => {
        setError('');
        if (step === 0 && !profile.storeName.trim()) {
            setError('Enter the shop name to continue.');
            return false;
        }
        if ((step === 1 || step === 2) && database.type === 'firebase') {
            const missing = getMissingFirebaseConfigFields(firebaseConfig);
            if (missing.length) {
                setError(`Enter the Firebase credentials: ${missing.join(', ')}.`);
                return false;
            }
        }
        if (step === 1 && database.type !== 'firebase') {
            if (!database.apiBaseUrl.trim()) return setError('Enter the secure connector API URL.'), false;
            if (database.type === 'sqlite' && !database.filePath.trim()) return setError('Enter the SQLite file path.'), false;
            if (database.type !== 'sqlite' && (!database.host.trim() || !database.database.trim() || !database.username.trim())) {
                setError('Enter the SQL host, database name and username.');
                return false;
            }
        }
        return true;
    };

    const handleNext = () => {
        if (!validateStep()) return;
        setStep(current => Math.min(current + 1, STEPS.length - 1));
    };

    const handleTestConnection = async () => {
        setError('');
        setConnectionMessage('');
        setConnectionState('testing');
        try {
            const result = await testDatabaseConnection(database, firebaseConfig);
            setConnectionState('success');
            setConnectionMessage(result.message);
        } catch (connectionError) {
            setConnectionState('error');
            setError(connectionError.message);
        }
    };

    const handleImportFile = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!parsed?.data) throw new Error('This JSON file does not contain an InvoiceFlow backup.');
                setImportData(parsed);
                setImportName(file.name);
                setCreateDatabaseSchema(true);
                setError('');
            } catch (fileError) {
                setImportData(null);
                setImportName('');
                setError(fileError.message);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleInstall = async () => {
        if (!validateStep()) return;
        if (database.type !== 'firebase') {
            if (!profile.adminUsername.trim() || !profile.adminPassword) {
                setError('SQL mode requires an administrator username and password.');
                setStep(0);
                return;
            }
            if (profile.adminPassword.length < 8) {
                setError('Use an administrator password with at least 8 characters.');
                setStep(0);
                return;
            }
            if (profile.adminPassword !== profile.adminPasswordConfirm) {
                setError('Administrator passwords do not match.');
                setStep(0);
                return;
            }
        }
        setInstalling(true);
        setError('');
        try {
            const profileFields = { ...profile };
            delete profileFields.adminUsername;
            delete profileFields.adminName;
            delete profileFields.adminPassword;
            delete profileFields.adminPasswordConfirm;
            const storeProfile = applySetupProfile(profileFields);
            const adminCredentials = database.type === 'firebase'
                ? null
                : await createAdminCredentials({
                    username: profile.adminUsername,
                    password: profile.adminPassword,
                    name: profile.adminName
                });
            if (database.type !== 'firebase' && createDatabaseSchema) {
                await initializeDatabase(database, storeProfile);
            }
            const selectedDatabase = database.type === 'firebase'
                ? { ...database, firebaseConfig }
                : database;
            const setupConfig = {
                version: 1,
                completedAt: new Date().toISOString(),
                storeProfile,
                database: selectedDatabase,
                adminCredentials,
                databaseSetupPending: Boolean(importData),
                importData
            };
            let serverSetupSaved = false;
            if (database.type !== 'firebase') {
                await persistSetupOnServer(setupConfig);
                serverSetupSaved = true;
            } else {
                // Firebase deployments may be static and have no connector
                // process. Persist the local setup first, then best-effort the
                // server lock when the connector is available.
                try {
                    await persistSetupOnServer(setupConfig);
                    serverSetupSaved = true;
                } catch { /* local setup remains authoritative */ }
            }
            if (serverSetupSaved) {
                try {
                    await downloadDeploymentPackage(database);
                } catch (packageError) {
                    console.warn('Deployment package download skipped:', packageError.message);
                }
            }
            saveSetupConfig(setupConfig);
            onComplete();
        } catch (installError) {
            setError(installError.message || 'The installer could not save the setup.');
            setInstalling(false);
        }
    };

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#d8f3dc,_transparent_38%),linear-gradient(135deg,_#f8fafc,_#eef7f1)] px-4 py-8 text-slate-900 sm:px-8">
            <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[280px_1fr]">
                <aside className="hidden rounded-3xl bg-slate-950 p-7 text-white shadow-2xl lg:block">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500"><Store size={22} /></span>
                        <div><p className="font-black tracking-tight">InvoiceFlow</p><p className="text-xs text-slate-400">POS installer</p></div>
                    </div>
                    <div className="mt-12 space-y-7">
                        {STEPS.map((label, index) => (
                            <div className="flex items-center gap-3" key={label}>
                                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${index < step ? 'bg-emerald-500 text-white' : index === step ? 'bg-white text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                                    {index < step ? <Check size={15} /> : index + 1}
                                </span>
                                <span className={`text-sm font-semibold ${index === step ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-20 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-slate-300">
                        <ShieldCheck className="mb-3 text-emerald-400" size={20} />
                        Your setup is stored locally until the application is connected to its selected data provider.
                    </div>
                </aside>

                <section className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-2xl shadow-slate-300/40 backdrop-blur">
                    <div className="border-b border-slate-100 px-6 py-5 sm:px-10">
                        <div className="flex items-center justify-between">
                            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">First-run setup</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Set up your POS</h1></div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Step {step + 1} of {STEPS.length}</span>
                        </div>
                        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
                    </div>

                    <div className="min-h-[520px] px-6 py-7 sm:px-10">
                        {step === 0 && <div className="space-y-6">
                            <div><h2 className="text-xl font-bold">Tell us about the shop</h2><p className="mt-1 text-sm text-slate-500">These details appear on bills, invoices and the POS header.</p></div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Shop name"><input autoFocus className={inputClass} value={profile.storeName} onChange={event => updateProfile('storeName', event.target.value)} placeholder="e.g. Sunrise Store" /></Field>
                                <Field label="Phone number"><input className={inputClass} value={profile.phone} onChange={event => updateProfile('phone', event.target.value)} placeholder="+91 98765 43210" /></Field>
                            </div>
                            <Field label="Tagline"><input className={inputClass} value={profile.tagline} onChange={event => updateProfile('tagline', event.target.value)} placeholder="What the shop sells" /></Field>
                            <Field label="Address"><textarea className={`${inputClass} min-h-24 resize-y`} value={profile.address} onChange={event => updateProfile('address', event.target.value)} placeholder="Full billing address" /></Field>
                            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <div><p className="font-bold text-slate-900">Administrator account</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Required when you choose SQL. The password is stored only as a PBKDF2 hash and is never sent to Firebase.</p></div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Admin username"><input className={inputClass} value={profile.adminUsername} onChange={event => updateProfile('adminUsername', event.target.value)} placeholder="admin" autoComplete="username" /></Field>
                                    <Field label="Admin display name"><input className={inputClass} value={profile.adminName} onChange={event => updateProfile('adminName', event.target.value)} placeholder="Store Administrator" /></Field>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Admin password"><input type="password" className={inputClass} value={profile.adminPassword} onChange={event => updateProfile('adminPassword', event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></Field>
                                    <Field label="Confirm password"><input type="password" className={inputClass} value={profile.adminPasswordConfirm} onChange={event => updateProfile('adminPasswordConfirm', event.target.value)} placeholder="Repeat password" autoComplete="new-password" /></Field>
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Currency"><select className={inputClass} value={profile.currency} onChange={event => updateProfile('currency', event.target.value)}><option value="₹">₹ Indian Rupee</option><option value="$">$ US Dollar</option><option value="€">€ Euro</option><option value="£">£ Pound</option></select></Field>
                                <Field label="Timezone"><select className={inputClass} value={profile.timezone} onChange={event => updateProfile('timezone', event.target.value)}><option>Asia/Kolkata</option><option>UTC</option><option>America/New_York</option><option>Europe/London</option></select></Field>
                            </div>
                        </div>}

                        {step === 1 && <div className="space-y-6">
                            <div><h2 className="text-xl font-bold">Choose your data provider</h2><p className="mt-1 text-sm text-slate-500">Firebase is ready with this project. SQL databases connect through the InvoiceFlow server API.</p></div>
                            <div className="grid gap-3 sm:grid-cols-2">{DATABASES.map(item => <DatabaseCard key={item.id} database={item} selected={database.type === item.id} onSelect={handleDatabaseSelect} />)}</div>
                            {database.type === 'firebase' ? <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <div className="flex gap-3"><Sparkles className="mt-0.5 shrink-0" size={18} /><div><p className="font-bold">Firebase project configuration</p><p className="mt-1 text-xs leading-relaxed">{hasFirebaseConfig(firebaseConfig) ? <>Saved Firebase project: <strong>{firebaseConfig.projectId}</strong>. These credentials will be stored with this installation.</> : 'Enter the Firebase Web App configuration from Firebase Console → Project settings.'}</p></div></div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="API key"><input className={inputClass} value={firebaseConfig.apiKey} onChange={event => updateFirebaseConfig('apiKey', event.target.value)} placeholder="AIza..." /></Field>
                                    <Field label="Auth domain"><input className={inputClass} value={firebaseConfig.authDomain} onChange={event => updateFirebaseConfig('authDomain', event.target.value)} placeholder="your-project.firebaseapp.com" /></Field>
                                    <Field label="Project ID"><input className={inputClass} value={firebaseConfig.projectId} onChange={event => updateFirebaseConfig('projectId', event.target.value)} placeholder="your-project-id" /></Field>
                                    <Field label="Storage bucket"><input className={inputClass} value={firebaseConfig.storageBucket} onChange={event => updateFirebaseConfig('storageBucket', event.target.value)} placeholder="your-project.firebasestorage.app" /></Field>
                                    <Field label="Messaging sender ID"><input className={inputClass} value={firebaseConfig.messagingSenderId} onChange={event => updateFirebaseConfig('messagingSenderId', event.target.value)} placeholder="1234567890" /></Field>
                                    <Field label="App ID"><input className={inputClass} value={firebaseConfig.appId} onChange={event => updateFirebaseConfig('appId', event.target.value)} placeholder="1:1234567890:web:..." /></Field>
                                    <Field label="Measurement ID (optional)"><input className={inputClass} value={firebaseConfig.measurementId} onChange={event => updateFirebaseConfig('measurementId', event.target.value)} placeholder="G-XXXXXXXXXX" /></Field>
                                </div>
                                <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={handleTestConnection} disabled={connectionState === 'testing'} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-900 disabled:opacity-60"><Wifi size={16} /> {connectionState === 'testing' ? 'Checking...' : 'Check Firebase settings'}</button>{connectionState === 'success' && <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> {connectionMessage}</span>}</div>
                            </div> : <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <div className="grid gap-4 sm:grid-cols-2"><Field label="Connector API URL" hint="Example: https://pos.example.com/api"><input className={inputClass} value={database.apiBaseUrl} onChange={event => updateDatabase('apiBaseUrl', event.target.value)} /></Field>{database.type === 'sqlite' ? <Field label="SQLite file path"><input className={inputClass} value={database.filePath} onChange={event => updateDatabase('filePath', event.target.value)} placeholder="./data/invoiceflow.sqlite" /></Field> : <Field label="Host"><input className={inputClass} value={database.host} onChange={event => updateDatabase('host', event.target.value)} placeholder="db.example.com" /></Field>}</div>
                                {database.type !== 'sqlite' && <div className="grid gap-4 sm:grid-cols-2"><Field label="Port"><input className={inputClass} value={database.port} onChange={event => updateDatabase('port', event.target.value)} placeholder={database.type === 'mysql' ? '3306' : '5432'} /></Field><Field label="Database name"><input className={inputClass} value={database.database} onChange={event => updateDatabase('database', event.target.value)} placeholder="invoiceflow" /></Field></div>}
                                {database.type !== 'sqlite' && <div className="grid gap-4 sm:grid-cols-2"><Field label="Username"><input className={inputClass} value={database.username} onChange={event => updateDatabase('username', event.target.value)} placeholder="pos_user" /></Field><Field label="Password"><input type="password" className={inputClass} value={database.password} onChange={event => updateDatabase('password', event.target.value)} placeholder="Database password" /></Field></div>}
                                {database.type !== 'sqlite' && <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={database.ssl} onChange={event => updateDatabase('ssl', event.target.checked)} className="h-4 w-4 accent-emerald-600" /> Require SSL/TLS</label>}
                                <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={handleTestConnection} disabled={connectionState === 'testing'} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-60"><Wifi size={16} /> {connectionState === 'testing' ? 'Testing...' : 'Test connection'}</button>{connectionState === 'success' && <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600"><CheckCircle2 size={16} /> {connectionMessage}</span>}</div>
                            </div>}
                            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-xs leading-relaxed text-slate-500"><LockKeyhole className="mt-0.5 shrink-0 text-slate-700" size={17} /><span>SQL credentials are intended for the server-side connector. Do not expose this installer as a static public site if you need SQL connectivity.</span></div>
                        </div>}

                        {step === 2 && <div className="space-y-6">
                            <div><h2 className="text-xl font-bold">Install your POS</h2><p className="mt-1 text-sm text-slate-500">Review the choices, create the database schema, then open the application.</p></div>
                            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Shop</p><p className="mt-2 font-bold text-slate-900">{profile.storeName || '—'}</p><p className="mt-1 text-xs text-slate-500">{profile.address || 'No address added'}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Database</p><p className="mt-2 font-bold text-slate-900">{getDatabaseLabel(database.type)}</p><p className="mt-1 text-xs text-slate-500">{database.type === 'firebase' ? firebaseConfig.projectId || 'Project not configured' : database.apiBaseUrl}</p></div></div>
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={createDatabaseSchema} onChange={event => setCreateDatabaseSchema(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-600" /><span><span className="block font-bold text-emerald-950">Create empty database tables</span><span className="mt-1 block text-xs leading-relaxed text-emerald-800">Create the InvoiceFlow database structure without inserting sample products, customers, suppliers, or transactions.</span></span></label></div>
                            <div className="rounded-2xl border border-dashed border-slate-300 p-5"><div className="flex items-start gap-3"><Upload className="mt-0.5 text-slate-500" size={19} /><div className="flex-1"><p className="font-bold">Import an existing backup</p><p className="mt-1 text-xs text-slate-500">Restore records from an InvoiceFlow JSON export.</p><label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"><Upload size={15} /> Choose JSON backup<input type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" /></label>{importName && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700"><Check size={14} /> {importName} ready to import</p>}</div></div></div>
                            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-xs leading-relaxed text-slate-500"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={17} /><span>The installer creates the setup record and empty database structure first. Any selected backup is imported only after the connection succeeds.</span></div>
                        </div>}

                        {error && <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"><XCircle className="mt-0.5 shrink-0" size={17} />{error}</div>}
                    </div>

                    <footer className="flex items-center justify-between border-t border-slate-100 px-6 py-5 sm:px-10">
                        <button type="button" onClick={() => setStep(current => Math.max(current - 1, 0))} disabled={step === 0 || installing} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-500 disabled:invisible"><ArrowLeft size={16} /> Back</button>
                        {step < STEPS.length - 1 ? <button type="button" onClick={handleNext} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800">Continue <ArrowRight size={16} /></button> : <button type="button" onClick={handleInstall} disabled={installing} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60">{installing ? 'Installing...' : 'Install InvoiceFlow'} <Check size={16} /></button>}
                    </footer>
                </section>
            </div>
        </main>
    );
};

export default SetupWizard;
