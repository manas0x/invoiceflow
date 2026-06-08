import React, { useState } from 'react';
import { firestoreService } from '../services/firestoreService';
import { 
    Store, UtensilsCrossed, ShoppingBag, Pill, CheckCircle2, ChevronRight, ChevronLeft, 
    Palette, Layout, Smartphone, Ticket, Users, UserPlus, Shield, Loader2, Link2, MonitorPlay, Package, AlertTriangle
} from 'lucide-react';
import { showSuccess, showError } from '../utils/alert';

const BUSINESS_TYPES = [
    { id: 'restaurant', name: 'Restaurant / QSR', icon: UtensilsCrossed, desc: 'F&B, Dine-in, Takeaway, KDS' },
    { id: 'grocery', name: 'Grocery Store', icon: ShoppingBag, desc: 'Daily needs, Supermarkets, Kirana' },
    { id: 'pharmacy', name: 'Pharmacy', icon: Pill, desc: 'Medical stores, Batch tracking, Expiry' },
    { id: 'retail', name: 'General Retail', icon: Store, desc: 'Apparel, Electronics, Custom retail' }
];

const THEMES = [
    { id: 'slate', name: 'Black & White', color: 'bg-slate-900', text: 'Classic Professional' },
    { id: 'emerald', name: 'Emerald Green', color: 'bg-green-600', text: 'Growth & Eco' },
    { id: 'blue', name: 'Ocean Blue', color: 'bg-blue-600', text: 'Trust & Reliability' },
    { id: 'dark', name: 'Dark Mode', color: 'bg-gray-900', text: 'Sleek & Modern' },
    { id: 'corporate', name: 'Corporate', color: 'bg-indigo-900', text: 'Standard Business' },
    { id: 'modern', name: 'Modern Pink', color: 'bg-pink-500', text: 'Vibrant & Trendy' }
];

const INTEGRATIONS = [
    { id: 'self_ordering', name: 'QR Self Ordering', icon: Smartphone, desc: 'Let customers scan and order directly from tables or kiosks.', types: ['restaurant'] },
    { id: 'kds', name: 'Kitchen Display (KDS)', icon: MonitorPlay, desc: 'Live screen for kitchen staff to track and complete orders.', types: ['restaurant'] },
    { id: 'inventory', name: 'Advanced Inventory', icon: Package, desc: 'Supplier management, purchase entries, and stock tracking.', types: ['retail', 'grocery', 'pharmacy'] },
    { id: 'batch_tracking', name: 'Batch & Expiry', icon: AlertTriangle, desc: 'Track medicine batches and expiry dates.', types: ['pharmacy'] },
    { id: 'zomato_swiggy', name: 'Delivery Sync', icon: Link2, desc: 'Pull Zomato & Swiggy orders directly.', types: ['restaurant'] },
    { id: 'coupons', name: 'Discounts & Coupons', icon: Ticket, desc: 'Create promotional campaigns.', types: ['retail', 'grocery', 'restaurant'] }
];

