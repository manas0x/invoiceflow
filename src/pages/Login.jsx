import React, { useState } from 'react'
import { auth, db } from '../firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { Package, Lock, Mail, Loader2 } from 'lucide-react'

const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            // Fetch all users to verify credentials (case-insensitive username)
            const usersRef = collection(db, 'users')
            const querySnapshot = await getDocs(usersRef)

            let matchedUser = null

            querySnapshot.docs.forEach(doc => {
                const data = doc.data()
                // Check if username matches (diffeent casing allowed) AND password matches (exact)
                if (data.username && data.username.toLowerCase() === username.toLowerCase().trim() &&
                    data.password === password) {
                    matchedUser = { id: doc.id, ...data }
                }
            })

            if (matchedUser) {
                // Save session in localStorage (simulating persistence)
                localStorage.setItem('invoiceflow_user', JSON.stringify(matchedUser))
                onLogin(matchedUser)
            } else {
                setError('Invalid username or password. Please try again.')
            }
        } catch (err) {
            setError('Login failed. Please check your connection.')
            console.error(err)
        } finally {
            setLoading(false)
        }
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
                        <Package size={32} color="white" />
                    </div>
                    <h2 style={{ fontSize: '24px', color: 'var(--text-main)' }}>Welcome Back</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Login to InvoiceFlow</p>
                </div>

                {error && (
                    <div style={{
                        background: '#fef2f2',
                        color: 'var(--danger)',
                        padding: '12px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        marginBottom: '20px',
                        border: '1px solid #fee2e2'
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
