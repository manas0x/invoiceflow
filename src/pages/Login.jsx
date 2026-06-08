import React, { useState } from 'react'
import { auth, db } from '../firebase'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { ShieldCheck, User, Lock, ExternalLink, Activity, Info, Package, Mail, Loader2, UtensilsCrossed, ShoppingBag, Pill, Store } from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { signInWithEmailAndPassword, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth'

const Login = ({ onLogin }) => {
    const business = useBusiness();
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [isChecking, setIsChecking] = useState(true)
    const [storageRestricted, setStorageRestricted] = useState(false)

    const processingAuth = React.useRef(false);
    const isManualLogin = React.useRef(false);

    // Handle Google session on Mount
    React.useEffect(() => {
        let unsubAuth = null;
        let isModuleMounted = true;
        let timeoutId = null;

        const checkAuthStatus = async () => {
            try {
                // Safety timeout (5s) to reveal login form if Firebase is silent
                timeoutId = setTimeout(() => {
                    if (isModuleMounted && !processingAuth.current) {
                        setIsChecking(false);
                    }
                }, 5000);

                unsubAuth = onAuthStateChanged(auth, async (user) => {
                    if (!isModuleMounted) return;
                    
                    if (isManualLogin.current) return;

                    if (user && !processingAuth.current) {
                        if (timeoutId) clearTimeout(timeoutId);
                        await handleAuthSuccess(user);
                    } else if (!user) {
                        if (timeoutId) clearTimeout(timeoutId);
                        setIsChecking(false);
                    }
                });

            } catch (err) {
                if (isModuleMounted) {
                    setError("Login failed: " + err.message);
                    setIsChecking(false);
                }
            }
        };

        checkAuthStatus();

        return () => {
            isModuleMounted = false;
            if (unsubAuth) unsubAuth();
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, []);

    const handleAuthSuccess = async (firebaseUser, credential = null) => {
        if (processingAuth.current) return;
        processingAuth.current = true;
        setLoading(true);
        setIsChecking(true); // Keep loader visible during profile fetch

        try {
            const accessToken = credential?.accessToken;

            // Fetch role from Firestore by email
            const { firestoreService } = await import('../services/firestoreService');
            console.log(`Login: Fetching profile for ${firebaseUser.email}...`);
            const appUser = await firestoreService.getUserByEmail(firebaseUser.email);

            if (appUser) {
                console.log("Login: Profile found. Saving session...");
                const sessionData = {
                    ...appUser,
                    loginTime: Date.now(),
                    googleAccessToken: accessToken || localStorage.getItem('google_access_token') // Reuse if possible
                };
                
                if (accessToken) {
                    localStorage.setItem('google_access_token', accessToken);
                }

                localStorage.setItem('invoiceflow_user', JSON.stringify(sessionData));
                onLogin(sessionData);

                // Update plugin settings
                const { pluginLoader: loader } = await import('../pluginLoader');
                const drivePlugin = loader.getPlugin('google-drive');
                if (drivePlugin) {
                    drivePlugin.settings.backupEmail = firebaseUser.email;
                    loader.saveStates();
                }

                // Trigger Auto-Backup logic (omitted for brevity, assume handled similarly)
                // ... (existing auto-backup logic)
                if (firebaseUser.email !== 'admin@manas0x.site') {
                    const plugin = loader.getPlugin('google-drive');
                    if (plugin && plugin.enabled && plugin.settings.autoBackup) {
                        const now = new Date();
                        const last = plugin.settings.lastBackup ? new Date(plugin.settings.lastBackup) : null;
                        const diffDays = last ? (now - last) / (1000 * 60 * 60 * 24) : 999;
                        if (diffDays >= (plugin.settings.backupFrequency || 1)) {
                            const currentToken = accessToken || localStorage.getItem('google_access_token');
                            
                            // Only attempt auto-backup if we actually have a token.
                            // Tokens are not persistent across page reloads in Firebase Auth by default.
                            if (currentToken) {
                                setTimeout(async () => {
                                    try {
                                        const { GoogleDrivePlugin } = await import('../plugins/google_drive.plugin');
                                        await GoogleDrivePlugin.performBackup({
                                            ...plugin.settings,
                                            accessToken: currentToken,
                                            isFromSession: true
                                        }, (newSettings) => {
                                            plugin.settings = newSettings;
                                            loader.saveStates();
                                        });
                                    } catch (e) { 
                                        // Silent warning for token errors during auto-sessions
                                        if (e.message?.includes('Token required')) {
                                            console.log("Login: Auto-backup skipped (Token not available for this session)");
                                        } else {
                                            console.error("Auto-backup failed", e); 
                                        }
                                    }
                                }, 1000);
                            } else {
                                console.log("Login: Auto-backup pending (Google account re-auth required for Drive access)");
                            }
                        }
                    }
                }
            } else {
                console.warn(`Login: No profile for ${firebaseUser.email}`);
                setError(`Google Login successful, but no user profile found for ${firebaseUser.email}. Please contact the administrator.`);
                setIsChecking(false);
            }
        } catch (err) {
            console.error("Auth processing failed:", err);
            setError('Profile sync failed: ' + err.message);
            setIsChecking(false);
        } finally {
            setLoading(false);
            processingAuth.current = false;
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            // 1. Authenticate with Firebase Auth
            // If user enters "admin", treat as "admin@manas0x.site"
            const email = username.includes('@') ? username : `${username}@manas0x.site`

            const userCredential = await signInWithEmailAndPassword(auth, email, password)
            const firebaseUser = userCredential.user

            // 2. Fetch User Details (Role) from Firestore
            const usersRef = collection(db, 'users')

            // Try fetching by Auth UID first (Best Practice)
            let appUser = null
            try {
                const userDocRef = doc(db, 'users', firebaseUser.uid)
                const userDocSnap = await getDoc(userDocRef)
                if (userDocSnap.exists()) {
                    appUser = { id: userDocSnap.id, ...userDocSnap.data() }
                }
            } catch (ignore) {
                // Ignore errors here, fallback to query
            }

            if (!appUser) {
                // Fallback: Query by username (e.g. 'admin')
                // 1. Try Exact Match
                let q = query(usersRef, where('username', '==', username))
                let querySnapshot = await getDocs(q)

                // 2. Try Clean Name (if email)
                if (querySnapshot.empty && username.includes('@')) {
                    const cleanName = username.split('@')[0]
                    q = query(usersRef, where('username', '==', cleanName))
                    querySnapshot = await getDocs(q)
                }

                // 3. Try Lowercase
                if (querySnapshot.empty) {
                    q = query(usersRef, where('username', '==', username.toLowerCase()))
                    querySnapshot = await getDocs(q)
                }

                // 4. Try Uppercase
                if (querySnapshot.empty) {
                    q = query(usersRef, where('username', '==', username.toUpperCase()))
                    querySnapshot = await getDocs(q)
                }

                if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0]
                    appUser = { id: doc.id, ...doc.data() }
                }
            } else {
                // Fallback: If no Firestore doc exists, assume Admin role for this special email or handle as error
                // For now, let's create a minimal session based on Auth info
                console.warn("No Firestore profile found for this user. Using default admin role if email matches.")
                if (email === 'admin@manas0x.site') {
                    appUser = { id: firebaseUser.uid, username: 'admin', role: 'admin', name: 'Administrator' }
                }
            }

            if (appUser) {
                // Save session in localStorage (simulating persistence) with 2-day expiry tracking
                const sessionData = { ...appUser, loginTime: Date.now() }
                localStorage.setItem('invoiceflow_user', JSON.stringify(sessionData))
                onLogin(sessionData)
            } else {
                setError(`Login successful (UID: ${firebaseUser.uid}), but no user profile found for '${username}'.`)
                // Optional: auth.signOut() here
            }

        } catch (err) {
            console.error(err)
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError('Invalid username or password.')
            } else {
                setError('Login failed: ' + err.message)
            }
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError('');
        isManualLogin.current = true;
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        provider.setCustomParameters({ prompt: 'select_account' });
        
        try {
            const result = await signInWithPopup(auth, provider);
            if (result) {
                await handleAuthSuccess(result.user, GoogleAuthProvider.credentialFromResult(result));
            }
        } catch (err) {
            if (err.code === 'auth/popup-blocked') {
                setError("Login popup was blocked by your browser. Please allow popups and try again.");
            } else if (err.code === 'auth/popup-closed-by-user') {
                // User closed popup
            } else {
                setError("Google Login failed: " + err.message);
            }
            setLoading(false);
        } finally {
            isManualLogin.current = false;
        }
    }

    if (isChecking) {
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-background">
                <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
                <p className="text-sm font-bold text-muted animate-pulse">Verifying authentication...</p>
            </div>
        )
    }

    return (
        <div className="login-container">
            <div className="login-card animate-fade-in">
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        background: 'var(--primary)',
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px'
                    }}>
                        {business.businessMode === 'restaurant' ? <UtensilsCrossed size={32} color="white" /> : 
                         business.businessMode === 'grocery' ? <ShoppingBag size={32} color="white" /> :
                         business.businessMode === 'pharmacy' ? <Pill size={32} color="white" /> :
                         <Store size={32} color="white" />}
                    </div>
                    <h2 style={{ fontSize: '24px', color: 'var(--text-main)' }}>Welcome Back</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Login to {business.appName}</p>
                </div>

                {storageRestricted && (
                    <div style={{
                        background: 'rgba(234, 67, 53, 0.05)',
                        color: 'var(--danger)',
                        padding: '12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        marginBottom: '20px',
                        border: '1px solid var(--danger)',
                        lineHeight: '1.4'
                    }}>
                        <p className="font-bold mb-1">⚠️ Storage Restricted</p>
                        <p>Google Login might fail because this browser window is blocking storage (common in <b>Incognito</b> or <b>Internal Previews</b>). Please use a standard Chrome or Safari window.</p>
                    </div>
                )}

                {error && (
                    <div style={{
                        background: 'var(--surface)',
                        color: 'var(--danger)',
                        padding: '12px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        marginBottom: '20px',
                        border: '1px solid var(--danger)'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Username</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                style={{ paddingLeft: '40px' }}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ paddingLeft: '40px' }}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
                    </button>
                    <div style={{ margin: '20px 0', textAlign: 'center', position: 'relative' }}>
                        <div style={{ borderTop: '1px solid var(--border)', position: 'absolute', top: '50%', width: '100%' }}></div>
                        <span style={{ background: 'var(--background)', color: 'var(--text-muted)', fontSize: '10px', padding: '0 10px', position: 'relative', textTransform: 'uppercase', tracking: '1px' }}>Or continue with</span>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="btn-outline"
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign in with Google'}
                    </button>
                </form>

                <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Administrator manages roles and permissions.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default Login