export default function InstallPage({ onComplete }) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    
    // Global Config State
    const [config, setConfig] = useState({
        businessName: '',
        phone: '',
        address: '',
        businessType: '',
        gstNumber: '',
        currency: '₹',
        timezone: 'Asia/Kolkata',
        theme: 'emerald',
        integrations: [],
        users: [
            { username: 'admin', password: '', role: 'admin' }
        ]
    });

    const updateConfig = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));
    
    const toggleIntegration = (id) => {
        const current = config.integrations;
        updateConfig('integrations', current.includes(id) ? current.filter(i => i !== id) : [...current, id]);
    };

    const handleUserChange = (index, field, value) => {
        const newUsers = [...config.users];
        newUsers[index][field] = value;
        updateConfig('users', newUsers);
    };

    const addUser = () => {
        updateConfig('users', [...config.users, { username: '', password: '', role: 'staff' }]);
    };

    const ROLES = [
        { id: 'admin', name: 'Admin', desc: 'Full Access' },
        { id: 'manager', name: 'Manager', desc: 'Operational Access' },
        { id: 'cashier', name: 'Cashier', desc: 'Billing Only' },
        { id: 'waiter', name: 'Waiter', desc: 'Orders & Tables', type: 'restaurant' },
        { id: 'kitchen', name: 'Kitchen', desc: 'KDS View Only', type: 'restaurant' }
    ];
    
    const removeUser = (index) => {
        if(index === 0) return; // Cannot remove primary admin
        updateConfig('users', config.users.filter((_, i) => i !== index));
    };

    const nextStep = () => {
        if(step === 1 && (!config.businessName || !config.phone || !config.businessType)) {
            return showError('Please fill all required business details.');
        }
        if(step === 4 && config.users.some(u => !u.username || !u.password)) {
            return showError('Please complete all user credentials.');
        }
        setStep(s => s + 1);
    };

    const handleInstall = async () => {
        setLoading(true);
        try {
            const storeInfo = {
                shopName: config.businessName,
                phone: config.phone,
                address: config.address,
                businessType: config.businessType,
                gstNumber: config.gstNumber,
                currency: config.currency,
                timezone: config.timezone,
                theme: config.theme,
                activeIntegrations: config.integrations,
                setupCompleted: true,
                installedAt: new Date().toISOString()
            };
            
            // Save settings to firestore
            await firestoreService.updateAppSettings('store_info', storeInfo);
            
            // Create Users
            for (const user of config.users) {
                if(user.username && user.password) {
                    await firestoreService.addUser({
                        id: user.username.toLowerCase(),
                        username: user.username,
                        password: user.password,
                        role: user.role,
                        createdAt: new Date().toISOString()
                    });
                }
            }
            
            // Local Storage Persistence
            localStorage.setItem('invoiceflow_setup', 'true');
            localStorage.setItem('invoiceflow_store_info', JSON.stringify(storeInfo));
            
            showSuccess('System successfully initialized!');
            onComplete();
        } catch (err) {
            showError('Installation failed: ' + err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
            <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[700px]">
                
                {/* Left Sidebar / Progress */}
                <div className="md:w-1/3 bg-slate-900 p-8 text-white flex flex-col">
                    <div className="mb-12">
                        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
                            <Layout className="text-blue-500" /> InvoiceFlow
                        </h1>
                        <p className="text-slate-400 mt-2 text-sm font-medium">Enterprise Setup Wizard</p>
                    </div>

                    <div className="space-y-8 flex-1">
                        {[
                            { s: 1, title: 'Business Profile', desc: 'Name, Type & Identity' },
                            { s: 2, title: 'Appearance', desc: 'System Theme & Colors' },
                            { s: 3, title: 'Modules', desc: 'Integrations & Features' },
                            { s: 4, title: 'Staff Setup', desc: 'Admins & Employees' },
                            { s: 5, title: 'Ready', desc: 'Finalize Installation' }
                        ].map((item) => (
                            <div key={item.s} className={`flex items-start gap-4 transition-all duration-300 ${step === item.s ? 'opacity-100' : (step > item.s ? 'opacity-50' : 'opacity-30')}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${step >= item.s ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                    {step > item.s ? <CheckCircle2 size={16} /> : item.s}
                                </div>
                                <div>
                                    <h3 className={`font-bold ${step === item.s ? 'text-white' : 'text-slate-300'}`}>{item.title}</h3>
                                    <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Content Area */}
                <div className="md:w-2/3 p-8 md:p-12 flex flex-col h-full bg-white relative">
                    
                    {/* STEP 1: BUSINESS PROFILE */}
                    {step === 1 && (
                        <div className="animate-fade-in flex-1">
                            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">What kind of business is this?</h2>
                            <p className="text-gray-500 mb-8 text-sm">Select your industry so we can tailor the POS experience for you.</p>
                            
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                {BUSINESS_TYPES.map(type => {
                                    const Icon = type.icon;
                                    const active = config.businessType === type.id;
                                    return (
                                        <div 
                                            key={type.id} 
                                            onClick={() => updateConfig('businessType', type.id)}
                                            className={`cursor-pointer border-2 rounded-2xl p-4 transition-all duration-200 ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            <Icon size={28} className={`mb-3 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                                            <h3 className={`font-bold ${active ? 'text-blue-900' : 'text-gray-700'}`}>{type.name}</h3>
                                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{type.desc}</p>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Business Name *</label>
                                        <input type="text" value={config.businessName} onChange={e => updateConfig('businessName', e.target.value)} placeholder="e.g. ABC Restaurant" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">GSTIN (Optional)</label>
                                        <input type="text" value={config.gstNumber} onChange={e => updateConfig('gstNumber', e.target.value)} placeholder="GST Number" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Phone *</label>
                                        <input type="tel" value={config.phone} onChange={e => updateConfig('phone', e.target.value)} placeholder="10-digit number" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Address</label>
                                        <input type="text" value={config.address} onChange={e => updateConfig('address', e.target.value)} placeholder="City, Area" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Currency</label>
                                        <select value={config.currency} onChange={e => updateConfig('currency', e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                                            <option value="₹">INR (₹)</option>
                                            <option value="$">USD ($)</option>
                                            <option value="€">EUR (€)</option>
                                            <option value="£">GBP (£)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Timezone</label>
                                        <select value={config.timezone} onChange={e => updateConfig('timezone', e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                                            <option value="Asia/Kolkata">IST (UTC+5:30)</option>
                                            <option value="UTC">UTC</option>
                                            <option value="America/New_York">EST (UTC-5:00)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: THEME */}
                    {step === 2 && (
                        <div className="animate-fade-in flex-1">
                            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Choose your aesthetic</h2>
                            <p className="text-gray-500 mb-8 text-sm">Select a UI theme that matches your brand identity.</p>
                            
                            <div className="grid grid-cols-2 gap-5">
                                {THEMES.map(theme => {
                                    const active = config.theme === theme.id;
                                    return (
                                        <div 
                                            key={theme.id}
                                            onClick={() => updateConfig('theme', theme.id)}
                                            className={`cursor-pointer rounded-2xl border-2 p-1 transition-all ${active ? 'border-blue-500 shadow-md' : 'border-transparent hover:border-gray-200'}`}
                                        >
                                            <div className={`${theme.color} h-24 rounded-xl flex items-center justify-center mb-3 shadow-inner`}>
                                                <Palette className="text-white/50" size={32} />
                                            </div>
                                            <div className="px-2 pb-2 text-center">
                                                <h3 className="font-bold text-gray-800">{theme.name}</h3>
                                                <p className="text-xs text-gray-500 mt-1">{theme.text}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: INTEGRATIONS */}
                    {step === 3 && (
                        <div className="animate-fade-in flex-1">
                            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Power-up your POS</h2>
                            <p className="text-gray-500 mb-8 text-sm">Enable the modules you need. We've suggested some based on your industry.</p>
                            
                            <div className="space-y-4">
                                {INTEGRATIONS.filter(mod => !mod.types || mod.types.includes(config.businessType)).map(mod => {
                                    const Icon = mod.icon;
                                    const active = config.integrations.includes(mod.id);
                                    return (
                                        <div 
                                            key={mod.id}
                                            onClick={() => toggleIntegration(mod.id)}
                                            className={`cursor-pointer border-2 rounded-2xl p-4 flex items-center gap-4 transition-all ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
                                        >
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                <Icon size={22} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-gray-900 text-sm">{mod.name}</h3>
                                                <p className="text-xs text-gray-500 mt-1">{mod.desc}</p>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${active ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                                                {active && <CheckCircle2 size={14} className="text-white" />}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: USERS */}
                    {step === 4 && (
                        <div className="animate-fade-in flex-1 flex flex-col">
                            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Staff & Access</h2>
                            <p className="text-gray-500 mb-6 text-sm">Create credentials for your team. The first account must be an Admin.</p>
                            
                            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                                {config.users.map((user, idx) => (
                                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 relative">
                                        {idx !== 0 && (
                                            <button onClick={() => removeUser(idx)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 text-xs font-bold">Remove</button>
                                        )}
                                        <div className="flex items-center gap-2 mb-4">
                                            {user.role === 'admin' ? <Shield size={16} className="text-blue-600"/> : <Users size={16} className="text-gray-500"/>}
                                            <select 
                                                value={user.role} 
                                                onChange={e => handleUserChange(idx, 'role', e.target.value)}
                                                className="bg-transparent font-bold text-gray-700 text-sm capitalize outline-none border-b border-transparent focus:border-blue-500"
                                            >
                                                {ROLES.filter(r => !r.type || r.type === config.businessType).map(role => (
                                                    <option key={role.id} value={role.id}>{role.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Username</label>
                                                <input type="text" value={user.username} onChange={e => handleUserChange(idx, 'username', e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. john_doe" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Password</label>
                                                <input type="password" value={user.password} onChange={e => handleUserChange(idx, 'password', e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button onClick={addUser} className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 text-gray-500 font-bold rounded-2xl flex justify-center items-center gap-2 hover:border-blue-400 hover:text-blue-600 transition-colors">
                                <UserPlus size={18} /> Add Staff Member
                            </button>
                        </div>
                    )}

                    {/* STEP 5: FINAL */}
                    {step === 5 && (
                        <div className="animate-fade-in flex-1 flex flex-col items-center justify-center text-center">
                            <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                <CheckCircle2 size={48} />
                            </div>
                            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">You're all set!</h2>
                            <p className="text-gray-500 mb-8 max-w-sm">
                                InvoiceFlow will now be configured as a <strong>{BUSINESS_TYPES.find(t=>t.id===config.businessType)?.name}</strong> system 
                                with <strong>{config.integrations.length}</strong> active modules.
                            </p>

                            <div className="bg-gray-50 border border-gray-200 rounded-2xl w-full max-w-md p-6 text-left">
                                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Store size={18}/> Summary</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between border-b border-gray-200 pb-2">
                                        <span className="text-gray-500">Business Name</span>
                                        <span className="font-bold text-gray-900">{config.businessName}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-200 pb-2">
                                        <span className="text-gray-500">Accounts Created</span>
                                        <span className="font-bold text-gray-900">{config.users.length} Users</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Modules Active</span>
                                        <span className="font-bold text-gray-900 text-right w-1/2 line-clamp-1">{config.integrations.join(', ') || 'None'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Navigation Footer */}
                    <div className="pt-8 mt-auto flex justify-between items-center border-t border-gray-100">
                        {step > 1 ? (
                            <button onClick={() => setStep(s => s - 1)} disabled={loading} className="px-6 py-3 text-gray-500 font-bold hover:text-gray-900 transition-colors flex items-center gap-2 disabled:opacity-50">
                                <ChevronLeft size={20} /> Back
                            </button>
                        ) : <div></div>}
                        
                        {step < 5 ? (
                            <button onClick={nextStep} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">
                                Continue <ChevronRight size={20} />
                            </button>
                        ) : (
                            <button onClick={handleInstall} disabled={loading} className="px-10 py-3.5 bg-blue-600 text-white rounded-xl font-extrabold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/30 disabled:opacity-70">
                                {loading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                                {loading ? 'Installing System...' : 'Launch POS System'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <style>{`
                .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}
