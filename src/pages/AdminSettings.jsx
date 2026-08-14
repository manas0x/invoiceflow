import React, { useState } from 'react';
import { Database, Shield, Lock, Unlock, CheckCircle, Database as DatabaseIcon, AlertTriangle, Puzzle, Globe, BarChart, Zap, X, Users, UserPlus, Trash2, HardDrive, Edit, History } from 'lucide-react';
import { pluginLoader } from '../pluginLoader';
import { firestoreService } from '../services/firestoreService';
import { showSuccess, showError } from '../utils/alert';
import { authenticateLocalUser, createAdminCredentials, isLocalAuthMode } from '../services/localAuth';
import { cacheInvoiceTemplateSettings, getInvoiceTemplateSettings } from '../config/invoiceTemplateConfig';
import { DEFAULT_APP_THEME, normalizeAppTheme } from '../config/themeConfig';
import { getCachedStoreName } from '../config/storeConfig';
import { getSetupConfig, saveSetupConfig } from '../config/setupConfig';
import { persistSetupOnServer } from '../services/installerService';

const AdminSettings = ({ setActiveTab, role: sessionRole }) => {
    const [isUnlocked, setIsUnlocked] = React.useState(false);
    const [password, setPassword] = React.useState('');
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [processStatus, setProcessStatus] = React.useState(null);
    const [plugins, setPlugins] = React.useState([]);
    const [managingPlugin, setManagingPlugin] = React.useState(null);
    const [usersList, setUsersList] = React.useState([]);
    const [isBackingUp, setIsBackingUp] = React.useState(false);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = React.useState(false);
    const [isRepairModalOpen, setIsRepairModalOpen] = React.useState(false);
    const [repairForm, setRepairForm] = React.useState({ oldName: '', targetName: '' });
    const [newUserForm, setNewUserForm] = React.useState({
        username: '',
        name: '',
        role: 'staff',
        password: ''
    });
    const [editingUserId, setEditingUserId] = React.useState(null);
    const [emailSettings, setEmailSettings] = React.useState({
        smtpHost: '',
        smtpPort: '587',
        smtpUser: '',
        smtpPass: '',
        recipientEmail: '',
        enabled: false
    });
    const [invoiceCount, setInvoiceCount] = React.useState(0);
    const [manualInvoiceCount, setManualInvoiceCount] = React.useState('');
    const [invoiceTemplateSettings, setInvoiceTemplateSettings] = React.useState(getInvoiceTemplateSettings);
    const [appTheme, setAppTheme] = React.useState(DEFAULT_APP_THEME);

    const fetchUsers = async () => {
        try {
            const users = await firestoreService.getUsers();
            setUsersList(users);
        } catch (err) {
            console.error("Failed to fetch users:", err);
        }
    };

    // Sync plugins and users on unlock
    React.useEffect(() => {
        if (isUnlocked) {
            setPlugins(pluginLoader.getAllPlugins());
            fetchUsers();

            // Fetch last backup from DB
            const syncBackupState = async () => {
                try {
                    const backupSettings = await firestoreService.getAppSettings('google_drive_backup');
                    if (backupSettings?.lastBackup) {
                        const plugin = pluginLoader.getPlugin('google-drive');
                        if (plugin && plugin.settings.lastBackup !== backupSettings.lastBackup) {
                            plugin.settings.lastBackup = backupSettings.lastBackup;
                            pluginLoader.saveStates();
                            setPlugins(pluginLoader.getAllPlugins());
                        }
                    }

                    // Fetch Email Settings
                    const emailData = await firestoreService.getAppSettings('email_notifications');
                    if (emailData) {
                        setEmailSettings(prev => ({ ...prev, ...emailData }));
                    }

                    const invoiceTemplate = await firestoreService.getAppSettings('invoice_template');
                    if (invoiceTemplate) {
                        setInvoiceTemplateSettings(cacheInvoiceTemplateSettings(invoiceTemplate));
                    }

                    const appPreferences = await firestoreService.getAppSettings('app_preferences');
                    setAppTheme(normalizeAppTheme(appPreferences?.theme));

                    // Fetch Invoice Count
                    const count = await firestoreService.getInvoiceCount();
                    setInvoiceCount(count);
                    setManualInvoiceCount(count.toString());

                } catch (err) {
                    console.warn("Failed to sync settings from Firestore:", err.message);
                }
            };
            syncBackupState();
        }

        const timer = setInterval(() => {
            const all = pluginLoader.getAllPlugins();
            if (all.length > 0 && plugins.length === 0) {
                setPlugins(all);
                clearInterval(timer);
            }
        }, 500);

        return () => clearInterval(timer);
    }, [isUnlocked]);

    const handleUnlock = async (e) => {
        e.preventDefault();
        setIsProcessing(true);
        try {
            if (isLocalAuthMode()) {
                const localUser = JSON.parse(localStorage.getItem('invoiceflow_user') || 'null');
                if (!localUser || localUser.authProvider !== 'local') {
                    throw new Error('Your login session has expired. Please sign in again.');
                }
                await authenticateLocalUser(localUser.username, password);
            } else {
                const [{ auth }, { EmailAuthProvider, reauthenticateWithCredential }] = await Promise.all([
                    import('../firebase'),
                    import('firebase/auth')
                ]);
                const currentUser = auth.currentUser;
                if (!currentUser) throw new Error('Your login session has expired. Please sign in again.');

                // The app uses one UID-bound users document as the source of truth.
                // Do not rely on optional custom claims or a stale cached session
                // when deciding whether the current account may open settings.
                const profile = await firestoreService.getUserById(currentUser.uid)
                    || await firestoreService.getUserByAuthUidField(currentUser.uid);
                const role = sessionRole || profile?.role;
                const isAdmin = role === 'admin' || role === 'dev_admin';
                if (!isAdmin) throw new Error('Only an administrator can open these settings.');

                if (!currentUser.email) throw new Error('This administrator account cannot be verified with a password.');
                await reauthenticateWithCredential(
                    currentUser,
                    EmailAuthProvider.credential(currentUser.email, password)
                );
            }

            setIsUnlocked(true);
            setPassword('');
            showSuccess("Admin Settings Unlocked");
        } catch (error) {
            showError(error.code === 'auth/invalid-credential' ? 'Incorrect login password.' : error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBackup = async () => {
        setIsProcessing(true);
        setProcessStatus("Preparing JSON Backup...");
        try {
            const backup = await firestoreService.exportAllDataJSON();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            const date = new Date().toISOString().split('T')[0];
            const fileName = getCachedStoreName().replace(/[^a-z0-9]+/gi, '_');
            downloadAnchorNode.setAttribute("download", `${fileName}_Backup_${date}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            showSuccess("Backup JSON Downloaded!");
        } catch (error) {
            showError("Backup Failed: " + error.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus(null);
        }
    };

    const handleSaveEmailSettings = async () => {
        setIsProcessing(true);
        try {
            // Only update fields managed through the UI to prevent wiping credentials
            await firestoreService.updateAppSettings('email_notifications', {
                enabled: emailSettings.enabled,
                recipientEmail: emailSettings.recipientEmail
            });
            showSuccess("Email recipient updated successfully!");
        } catch (err) {
            showError("Failed to save email settings: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveInvoiceTemplate = async () => {
        setIsProcessing(true);
        try {
            const savedSettings = cacheInvoiceTemplateSettings(invoiceTemplateSettings);
            await firestoreService.updateAppSettings('invoice_template', savedSettings);
            setInvoiceTemplateSettings(savedSettings);
            showSuccess('Bill template and GST details saved successfully!');
        } catch (err) {
            showError('Failed to save bill template: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveAppTheme = async () => {
        setIsProcessing(true);
        try {
            await firestoreService.updateAppSettings('app_preferences', { theme: normalizeAppTheme(appTheme) });
            setAppTheme(normalizeAppTheme(appTheme));
            showSuccess('Website theme updated successfully!');
        } catch (err) {
            showError('Failed to save website theme: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm("⚠️ WARNING: This will overwrite your existing data. Restore from JSON?")) {
            e.target.value = '';
            return;
        }

        setIsProcessing(true);
        setProcessStatus("Reading File...");

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const backup = JSON.parse(event.target.result);
                setProcessStatus("Starting Restore...");
                const count = await firestoreService.importAllDataJSON(backup, (curr, total) => {
                    setProcessStatus(`Restoring: ${curr}/${total} records`);
                });
                showSuccess(`Import Successful! ${count} records restored.`);
            } catch (err) {
                showError("Import Failed: " + err.message);
            } finally {
                setIsProcessing(false);
                setProcessStatus(null);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleDeduplicate = async () => {
        if (!window.confirm("Merge duplicate customer profiles?")) return;
        setIsProcessing(true);
        setProcessStatus("Identifying Duplicates...");
        try {
            const count = await firestoreService.deduplicateCustomers((curr, total) => setProcessStatus(`Merging ${curr}/${total}`));
            showSuccess(`Deduplication Complete! ${count} records merged.`);
        } catch (err) {
            showError("Deduplication Failed: " + err.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus(null);
        }
    };

    const handleMigrate = async () => {
        if (!window.confirm("Migrate Firestore Doc IDs to Invoice ID format? (e.g. INV-0015)")) return;
        setIsProcessing(true);
        setProcessStatus("Starting ID Synchronization...");
        try {
            const result = await firestoreService.migrateInvoiceIds((progress) => setProcessStatus(progress));
            showSuccess(`Migration Complete! ${result.migratedCount} updated.`);
        } catch (err) {
            showError("Migration Failed: " + err.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus(null);
        }
    };

    const handleRepairHistory = async (e) => {
        e.preventDefault();
        if (!repairForm.oldName || !repairForm.targetName) return showError("Both names required");

        setIsProcessing(true);
        setProcessStatus(`Migrating history from ${repairForm.oldName}...`);
        try {
            await firestoreService.repairOrphanedInvoices(repairForm.oldName, repairForm.targetName);
            showSuccess(`History Link Complete! All bills from "${repairForm.oldName}" moved to "${repairForm.targetName}".`);
            setIsRepairModalOpen(false);
            setRepairForm({ oldName: '', targetName: '' });
        } catch (err) {
            showError("Repair Failed: " + err.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus(null);
        }
    };

    async function handleSyncCustomers() {
        if (!window.confirm("Standardize all Customer Storage IDs? This will update IDs like 'cash' to 'cash_sale' and link all existing payments.")) return;
        setIsProcessing(true);
        setProcessStatus("Starting Customer ID Synchronization...");
        try {
            const count = await firestoreService.syncCustomerIds((progress) => setProcessStatus(progress));
            showSuccess(`Sync Complete! ${count} customers updated.`);
        } catch (err) {
            console.error("Customer Sync Failed:", err);
            showError("Customer ID Sync Failed: " + err.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus(null);
        }
    }

    async function handleResequence() {
        const confirm1 = window.confirm("🚨 WARNING: This will RENAME all existing bills to fill gaps (INV-0001, INV-0002, etc.) based on their date. Old bill numbers will change. Proceed?");
        if (!confirm1) return;

        const confirm2 = window.confirm("Are you ABSOLUTELY sure? This cannot be undone and will change your historical record numbers.");
        if (!confirm2) return;

        setIsProcessing(true);
        setProcessStatus("Sorting & Resequencing Bills...");
        try {
            const count = await firestoreService.resequenceInvoices((progress) => setProcessStatus(progress));
            showSuccess(`Resequence Complete! ${count} bills updated to new IDs.`);
        } catch (err) {
            console.error("Resequence Failed:", err);
            showError("Billing Resequence Failed: " + err.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus(null);
        }
    }

    async function handleUpdateInvoiceCount() {
        if (!manualInvoiceCount || isNaN(manualInvoiceCount)) {
            showError("Please enter a valid number");
            return;
        }

        const confirm = window.confirm(`Update next invoice number to ${Number(manualInvoiceCount) + 1}? (Current bills will not be affected)`);
        if (!confirm) return;

        setIsProcessing(true);
        try {
            await firestoreService.updateInvoiceCount(manualInvoiceCount);
            setInvoiceCount(Number(manualInvoiceCount));
            showSuccess("Invoice counter updated!");
        } catch (err) {
            showError("Failed to update counter: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    }

    const handleCleanWipe = async () => {
        const confirm1 = window.confirm("🚨 EXTREME DANGER: This will delete ALL data (Invoices, Products, Customers, Payments) and reset your bill numbers to zero. This cannot be undone.");
        if (!confirm1) return;

        const challenge = window.prompt("To confirm this destructive action, type 'CLEAR SOFTWARE' in the box below:");
        if (challenge !== 'CLEAR SOFTWARE') {
            showError("Invalid confirmation text. Operation cancelled.");
            return;
        }

        setIsProcessing(true);
        setProcessStatus("Initializing Full Wipe...");
        try {
            const count = await firestoreService.cleanWipeSoftware((deleted) => {
                setProcessStatus(`Deleted: ${deleted} records`);
            });
            showSuccess(`Software Wiped Successfully! Total ${count} records deleted.`);
            // Refresh counts or redirect?
        } catch (err) {
            showError("Wipe Failed: " + err.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus(null);
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            if (editingUserId) {
                if (isLocalAuthMode()) {
                    const setup = getSetupConfig();
                    const localUsers = (setup?.localUsers || []).map(user => user.id === editingUserId
                        ? { ...user, username: newUserForm.username.trim().toLowerCase(), name: newUserForm.name.trim() }
                        : user);
                    const updatedSetup = { ...setup, localUsers };
                    await persistSetupOnServer(updatedSetup);
                    saveSetupConfig(updatedSetup);
                }
                await firestoreService.addUser({
                    id: editingUserId,
                    username: newUserForm.username.trim().toLowerCase(),
                    name: newUserForm.name.trim(),
                    role: 'staff',
                    createdAt: newUserForm.createdAt || new Date().toISOString()
                });
            } else {
                if (isLocalAuthMode()) {
                    const username = newUserForm.username.trim().toLowerCase();
                    const name = newUserForm.name.trim() || username;
                    if (!username || !newUserForm.password || newUserForm.password.length < 8) {
                        throw new Error('Enter a username and a staff password with at least 8 characters.');
                    }
                    const setup = getSetupConfig();
                    const localUsers = setup?.localUsers || [];
                    if (localUsers.some(user => user.username === username) || setup?.adminCredentials?.username === username) {
                        throw new Error('That username is already in use.');
                    }
                    const localUser = {
                        id: `local-${Date.now()}`,
                        username,
                        name,
                        role: 'staff',
                        credentials: await createAdminCredentials({ username, password: newUserForm.password, name }),
                        createdAt: new Date().toISOString()
                    };
                    const updatedSetup = { ...setup, localUsers: [...localUsers, localUser] };
                    await persistSetupOnServer(updatedSetup);
                    saveSetupConfig(updatedSetup);
                    await firestoreService.addUser({
                        id: localUser.id,
                        username: localUser.username,
                        name: localUser.name,
                        role: localUser.role,
                        authProvider: 'local',
                        createdAt: localUser.createdAt
                    });
                } else {
                    const { createStaffUser } = await import('../services/userManagement');
                    await createStaffUser({
                        username: newUserForm.username,
                        password: newUserForm.password,
                        name: newUserForm.name
                    });
                }
            }
            showSuccess(`User ${newUserForm.username} ${editingUserId ? 'updated' : 'added'}!`);
            setNewUserForm({ username: '', name: '', role: 'staff', password: '' });
            setEditingUserId(null);
            setIsAddUserModalOpen(false);
            fetchUsers();
        } catch (err) {
            showError("Operation failed: " + err.message);
        }
    };

    const openEditModal = (user) => {
        setNewUserForm({
            username: user.username,
            name: user.name,
            role: user.role,
            password: '',
            createdAt: user.createdAt
        });
        setEditingUserId(user.id);
        setIsAddUserModalOpen(true);
    };

    const handleDeleteUser = async (id, role) => {
        if (role === 'admin' || role === 'dev_admin') {
            showError("Administrators cannot be removed here.");
            return;
        }
        if (!window.confirm("Revoke access for this user?")) return;
        try {
            if (isLocalAuthMode()) {
                const setup = getSetupConfig();
                const updatedSetup = { ...setup, localUsers: (setup?.localUsers || []).filter(user => user.id !== id) };
                await persistSetupOnServer(updatedSetup);
                saveSetupConfig(updatedSetup);
            }
            await firestoreService.deleteUser(id);
            showSuccess("User access revoked.");
            fetchUsers();
        } catch (err) {
            showError("Failed to remove user: " + err.message);
        }
    };

    const togglePlugin = (id) => {
        const plugin = pluginLoader.getPlugin(id);
        if (!plugin) {
            console.warn(`Plugin ${id} not found`);
            return;
        }

        const wasEnabled = plugin.enabled;
        if (wasEnabled) {
            pluginLoader.disable(id);
        } else {
            pluginLoader.enable(id);
        }
        setPlugins(pluginLoader.getAllPlugins());
        showSuccess(`Plugin ${wasEnabled ? 'Disabled' : 'Enabled'}`);
    };

    if (!isUnlocked) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="card max-w-md w-full p-8 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Shield size={32} className="text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Developer Access</h2>
                    <p className="text-sm text-gray-500 mb-8">Enter the administrator password to access developer features.</p>

                    <form onSubmit={handleUnlock} className="space-y-4">
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="password"
                                placeholder="Administrator password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/30 hover:opacity-90 active:scale-[0.98] transition-all"
                        >
                            Unlock Settings
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-settings-page space-y-8 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Unlock size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">Admin Settings</h2>
                        <p className="text-sm text-gray-500">Developer & Maintenance Tools</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsUnlocked(false)}
                    className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
                >
                    Lock Session
                </button>
            </div>

            <div className="card p-6 space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div>
                    <h3 className="font-bold text-lg">Website Theme</h3>
                    <p className="text-xs text-gray-500 mt-1">Only administrators can change the theme used by every signed-in user.</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <label className="flex-1 text-xs font-bold uppercase text-gray-500">
                        Application theme
                        <select
                            value={appTheme}
                            onChange={(e) => setAppTheme(e.target.value)}
                            className="mt-1 w-full p-3 border rounded-xl text-sm font-semibold normal-case"
                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                        >
                            <option value="emerald">Green / Emerald</option>
                            <option value="blue">Blue / Corporate</option>
                            <option value="dark">Black / Midnight</option>
                        </select>
                    </label>
                    <button onClick={handleSaveAppTheme} disabled={isProcessing} className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50">
                        {isProcessing ? 'Saving...' : 'Save Website Theme'}
                    </button>
                </div>
            </div>

            <div className="card p-6 space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div>
                    <h3 className="font-bold text-lg">Bill Template & GST Details</h3>
                    <p className="text-xs text-gray-500 mt-1">Choose the invoice layout and seller details printed on A4 bills.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Bill template
                        <select
                            value={invoiceTemplateSettings.template}
                            onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, template: e.target.value })}
                            className="mt-1 w-full p-3 border rounded-xl text-sm font-semibold normal-case"
                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                        >
                            <option value="classic">Classic Invoice</option>
                            <option value="retail">Retail GST Invoice (attached layout)</option>
                        </select>
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Invoice title
                        <input value={invoiceTemplateSettings.invoiceTitle} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, invoiceTitle: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="flex items-center justify-between gap-4 p-3 border rounded-xl text-xs font-bold uppercase text-gray-500">
                        <span>
                            Thermal printer
                            <span className="block mt-1 text-[10px] font-medium normal-case text-gray-400">Show and print thermal receipts from bill history</span>
                        </span>
                        <input
                            type="checkbox"
                            checked={invoiceTemplateSettings.thermalPrinterEnabled === true}
                            onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, thermalPrinterEnabled: e.target.checked })}
                            className="h-5 w-5 accent-primary"
                        />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Dispatch document no.
                        <input value={invoiceTemplateSettings.dispatchDocumentNo} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, dispatchDocumentNo: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Dispatched through
                        <input value={invoiceTemplateSettings.dispatchedThrough} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, dispatchedThrough: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Destination
                        <input value={invoiceTemplateSettings.destination} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, destination: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Terms of delivery
                        <input value={invoiceTemplateSettings.termsOfDelivery} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, termsOfDelivery: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Seller / business name
                        <input value={invoiceTemplateSettings.sellerName} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, sellerName: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        GSTIN
                        <input value={invoiceTemplateSettings.sellerGstin} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, sellerGstin: e.target.value.toUpperCase() })} placeholder="e.g. 05ABCDE1234F1Z5" className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500 md:col-span-2">
                        Seller address
                        <input value={invoiceTemplateSettings.sellerAddress} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, sellerAddress: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Phone
                        <input value={invoiceTemplateSettings.sellerPhone} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, sellerPhone: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Email
                        <input type="email" value={invoiceTemplateSettings.sellerEmail} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, sellerEmail: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        State
                        <input value={invoiceTemplateSettings.sellerState} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, sellerState: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        State code
                        <input value={invoiceTemplateSettings.sellerStateCode} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, sellerStateCode: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        License / seed number
                        <input value={invoiceTemplateSettings.sellerLicenseNo} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, sellerLicenseNo: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <div className="md:col-span-2 pt-2 border-t text-xs font-bold uppercase tracking-wide text-gray-500" style={{ borderColor: 'var(--border)' }}>Payment details printed inside the bill</div>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Bank name
                        <input value={invoiceTemplateSettings.paymentBankName} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, paymentBankName: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Account name
                        <input value={invoiceTemplateSettings.paymentAccountName} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, paymentAccountName: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        Account number
                        <input value={invoiceTemplateSettings.paymentAccountNumber} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, paymentAccountNumber: e.target.value })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500">
                        IFSC code
                        <input value={invoiceTemplateSettings.paymentIfscCode} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, paymentIfscCode: e.target.value.toUpperCase() })} className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <label className="text-xs font-bold uppercase text-gray-500 md:col-span-2">
                        UPI ID
                        <input value={invoiceTemplateSettings.paymentUpiId} onChange={(e) => setInvoiceTemplateSettings({ ...invoiceTemplateSettings, paymentUpiId: e.target.value })} placeholder="example@upi" className="mt-1 w-full p-3 border rounded-xl text-sm normal-case" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </label>
                    <button onClick={handleSaveInvoiceTemplate} disabled={isProcessing} className="md:col-span-2 px-5 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50">
                        {isProcessing ? 'Saving...' : 'Save Bill Template & GST Details'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Backup & Restore */}
                <div className="card p-6 space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3 mb-2">
                        <DatabaseIcon className="text-blue-500" size={20} />
                        <h3 className="font-bold">Data Management</h3>
                    </div>
                    <p className="text-xs text-gray-500">Export your entire database to a JSON file or restore from a previous backup.</p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                            onClick={handleBackup}
                            disabled={isProcessing}
                            className="flex flex-col items-center justify-center p-4 border rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-all group"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <span className="text-xs font-bold text-blue-600 mb-1 text-center">Export Database (JSON)</span>
                        </button>

                        <label className="flex flex-col items-center justify-center p-4 border rounded-xl hover:bg-orange-50 hover:border-orange-200 cursor-pointer transition-all group text-center"
                            style={{ borderColor: 'var(--border)' }}>
                            <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={isProcessing} />
                            <span className="text-xs font-bold text-orange-600">Import / Restore JSON</span>
                        </label>
                    </div>

                    {/* Google Drive Manual Trigger (Developer Only) */}
                    {pluginLoader.getPlugin('google-drive')?.enabled && (
                        <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                            <div className="flex items-center gap-2 mb-2">
                                <Shield size={12} className="text-primary" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Google Drive Cloud</span>
                            </div>
                            <button
                                onClick={async () => {
                                    const plugin = pluginLoader.getPlugin('google-drive');
                                    setIsProcessing(true);
                                    setProcessStatus("Uploading to Google Drive...");
                                    try {
                                        if (getSetupConfig()?.database?.type === 'firebase') {
                                            const { auth } = await import('../firebase');
                                            if (!auth.currentUser) {
                                                showError("Firebase Session not ready. Please wait a moment or re-login.");
                                                return;
                                            }
                                        }
                                        const { GoogleDrivePlugin } = await import('../plugins/google_drive.plugin');
                                        const sessionToken = JSON.parse(localStorage.getItem('invoiceflow_user'))?.googleAccessToken;
                                        const accessToken = sessionToken || plugin.settings.accessToken;

                                        if (!accessToken) {
                                            showError("No Google Drive token found. Connect first.");
                                            return;
                                        }

                                        await GoogleDrivePlugin.performBackup({
                                            ...plugin.settings,
                                            accessToken: accessToken,
                                            isFromSession: !!sessionToken
                                        }, (newSettings) => {
                                            plugin.settings = newSettings;
                                            pluginLoader.saveStates();
                                            setPlugins(pluginLoader.getAllPlugins());
                                        });
                                        showSuccess("Google Drive Backup Successful!");
                                    } catch (err) {
                                        console.error("Manual Backup Failed:", err);
                                        showError("Cloud Backup Failed: " + err.message);
                                    } finally {
                                        setIsProcessing(false);
                                        setProcessStatus(null);
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:opacity-90 active:scale-[0.98] transition-all"
                            >
                                <HardDrive size={16} /> Backup Now (Google Drive)
                            </button>
                        </div>
                    )}
                </div>

                {/* Simplified Email Notifications */}
                <div className="card p-6 space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Globe className="text-blue-500" size={20} />
                            <h3 className="font-bold text-sm">Bill Notifications</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={emailSettings.enabled}
                                onChange={(e) => setEmailSettings({ ...emailSettings, enabled: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>
                    <p className="text-[10px] text-gray-400">Automated alerts are sent via Brevo (API). Configure recipient below.</p>

                    <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alert Recipient Email</label>
                            <input
                                type="email"
                                value={emailSettings.recipientEmail || ''}
                                onChange={(e) => setEmailSettings({ ...emailSettings, recipientEmail: e.target.value })}
                                placeholder="admin@example.com"
                                className="w-full p-2.5 px-3 rounded-xl border border-border bg-background text-xs font-semibold"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            />
                        </div>
                        <div className="p-3 bg-blue-50/5 border border-blue-500/20 rounded-xl">
                            <p className="text-[9px] text-blue-500 leading-relaxed font-medium">
                                <span className="font-bold uppercase tracking-tight">Note:</span> Host, Port, and API credentials are now managed securely via environment variables (.env.local).
                            </p>
                        </div>
                        <button
                            onClick={handleSaveEmailSettings}
                            disabled={isProcessing}
                            className="w-full py-3 bg-primary/10 text-primary rounded-xl text-[10px] font-bold hover:bg-primary hover:text-white transition-all uppercase tracking-widest shadow-sm"
                        >
                            {isProcessing ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </div>

                {/* Invoice Continuity & Sequencing */}
                <div className="card p-6 space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                        <History className="text-emerald-500" size={20} />
                        <div>
                            <h3 className="font-bold text-sm">Invoice Continuity</h3>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Sequence Management</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="p-4 rounded-xl border border-border bg-background">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Next Invoice ID</label>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                                <span className="w-fit text-sm font-bold text-primary bg-primary/10 px-3 py-2 rounded-lg">INV-{(invoiceCount + 1).toString().padStart(4, '0')}</span>
                                <div className="w-full min-w-0 flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="number"
                                        value={manualInvoiceCount}
                                        onChange={(e) => setManualInvoiceCount(e.target.value)}
                                        className="w-full min-w-0 p-2 rounded-lg border border-border text-xs ring-0 outline-none focus:border-primary"
                                        style={{ background: 'var(--surface)', color: 'var(--text-main)' }}
                                        placeholder="Set Counter"
                                    />
                                    <button
                                        onClick={handleUpdateInvoiceCount}
                                        className="w-full sm:w-auto bg-primary text-white p-2 px-3 rounded-lg text-[10px] font-bold hover:opacity-90 transition-all shadow-sm whitespace-nowrap"
                                    >
                                        Update
                                    </button>
                                </div>
                            </div>
                            <p className="text-[9px] text-gray-400 mt-2 italic">Note: Manually changing this only affects future bills.</p>
                        </div>

                        <div className="p-4 rounded-xl border border-dashed border-primary/30 flex flex-col justify-between">
                            <div>
                                <h4 className="text-xs font-bold mb-1">Resequence History</h4>
                                <p className="text-[9px] text-gray-500 leading-relaxed">Fix gaps in bill numbers (INV-0001, INV-0002...) based on original sequence. Use with caution.</p>
                            </div>
                            <button
                                onClick={handleResequence}
                                disabled={isProcessing}
                                className="mt-3 w-full py-2 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg text-[10px] font-bold hover:bg-emerald-500 hover:text-white transition-all"
                            >
                                Run Resequence Utility
                            </button>
                        </div>
                    </div>
                </div>


                {/* Maintenance */}
                <div className="card p-6 space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3 mb-2">
                        <Shield className="text-purple-500" size={20} />
                        <h3 className="font-bold text-sm">Maintenance</h3>
                    </div>
                    <p className="text-xs text-gray-500">Utilities to clean up data and maintain consistency across records.</p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                            onClick={handleDeduplicate}
                            disabled={isProcessing}
                            className="flex flex-col items-center justify-center p-4 border rounded-xl hover:bg-purple-50 hover:border-purple-200 transition-all text-center"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <span className="text-xs font-bold text-purple-600 mb-1">Deduplicate</span>
                        </button>

                        <button
                            onClick={() => setIsRepairModalOpen(true)}
                            disabled={isProcessing}
                            className="flex flex-col items-center justify-center p-4 border rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all text-center"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <span className="text-xs font-bold text-indigo-600">Link History</span>
                        </button>

                        <button
                            onClick={handleMigrate}
                            disabled={isProcessing}
                            className="flex flex-col items-center justify-center p-4 border rounded-xl hover:bg-amber-50 hover:border-amber-200 transition-all text-center"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <span className="text-xs font-bold text-amber-600">Doc ID Migrator</span>
                        </button>

                        <button
                            onClick={handleSyncCustomers}
                            disabled={isProcessing}
                            className="flex flex-col items-center justify-center p-4 border rounded-xl hover:bg-emerald-50 hover:border-emerald-200 transition-all text-center"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <span className="text-xs font-bold text-emerald-600">Sync IDs</span>
                        </button>
                    </div>
                </div>

                {/* Dangerous Actions */}
                <div className="card p-6 space-y-4 border-red-100" style={{ background: 'var(--surface)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                    <div className="flex items-center gap-3 mb-2">
                        <AlertTriangle className="text-red-500" size={20} />
                        <h3 className="font-bold text-red-600">Dangerous Actions</h3>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Irreversible actions that modify or delete your entire workspace.</p>

                    <button
                        onClick={handleCleanWipe}
                        disabled={isProcessing}
                        className="w-full flex items-center justify-center p-4 border rounded-xl transition-all group"
                        style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                    >
                        <span className="text-xs font-bold">Clean Wipe Software</span>
                    </button>
                </div>
            </div>
            <div className="card p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Users className="text-primary" size={24} />
                        <div>
                            <h3 className="text-xl font-bold">Staff / Users</h3>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Access Management</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setEditingUserId(null);
                            setNewUserForm({ username: '', name: '', role: 'staff', password: '' });
                            setIsAddUserModalOpen(true);
                        }}
                        className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
                    >
                        <UserPlus size={16} /> Add Staff
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {usersList.length === 0 ? (
                        <div className="col-span-full py-12 text-center border-2 border-dashed rounded-2xl border-gray-100">
                            <Users size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400">No staff accounts found.</p>
                        </div>
                    ) : (
                        usersList.map((user) => (
                            <div key={user.id} className="p-4 border rounded-2xl flex items-center justify-between group hover:border-primary/30 transition-all" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/5 rounded-lg text-primary group-hover:bg-primary/10 transition-colors">
                                        <Users size={18} />
                                    </div>
                                    <div className="overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-sm truncate" style={{ color: 'var(--text-main)' }}>{user.name || user.username}</p>
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                                {user.role}
                                            </span>
                                        </div>
                                        <p className="text-[10px] opacity-60 truncate">@{user.username}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {user.role !== 'admin' && user.role !== 'dev_admin' && (
                                        <button
                                            onClick={() => openEditModal(user)}
                                            className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                        >
                                            <Edit size={16} />
                                        </button>
                                    )}
                                    {user.role !== 'admin' && user.role !== 'dev_admin' && (
                                        <button
                                            onClick={() => handleDeleteUser(user.id, user.role)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Add-ons & Plugins */}
            <div className="card p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3 mb-6">
                    <Puzzle className="text-primary" size={24} />
                    <h3 className="text-xl font-bold">Add-ons & Plugins</h3>
                </div>

                <div className="space-y-4">
                    {plugins.map((plugin) => (
                        <div key={plugin.id} className="flex flex-col border rounded-2xl hover:border-primary/30 transition-all overflow-hidden group" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl border transition-all ${plugin.enabled ? 'bg-primary/5 border-primary/20 shadow-sm' : 'bg-gray-50 border-gray-100'}`} style={{ borderColor: plugin.enabled ? 'var(--primary-light)' : 'var(--border)', background: plugin.enabled ? 'rgba(var(--primary-rgb), 0.05)' : 'var(--background)' }}>
                                        <plugin.icon size={24} className={plugin.enabled ? 'text-primary' : 'text-gray-400'} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{plugin.name}</h4>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${plugin.enabled ? 'bg-green-100 text-green-600' : 'bg-gray-100/50 text-gray-500'}`} style={{ background: plugin.enabled ? '' : 'var(--background)', borderColor: 'var(--border)', borderWidth: plugin.enabled ? 0 : 1 }}>
                                                {plugin.enabled ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] mt-0.5 leading-relaxed max-w-md" style={{ color: 'var(--text-muted)' }}>{plugin.description}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {plugin.enabled && (
                                        <button
                                            onClick={() => setManagingPlugin(plugin)}
                                            className="px-4 py-2 rounded-xl text-xs font-bold border transition-all"
                                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                                        >
                                            Configure
                                        </button>
                                    )}
                                    <button
                                        onClick={() => togglePlugin(plugin.id)}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${plugin.enabled ? '' : 'bg-primary text-white shadow-primary/20'}`}
                                        style={plugin.enabled ? { background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', borderWidth: '1px' } : {}}
                                    >
                                        {plugin.enabled ? 'Disable' : 'Enable'}
                                    </button>
                                </div>
                            </div>

                            {plugin.enabled && plugin.features && (
                                <div className="px-4 pb-4 flex flex-wrap gap-2">
                                    {plugin.features.map(f => (
                                        <span key={f} className="text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-tight border" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                                            • {f}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] text-gray-400 font-medium">Want a custom feature? Contact development at <a href="https://manas0x.site" className="text-primary hover:underline">manas0x.site</a></p>
                </div>
            </div>

            {/* Warning Box */}
            <div className="p-4 border rounded-xl flex items-start gap-3" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                <AlertTriangle className="text-red-500 shrink-0" size={20} />
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text-main)' }}>
                    <p className="font-bold mb-1 text-red-500 uppercase tracking-wider">Danger Zone</p>
                    <p style={{ color: 'var(--text-secondary)' }}>These features can modify or delete large amounts of data. Always download a fresh <b>JSON Backup</b> before performing imports or migrations.</p>
                </div>
            </div>

            {/* Plugin Settings Modal */}
            {managingPlugin && (
                <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-5 duration-300 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <managingPlugin.icon size={20} />
                                </div>
                                <h3 className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>{managingPlugin.name} Settings</h3>
                            </div>
                            <button onClick={() => setManagingPlugin(null)} className="p-2 hover:bg-black/5 rounded-lg transition-colors">
                                <X size={20} style={{ color: 'var(--text-muted)' }} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
                            {/* Render Settings based on managingPlugin.id */}
                            <div className="space-y-4">
                                {Object.keys(managingPlugin.settings).map((key) => {
                                    const value = managingPlugin.settings[key];
                                    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

                                    if (typeof value === 'boolean') {
                                        return (
                                            <div key={key} className="flex items-center justify-between p-4 border rounded-xl" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                                <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                                                <button
                                                    onClick={() => {
                                                        managingPlugin.settings[key] = !value;
                                                        setManagingPlugin({ ...managingPlugin });
                                                    }}
                                                    className={`w-12 h-6 rounded-full transition-all relative ${value ? 'bg-primary' : 'bg-gray-300'}`}
                                                >
                                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${value ? 'right-1' : 'left-1'}`} />
                                                </button>
                                            </div>
                                        );
                                    }

                                    if (key === 'coupons') {
                                        return (
                                            <div key={key} className="space-y-3">
                                                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Manage Coupons</label>
                                                <div className="space-y-2">
                                                    {(value || []).map((coupon, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-3 border rounded-xl bg-black/5" style={{ borderColor: 'var(--border)' }}>
                                                            <div>
                                                                <p className="font-bold text-xs">{coupon.code}</p>
                                                                <p className="text-[10px] opacity-60">
                                                                    {coupon.type === 'percentage' ? `${coupon.value}%` :
                                                                        coupon.type === 'atCost' ? 'At-Cost (No Profit)' :
                                                                            `Rs.${coupon.value}`} off (Min: Rs.${coupon.minBill})
                                                                </p>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    managingPlugin.settings.coupons = value.filter((_, i) => i !== idx);
                                                                    setManagingPlugin({ ...managingPlugin });
                                                                }}
                                                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        onClick={() => {
                                                            const code = prompt("Enter Coupon Code (e.g. ATCOST)");
                                                            if (!code) return;
                                                            const type = prompt("Type (flat / percentage / atCost)", "percentage");
                                                            if (type !== 'atCost' && type !== 'flat' && type !== 'percentage') return;

                                                            let val = 0;
                                                            if (type !== 'atCost') {
                                                                val = parseFloat(prompt("Discount Value", "10"));
                                                            }
                                                            const min = parseFloat(prompt("Minimum Bill Amount (Rs.)", "0"));

                                                            managingPlugin.settings.coupons = [
                                                                ...(value || []),
                                                                { code: code.toUpperCase(), type, value: val, minBill: min }
                                                            ];
                                                            setManagingPlugin({ ...managingPlugin });
                                                        }}
                                                        className="w-full py-2 border-2 border-dashed rounded-xl text-xs font-bold text-primary hover:bg-primary/5 transition-all"
                                                        style={{ borderColor: 'var(--primary-light)' }}
                                                    >
                                                        + Add New Coupon
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (key === 'seasonalRules') {
                                        return null; // Keep it hidden for now or add similar UI
                                    }

                                    if (key === 'accessToken' && managingPlugin.id === 'google-drive') {
                                        const isConnected = !!value && (!managingPlugin.settings.tokenExpiry || Date.now() < managingPlugin.settings.tokenExpiry);
                                        const backupEmail = managingPlugin.settings.backupEmail;

                                        return (
                                            <div key={key} className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Connection Status</label>
                                                    {isConnected && (
                                                        <button
                                                            onClick={() => {
                                                                if (confirm("Are you sure you want to disconnect Google Drive? Auto-backups will stop.")) {
                                                                    managingPlugin.settings.accessToken = '';
                                                                    managingPlugin.settings.tokenExpiry = null;
                                                                    managingPlugin.settings.backupEmail = '';
                                                                    setManagingPlugin({ ...managingPlugin });
                                                                    pluginLoader.saveStates();
                                                                    showSuccess("Google Drive Disconnected");
                                                                }
                                                            }}
                                                            className="text-[10px] font-bold text-red-500 hover:underline"
                                                        >
                                                            Disconnect / Remove Email
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="flex gap-2">
                                                    <div
                                                        className="flex-1 p-3 border rounded-xl text-sm flex items-center gap-2 overflow-hidden"
                                                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                                    >
                                                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                                                        <span className="truncate">
                                                            {isConnected ? (backupEmail || 'Connected') : 'Not Connected'}
                                                        </span>
                                                    </div>
                                                    {!isConnected && (
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    const { googleDriveService } = await import('../services/googleDriveService');
                                                                    const result = await googleDriveService.authenticate();
                                                                    managingPlugin.settings.accessToken = result.token;
                                                                    managingPlugin.settings.tokenExpiry = result.expiry;
                                                                    // Email will be updated on next login or we could try to fetch it here if service allowed
                                                                    setManagingPlugin({ ...managingPlugin });
                                                                    showSuccess("Google Drive Connected!");
                                                                } catch (err) {
                                                                    showError(err.message);
                                                                }
                                                            }}
                                                            className="px-6 rounded-xl text-xs font-bold transition-all bg-primary text-white hover:opacity-90"
                                                        >
                                                            Connect
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-500">
                                                    Last backup:{' '}
                                                    {managingPlugin.settings.lastBackup
                                                        ? new Date(managingPlugin.settings.lastBackup).toLocaleString('en-IN')
                                                        : 'Never'}
                                                </p>
                                                {managingPlugin.settings.tokenExpiry && (
                                                    <div className="flex flex-col gap-2 pt-2">
                                                        <p className="text-[9px] text-gray-400 pl-1">
                                                            Token expires: {new Date(managingPlugin.settings.tokenExpiry).toLocaleString()}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            disabled={isBackingUp}
                                                            onClick={async () => {
                                                                setIsBackingUp(true);
                                                                try {
                                                                    const { GoogleDrivePlugin } = await import('../plugins/google_drive.plugin');
                                                                    await GoogleDrivePlugin.performBackup(managingPlugin.settings, (newSettings) => {
                                                                        setManagingPlugin({ ...managingPlugin, settings: newSettings });
                                                                        // Update the main plugins list as well to persist
                                                                        setPlugins(prev => prev.map(p => p.id === 'google-drive' ? { ...p, settings: newSettings } : p));
                                                                    });
                                                                    showSuccess("Manual Backup Successful!");
                                                                } catch (err) {
                                                                    showError("Backup Failed: " + err.message);
                                                                } finally {
                                                                    setIsBackingUp(false);
                                                                }
                                                            }}
                                                            className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${isBackingUp ? 'bg-gray-100 text-gray-400' : 'bg-green-600 text-white hover:bg-green-700'}`}
                                                        >
                                                            {isBackingUp ? (
                                                                <>
                                                                    <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"></div>
                                                                    Backing up...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <HardDrive size={14} />
                                                                    Trigger Manual Backup
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }

                                    if (key === 'tokenExpiry' || key === 'backupEmail') return null;

                                    return (
                                        <div key={key} className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</label>
                                            <input
                                                type={typeof value === 'number' ? 'number' : 'text'}
                                                value={value ?? ''}
                                                onChange={(e) => {
                                                    managingPlugin.settings[key] = typeof value === 'number' ? Number(e.target.value) : e.target.value;
                                                    setManagingPlugin({ ...managingPlugin });
                                                }}
                                                className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-6 border-t flex gap-3" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                            <button
                                onClick={() => {
                                    pluginLoader.saveStates();
                                    showSuccess(`${managingPlugin.name} saved!`);
                                    setManagingPlugin(null);
                                }}
                                className="flex-1 bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
                            >
                                Save Changes
                            </button>
                            <button
                                onClick={() => setManagingPlugin(null)}
                                className="flex-1 border text-sm font-bold rounded-xl hover:bg-black/5 transition-all"
                                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add User Modal */}
            {isAddUserModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <UserPlus size={20} />
                                </div>
                                <h3 className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>{editingUserId ? 'Edit Profile' : 'Add Staff Member'}</h3>
                            </div>
                            <button onClick={() => { setIsAddUserModalOpen(false); setEditingUserId(null); }} className="p-2 hover:bg-black/5 rounded-lg transition-colors">
                                <X size={20} style={{ color: 'var(--text-muted)' }} />
                            </button>
                        </div>

                        <form onSubmit={handleAddUser}>
                            <div className="p-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Display Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Rahul Singh"
                                        value={newUserForm.name}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                        className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Username</label>
                                        <input
                                            type="text"
                                            placeholder="rahul_staff"
                                            value={newUserForm.username}
                                            onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                                            className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                            required={!editingUserId}
                                            disabled={!!editingUserId}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Password (Login)</label>
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            value={newUserForm.password}
                                            onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                            className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                            required={!editingUserId}
                                        />
                                    </div>
                                </div>

                                <div className="p-4 bg-orange-50/10 border border-orange-100 rounded-xl text-[10px] text-orange-600 leading-relaxed">
                                    <p className="font-bold mb-1">NOTE ON LOGIN ACCESS</p>
                                    <p>New staff accounts use the username for login. Passwords are never stored in Firestore. Editing a profile does not change its login password.</p>
                                </div>
                            </div>

                            <div className="p-6 border-t flex gap-3" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                <button
                                    type="submit"
                                    className="flex-1 bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
                                >
                                    {editingUserId ? 'Update Profile' : 'Create Access'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsAddUserModalOpen(false)}
                                    className="flex-1 border text-sm font-bold rounded-xl hover:bg-black/5 transition-all"
                                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* History Repair Modal */}
            {isRepairModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-600">
                                    <History size={20} />
                                </div>
                                <h3 className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>Manual History Linker</h3>
                            </div>
                            <button onClick={() => setIsRepairModalOpen(false)} className="p-2 hover:bg-black/5 rounded-lg transition-colors">
                                <X size={20} style={{ color: 'var(--text-muted)' }} />
                            </button>
                        </div>

                        <form onSubmit={handleRepairHistory}>
                            <div className="p-6 space-y-6">
                                <div className="p-4 bg-indigo-50/10 border border-indigo-100 rounded-xl text-[10px] text-indigo-600 leading-relaxed">
                                    <p className="font-bold mb-1">REPAIR ORPHANED INVOICES</p>
                                    <p>If you renamed a customer or deleted a duplicate profile, use this to move bills from their <b>Old Name</b> to the <b>New/Existing Name</b>.</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted">Move Bills From (Old Name)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Cash"
                                            value={repairForm.oldName}
                                            onChange={(e) => setRepairForm({ ...repairForm, oldName: e.target.value })}
                                            className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted">To New Profile (Target Name)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Cash Sale"
                                            value={repairForm.targetName}
                                            onChange={(e) => setRepairForm({ ...repairForm, targetName: e.target.value })}
                                            className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t flex gap-3" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                <button
                                    type="submit"
                                    disabled={isProcessing}
                                    className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:opacity-90 active:scale-[0.98] transition-all"
                                >
                                    {isProcessing ? 'Migrating...' : 'Migrate History'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsRepairModalOpen(false)}
                                    className="flex-1 border text-sm font-bold rounded-xl hover:bg-black/5 transition-all"
                                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};


export default AdminSettings;
