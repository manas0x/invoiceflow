import React, { useState } from 'react';
import { Database, Shield, Lock, Unlock, CheckCircle, Database as DatabaseIcon, AlertTriangle, Puzzle, Globe, BarChart, Zap, X, Users, UserPlus, Trash2, HardDrive, Edit, History, Store } from 'lucide-react';
import { pluginLoader } from '../pluginLoader';
import { firestoreService } from '../services/firestoreService';
import { showSuccess, showError } from '../utils/alert';
import { auth } from '../firebase';
import { useBusiness } from '../context/BusinessContext';

const AdminSettings = ({ setActiveTab }) => {
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
        password: '',
        email: ''
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
    const business = useBusiness();
    const [businessProfile, setBusinessProfile] = React.useState({
        shopName: '',
        businessType: 'retail',
        address: '',
        phone: '',
        gstNumber: '',
        currency: '₹',
        timezone: 'Asia/Kolkata',
        theme: 'emerald'
    });

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
                    const storeData = await firestoreService.getAppSettings('store_info');
                    if (storeData) {
                        setBusinessProfile(prev => ({ ...prev, ...storeData }));
                    }

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

    const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_SETTINGS_PASSWORD;

    const handleSaveProfile = async () => {
        setIsProcessing(true);
        try {
            await firestoreService.updateAppSettings('store_info', businessProfile);
            showSuccess("Business Profile updated successfully!");
        } catch (err) {
            showError("Failed to update profile: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUnlock = (e) => {
        e.preventDefault();
        if (password === ADMIN_PASSWORD) {
            setIsUnlocked(true);
            showSuccess("Admin Settings Unlocked");
        } else {
            showError("Incorrect Password");
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
            downloadAnchorNode.setAttribute("download", `${business.appName}_Backup_${date}.json`);
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

    const ROLES = [
        { id: 'admin', name: 'Admin', desc: 'Full Access' },
        { id: 'manager', name: 'Manager', desc: 'Operational Access' },
        { id: 'cashier', name: 'Cashier', desc: 'Billing Only' },
        { id: 'waiter', name: 'Waiter', desc: 'Orders & Tables', type: 'restaurant' },
        { id: 'kitchen', name: 'Kitchen', desc: 'KDS View Only', type: 'restaurant' }
    ];

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            await firestoreService.addUser({
                ...newUserForm,
                id: editingUserId || newUserForm.username.trim().toLowerCase(),
                createdAt: newUserForm.createdAt || new Date().toISOString()
            });
            showSuccess(`User ${newUserForm.username} ${editingUserId ? 'updated' : 'added'}!`);
            setNewUserForm({ username: '', name: '', role: 'staff', password: '', email: '' });
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
            password: user.password || '',
            email: user.email || '',
            createdAt: user.createdAt
        });
        setEditingUserId(user.id);
        setIsAddUserModalOpen(true);
    };

    const handleDeleteUser = async (id, role) => {
        if (role === 'admin') {
            showError("Administrators cannot be removed here.");
            return;
        }
        if (!window.confirm("Revoke access for this user?")) return;
        try {
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
                                placeholder="Admin Password"
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Business Profile */}
                <div className="card p-6 space-y-4 md:col-span-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Store className="text-primary" size={20} />
                            <h3 className="font-bold">Business Profile</h3>
                        </div>
                        <button
                            onClick={handleSaveProfile}
                            disabled={isProcessing}
                            className="bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
                        >
                            {isProcessing ? 'Saving...' : 'Update Profile'}
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Business Name</label>
                            <input 
                                type="text" 
                                value={businessProfile.shopName} 
                                onChange={e => setBusinessProfile({...businessProfile, shopName: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-border bg-background text-xs font-semibold"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Business Type</label>
                            <select 
                                value={businessProfile.businessType} 
                                onChange={e => setBusinessProfile({...businessProfile, businessType: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-border bg-background text-xs font-semibold"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            >
                                <option value="restaurant">Restaurant / QSR</option>
                                <option value="retail">General Retail</option>
                                <option value="pharmacy">Pharmacy</option>
                                <option value="grocery">Grocery Store</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">GSTIN</label>
                            <input 
                                type="text" 
                                value={businessProfile.gstNumber} 
                                onChange={e => setBusinessProfile({...businessProfile, gstNumber: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-border bg-background text-xs font-semibold"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Currency</label>
                            <input 
                                type="text" 
                                value={businessProfile.currency} 
                                onChange={e => setBusinessProfile({...businessProfile, currency: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-border bg-background text-xs font-semibold text-center"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Address</label>
                            <input 
                                type="text" 
                                value={businessProfile.address} 
                                onChange={e => setBusinessProfile({...businessProfile, address: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-border bg-background text-xs font-semibold"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Phone</label>
                            <input 
                                type="text" 
                                value={businessProfile.phone} 
                                onChange={e => setBusinessProfile({...businessProfile, phone: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-border bg-background text-xs font-semibold"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Timezone</label>
                            <select 
                                value={businessProfile.timezone} 
                                onChange={e => setBusinessProfile({...businessProfile, timezone: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-border bg-background text-xs font-semibold"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            >
                                <option value="Asia/Kolkata">IST (UTC+5:30)</option>
                                <option value="UTC">UTC</option>
                                <option value="America/New_York">EST (UTC-5:00)</option>
                            </select>
                        </div>
                    </div>
                </div>

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
                                        if (!auth.currentUser) {
                                            showError("Firebase Session not ready. Please wait a moment or re-login.");
                                            return;
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
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-primary bg-primary/10 px-3 py-2 rounded-lg">INV-{(invoiceCount + 1).toString().padStart(4, '0')}</span>
                                <div className="flex-1 flex gap-2">
                                    <input
                                        type="number"
                                        value={manualInvoiceCount}
                                        onChange={(e) => setManualInvoiceCount(e.target.value)}
                                        className="w-full p-2 rounded-lg border border-border text-xs ring-0 outline-none focus:border-primary"
                                        style={{ background: 'var(--surface)', color: 'var(--text-main)' }}
                                        placeholder="Set Counter"
                                    />
                                    <button
                                        onClick={handleUpdateInvoiceCount}
                                        className="bg-primary text-white p-2 px-3 rounded-lg text-[10px] font-bold hover:opacity-90 transition-all shadow-sm"
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
                            setNewUserForm({ username: '', name: '', role: 'staff', password: '', email: '' });
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
                                    <button
                                        onClick={() => openEditModal(user)}
                                        className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    {user.role !== 'admin' && (
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
                                                                            `${business.currency}${coupon.value}`} off (Min: ${business.currency}${coupon.minBill})
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
                                                            const min = parseFloat(prompt(`Minimum Bill Amount (${business.currency})`, "0"));

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
                                            required
                                            disabled={!!editingUserId}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Password (Login)</label>
                                        <input
                                            type="text"
                                            placeholder="••••••••"
                                            value={newUserForm.password}
                                            onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                            className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Role</label>
                                        <select
                                            value={newUserForm.role}
                                            onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                                            className="w-full p-3 border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                            required
                                        >
                                            {ROLES.filter(r => !r.type || r.type === business.businessMode).map(role => (
                                                <option key={role.id} value={role.id}>{role.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Google Email (Optional)</label>
                                        <input
                                            type="email"
                                            placeholder="user@gmail.com"
                                            value={newUserForm.email}
                                            onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                            className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                        />
                                    </div>
                                </div>

                                <div className="p-4 bg-orange-50/10 border border-orange-100 rounded-xl text-[10px] text-orange-600 leading-relaxed">
                                    <p className="font-bold mb-1">NOTE ON LOGIN ACCESS</p>
                                    <p>Adding a staff profile here creates their record. <b>They must also be added manually to Firebase Authentication</b> with the email <code>username@manas0x.site</code> and the password specified above to be able to log in.</p>
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
