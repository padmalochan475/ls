import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Eye, EyeOff } from 'lucide-react';
import '../styles/design-system.css';
import Logo from '../components/Logo';

// ---------------------------------------------------------------------------
// Shared inline style constants — keeps JSX readable and avoids duplication
// ---------------------------------------------------------------------------
const INPUT_STYLE = {
    padding: 'var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--glass-border)',
    background: 'rgba(0,0,0,0.2)',
    color: 'white',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
};

const PASSWORD_INPUT_STYLE = { ...INPUT_STYLE, paddingRight: '40px' };

const EYE_BTN_STYLE = {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
};

const ALERT_BASE = {
    padding: 'var(--space-sm)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-md)',
    fontSize: '0.875rem',
};

const SUCCESS_ALERT = { ...ALERT_BASE, background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' };
const ERROR_ALERT   = { ...ALERT_BASE, background: 'rgba(239,68,68,0.2)',  color: '#fca5a5' };

// ---------------------------------------------------------------------------
// Helper: send OTP email via Secure Vercel API
// ---------------------------------------------------------------------------
async function sendOtpEmailSecure(email, name, actionType = 'signup') {
    try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${apiUrl}/api/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, actionType })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
        return { success: true };
    } catch (err) {
        console.error('[Login] Send OTP error:', err);
        return { success: false, error: err };
    }
}

async function verifyOtpSecure(email, otpCode) {
    try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${apiUrl}/api/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp: otpCode, actionType: 'signup' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to verify OTP');
        return { success: true };
    } catch (err) {
        console.error('[Login] Verify OTP error:', err);
        return { success: false, error: err };
    }
}

// ---------------------------------------------------------------------------
// Helper: resolve EmpID or email to the registered Firebase Auth email
// Returns { email, displayEmail } or throws with a user-facing message.
// ---------------------------------------------------------------------------
async function resolveResetEmail(input) {
    const cleanInput = String(input).trim().toLowerCase();
    
    // If it already looks like an email, use it directly.
    if (cleanInput.includes('@')) {
        return { email: cleanInput, displayEmail: cleanInput };
    }

    // 1. Fast path — emp_lookups index (using original casing for EmpID lookup)
    const empIdStr = String(input).trim();
    const lookupSnap = await getDoc(doc(db, 'emp_lookups', empIdStr));
    if (lookupSnap.exists() && lookupSnap.data().email) {
        const email = lookupSnap.data().email.toLowerCase();
        const [local, domain] = email.split('@');
        return { email, displayEmail: local.slice(0, 3) + '***@' + domain };
    }

    // 2. Fallback — full users collection scan by empId field
    const usersSnap = await getDocs(
        query(collection(db, 'users'), where('empId', '==', empIdStr))
    );
    if (!usersSnap.empty) {
        const email = usersSnap.docs[0].data().email.toLowerCase();
        const [local, domain] = email.split('@');
        return { email, displayEmail: local.slice(0, 3) + '***@' + domain };
    }

    throw new Error('Employee ID not found. Please enter your registered email address directly.');
}

// ---------------------------------------------------------------------------
// Keyframe CSS — defined once as a string, injected in a single <style> tag
// ---------------------------------------------------------------------------
const KEYFRAMES = `
    @keyframes float {
        0%   { transform: translate(0, 0); }
        50%  { transform: translate(20px, 20px); }
        100% { transform: translate(0, 0); }
    }
    @keyframes crystallize {
        0%   { opacity: 0; transform: scale(0.8) translateY(20px); }
        100% { opacity: 1; transform: scale(1) translateY(0);      }
    }
    @keyframes shine {
        to { background-position: 200% center; }
    }
`;

// ===========================================================================
// Login Page Component
// ===========================================================================
const Login = () => {
    const { login, resetPassword, currentUser, userProfile, loading, logout, profileMissing, authError } = useAuth();
    const navigate = useNavigate();

    // ── UI mode ──────────────────────────────────────────────────────────────
    const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
    const [signupStep, setSignupStep] = useState(1); // 1 = details, 2 = OTP
    const [forgotStep, setForgotStep] = useState(1); // 1 = details, 2 = OTP

    // ── Form data ─────────────────────────────────────────────────────────────
    const [formData, setFormData] = useState({
        empId: '', password: '', confirmPassword: '',
        name: '', recoveryEmail: '', mobileNumber: '',
    });
    const [signupOtp, setSignupOtp]               = useState('');
    const [generatedOtp, setGeneratedOtp]         = useState(null);
    const [resetInput, setResetInput]             = useState('');
    const [forgotEmail, setForgotEmail]           = useState('');
    const [forgotOtp, setForgotOtp]               = useState('');
    const [forgotNewPassword, setForgotNewPassword] = useState('');

    // ── Feedback ─────────────────────────────────────────────────────────────
    const [error, setError]               = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [isLoading, setIsLoading]       = useState(false);

    // ── Password visibility ───────────────────────────────────────────────────
    const [showPassword, setShowPassword]               = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // ── Auth redirect / profile-missing guard ─────────────────────────────────
    useEffect(() => {
        if (loading) return;

        if (currentUser && userProfile) {
            navigate('/');
        } else if (currentUser && profileMissing) {
            // DO NOT auto-logout. Leave the user in the controlled state.
            setError('Your account exists, but your application profile is missing or corrupted. Please contact an Administrator for identity repair.');
        } else if (currentUser && authError === 'ACCOUNT_DISABLED') {
            setError('Your account has been disabled or rejected. Please contact administration.');
        } else if (currentUser && authError === 'PERMISSION_DENIED') {
            setError('Access Denied. You do not have permission to view this profile.');
            logout().catch((e) => console.error('[Login] logout after permission denied:', e));
        }
    }, [currentUser, userProfile, profileMissing, authError, loading, navigate, logout]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const clearFeedback  = () => { setError(''); setStatusMessage(''); };
    const field = (key) => (e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }));

    const switchMode = (next) => {
        clearFeedback();
        setSignupStep(1);
        setForgotStep(1);
        setFormData({ empId: '', password: '', confirmPassword: '', name: '', recoveryEmail: '', mobileNumber: '' });
        setResetInput('');
        setForgotEmail('');
        setForgotOtp('');
        setForgotNewPassword('');
        setMode(next);
    };

    const mapAuthError = (err) => {
        const map = {
            'auth/invalid-credential':  'Invalid Employee ID or Password.',
            'auth/email-already-in-use':'This Employee ID is already registered.',
            'auth/weak-password':       'Password must be at least 6 characters.',
            'auth/user-not-found':      'No account found. Please check and try again.',
            'auth/invalid-email':       'Invalid email address.',
            'auth/too-many-requests':   'Too many attempts. Please wait a few minutes.',
        };
        return map[err.code] || `Error: ${err.message}`;
    };

    // ── Login ─────────────────────────────────────────────────────────────────
    const handleLogin = async () => {
        setIsLoading(true);
        try {
            await login(formData.empId.trim(), formData.password);
        } catch (err) {
            console.error('[Login] login failed:', err);
            setError(mapAuthError(err));
        } finally {
            setIsLoading(false);
        }
    };

    // ── Signup — Step 1: Validate & send OTP ─────────────────────────────────
    const handleSignupStep1 = async () => {
        const cleanEmpId = formData.empId.trim();

        if (!/^[a-zA-Z0-9\-_]+$/.test(cleanEmpId)) {
            setError('Employee ID can only contain letters, numbers, hyphens, and underscores.');
            return;
        }
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);

        try {
            const lookupSnap = await getDoc(doc(db, 'emp_lookups', cleanEmpId));
            if (lookupSnap.exists() && lookupSnap.data().uid) {
                setError('This Employee ID is already registered. Please sign in or contact Admin.');
                setIsLoading(false);
                return;
            }
        } catch (err) {
            console.warn('[Login] pre-check failed, continuing:', err);
        }

        const normalizedEmail = formData.recoveryEmail.trim().toLowerCase();
        const result = await sendOtpEmailSecure(normalizedEmail, formData.name.trim());
        if (result.success) {
            setStatusMessage(`OTP sent to ${normalizedEmail}`);
            setSignupStep(2);
        } else {
            setError(`Failed to send OTP: ${result.error?.message || 'Unknown error'}`);
        }

        setIsLoading(false);
    };

    // ── Signup — Step 2: Verify OTP & create account ─────────────────────────
    const handleSignupStep2 = async () => {
        setIsLoading(true);
        const normalizedEmail = formData.recoveryEmail.trim().toLowerCase();
        
        try {
            const response = await fetch('/api/register-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: normalizedEmail,
                    name: formData.name.trim(),
                    empId: formData.empId.trim(),
                    mobile: formData.mobileNumber.trim(),
                    password: formData.password,
                    otp: signupOtp
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to register. Please try again.');
            }

            await login(formData.empId.trim(), formData.password);
        } catch (err) {
            console.error('[Login] backend registration failed:', err);
            setError(err.message || 'Registration failed.');
            setIsLoading(false);
        }
    };

    // ── Forgot password ───────────────────────────────────────────────────────
    const handleForgotPasswordStep1 = async (e) => {
        if (e) e.preventDefault();
        clearFeedback();
        setIsLoading(true);

        try {
            const { email, displayEmail } = await resolveResetEmail(resetInput.trim());
            setForgotEmail(email);
            
            const result = await sendOtpEmailSecure(email, 'User', 'password_reset');
            if (result.success) {
                setStatusMessage(`OTP sent to ${displayEmail}. Please check your inbox and spam folder.`);
                setForgotStep(2);
            } else {
                setError(`Failed to send OTP: ${result.error?.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('[Login] forgot password step 1 error:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPasswordStep2 = async (e) => {
        if (e) e.preventDefault();
        clearFeedback();
        
        if (forgotNewPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: forgotEmail,
                    otp: forgotOtp,
                    newPassword: forgotNewPassword
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to reset password.');
            }

            setStatusMessage('Password updated successfully! You can now sign in.');
            setForgotStep(1);
            setResetInput('');
            setForgotOtp('');
            setForgotNewPassword('');
            setMode('login');
        } catch (err) {
            console.error('[Login] forgot password step 2 error:', err);
            setError(err.message || 'Reset failed.');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Master submit dispatcher ──────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        clearFeedback();

        if (mode === 'login') {
            await handleLogin();
        } else if (mode === 'signup' && signupStep === 1) {
            await handleSignupStep1();
        } else if (mode === 'signup' && signupStep === 2) {
            await handleSignupStep2();
        } else if (mode === 'forgot' && forgotStep === 1) {
            await handleForgotPasswordStep1();
        } else if (mode === 'forgot' && forgotStep === 2) {
            await handleForgotPasswordStep2();
        }
    };

    // ── Submit button label ───────────────────────────────────────────────────
    const submitLabel = () => {
        if (isLoading) return 'Processing…';
        if (mode === 'login') return 'Sign In';
        if (mode === 'signup') return signupStep === 1 ? 'Send OTP' : 'Verify & Sign Up';
        return forgotStep === 1 ? 'Send Reset OTP' : 'Reset Password';
    };

    // =========================================================================
    // Render
    // =========================================================================
    return (
        <div style={{
            height: '100vh', width: '100vw',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#050505',
            fontFamily: "'Outfit', sans-serif",
            position: 'relative', overflow: 'hidden',
            color: '#f8fafc',
        }}>
            <style>{KEYFRAMES}</style>

            <div style={{
                position: 'absolute', top: '-20%', left: '-10%',
                width: '600px', height: '600px',
                background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                filter: 'blur(80px)', animation: 'float 20s infinite alternate',
            }} />
            <div style={{
                position: 'absolute', bottom: '-20%', right: '-10%',
                width: '500px', height: '500px',
                background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, transparent 70%)',
                filter: 'blur(80px)', animation: 'float 15s infinite alternate-reverse',
            }} />

            <div style={{
                padding: '3rem', width: '90%', maxWidth: '450px', textAlign: 'center',
                background: 'rgba(15,23,42,0.4)',
                backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
                border: '1px solid rgba(255,255,255,0.05)', borderRadius: '30px',
                boxShadow: '0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
                maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
                zIndex: 10, position: 'relative',
                display: 'flex', flexDirection: 'column',
                animation: 'crystallize 0.8s cubic-bezier(0.16,1,0.3,1) forwards',
            }}>

                <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'center' }}>
                    <div style={{
                        padding: '12px', borderRadius: '20px',
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
                        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
                    }}>
                        <Logo size={48} iconSize={24} />
                    </div>
                </div>

                <h1 style={{
                    marginBottom: '0.4rem', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em',
                    background: 'linear-gradient(to bottom right, #ffffff, #94a3b8)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 2px 10px rgba(255,255,255,0.1))',
                }}>
                    {mode === 'forgot' ? 'Reset Password' : (mode === 'login' ? 'Welcome Back' : 'Join LAMS')}
                </h1>
                <p style={{ color: '#94a3b8', marginBottom: '1.75rem', fontSize: '0.95rem', fontWeight: 500 }}>
                    Lab Assignment Management System
                </p>

                {statusMessage && <div style={SUCCESS_ALERT}>{statusMessage}</div>}
                {error         && <div style={ERROR_ALERT}>{error}</div>}

                {/* ── FORGOT PASSWORD FORM ──────────────────────────────── */}
                {mode === 'forgot' ? (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {forgotStep === 1 ? (
                            <>
                                <input
                                    id="reset-input"
                                    type="text"
                                    placeholder="Employee ID or registered Email"
                                    className="glass-input"
                                    aria-label="Employee ID or Email for password reset"
                                    style={INPUT_STYLE}
                                    value={resetInput}
                                    onChange={(e) => setResetInput(e.target.value)}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="btn"
                                    disabled={isLoading}
                                    style={{ background: 'var(--color-accent)', color: 'white', opacity: isLoading ? 0.7 : 1 }}
                                >
                                    {isLoading ? 'Sending...' : 'Send Reset OTP'}
                                </button>
                            </>
                        ) : (
                            <>
                                <input
                                    id="forgot-otp"
                                    type="text"
                                    placeholder="Enter 6-digit OTP"
                                    className="glass-input text-center text-xl tracking-widest"
                                    style={{ ...INPUT_STYLE, letterSpacing: '0.25em' }}
                                    value={forgotOtp}
                                    onChange={(e) => setForgotOtp(e.target.value)}
                                    maxLength={6}
                                    required
                                />
                                <div style={{ position: 'relative' }}>
                                    <input
                                        id="forgot-new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="New Password"
                                        className="glass-input"
                                        style={PASSWORD_INPUT_STYLE}
                                        value={forgotNewPassword}
                                        onChange={(e) => setForgotNewPassword(e.target.value)}
                                        required
                                        minLength={6}
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={EYE_BTN_STYLE}>
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                                <button
                                    type="submit"
                                    className="btn"
                                    disabled={isLoading}
                                    style={{ background: 'var(--color-accent)', color: 'white', opacity: isLoading ? 0.7 : 1 }}
                                >
                                    {isLoading ? 'Resetting...' : 'Reset Password'}
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={() => switchMode('login')}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', marginTop: '0.5rem' }}
                        >
                            ← Back to Login
                        </button>
                    </form>
                ) : currentUser && profileMissing ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div style={{ color: '#fca5a5', marginBottom: '1rem' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'white', marginBottom: '1rem' }}>Identity Repair Required</h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '2rem' }}>
                            Your authentication account exists, but your application profile is missing or corrupted. 
                            The system cannot securely determine your role or master data bindings.
                            <br /><br />
                            Please contact an Administrator to repair your identity record.
                        </p>
                        <button
                            type="button"
                            className="btn"
                            onClick={() => logout()}
                            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', width: '100%' }}
                        >
                            Sign Out
                        </button>
                    </div>
                ) : (
                    /* ── LOGIN / SIGNUP FORM ─────────────────────────────── */
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
                        <div key={mode} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

                            {/* SIGNUP — Step 1: Details */}
                            {mode === 'signup' && signupStep === 1 && (
                                <>
                                    <input
                                        id="signup-name" name="name" type="text"
                                        placeholder="Full Name" className="glass-input"
                                        autoComplete="name" aria-label="Full Name"
                                        style={INPUT_STYLE}
                                        value={formData.name} onChange={field('name')} required
                                    />

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                                        <input
                                            id="signup-empId" name="empId" type="text"
                                            placeholder="Employee ID" className="glass-input"
                                            autoComplete="off" aria-label="Employee ID"
                                            style={INPUT_STYLE}
                                            value={formData.empId} onChange={field('empId')} required
                                        />
                                        <input
                                            id="signup-mobile" name="mobile" type="tel"
                                            placeholder="Mobile" className="glass-input"
                                            autoComplete="tel" aria-label="Mobile Number"
                                            style={INPUT_STYLE}
                                            value={formData.mobileNumber} onChange={field('mobileNumber')} required
                                        />
                                    </div>

                                    <input
                                        id="signup-email" name="email" type="email"
                                        placeholder="Email ID" className="glass-input"
                                        autoComplete="email" aria-label="Email Address"
                                        style={INPUT_STYLE}
                                        value={formData.recoveryEmail} onChange={field('recoveryEmail')} required
                                    />

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                id="signup-password" name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="Password" className="glass-input"
                                                autoComplete="new-password" aria-label="Create Password"
                                                style={PASSWORD_INPUT_STYLE}
                                                value={formData.password} onChange={field('password')} required
                                            />
                                            <button type="button" style={EYE_BTN_STYLE} onClick={() => setShowPassword((v) => !v)}>
                                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                            </button>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                id="signup-confirm" name="confirmPassword"
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                placeholder="Confirm" className="glass-input"
                                                autoComplete="new-password" aria-label="Confirm Password"
                                                style={PASSWORD_INPUT_STYLE}
                                                value={formData.confirmPassword} onChange={field('confirmPassword')} required
                                            />
                                            <button type="button" style={EYE_BTN_STYLE} onClick={() => setShowConfirmPassword((v) => !v)}>
                                                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* SIGNUP — Step 2: OTP */}
                            {mode === 'signup' && signupStep === 2 && (
                                <input
                                    id="signup-otp" name="otp" type="text"
                                    placeholder="Enter OTP" className="glass-input"
                                    autoComplete="one-time-code" aria-label="One-time password"
                                    style={{ ...INPUT_STYLE, textAlign: 'center', letterSpacing: '4px' }}
                                    value={signupOtp} onChange={(e) => setSignupOtp(e.target.value)} required
                                />
                            )}

                            {/* LOGIN */}
                            {mode === 'login' && (
                                <>
                                    <input
                                        id="login-id" name="username" type="text"
                                        placeholder="Employee ID or Email" className="glass-input"
                                        autoComplete="username" aria-label="Employee ID or Email"
                                        style={INPUT_STYLE}
                                        value={formData.empId} onChange={field('empId')} required
                                    />
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            id="login-password" name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Password" className="glass-input"
                                            autoComplete="current-password" aria-label="Password"
                                            style={PASSWORD_INPUT_STYLE}
                                            value={formData.password} onChange={field('password')} required
                                        />
                                        <button type="button" style={EYE_BTN_STYLE} onClick={() => setShowPassword((v) => !v)}>
                                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Submit button */}
                            <button
                                type="submit"
                                className="btn"
                                disabled={isLoading}
                                style={{
                                    width: '100%', marginTop: '0.25rem', fontSize: '1rem',
                                    background: 'linear-gradient(135deg, var(--color-accent), #60a5fa)',
                                    color: 'white',
                                    opacity: isLoading ? 0.7 : 1,
                                }}
                            >
                                {submitLabel()}
                            </button>
                        </div>
                    </form>
                )}

                {/* ── Footer links ─────────────────────────────────────── */}
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                    {mode === 'login' && (
                        <button
                            onClick={() => switchMode('forgot')}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseEnter={(e) => (e.target.style.color = '#e2e8f0')}
                            onMouseLeave={(e) => (e.target.style.color = '#94a3b8')}
                        >
                            Forgot Password?
                        </button>
                    )}
                    {mode !== 'forgot' && (
                        <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                            <button
                                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                                style={{
                                    border: 'none', cursor: 'pointer', fontWeight: 700, marginLeft: '4px', fontSize: '0.95rem',
                                    background: 'linear-gradient(to right, #3b82f6, #8b5cf6)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                }}
                            >
                                {mode === 'login' ? 'Sign Up' : 'Sign In'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Floating footer */}
            <div style={{ position: 'absolute', bottom: '1rem', width: '100%', textAlign: 'center', zIndex: 5 }}>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginRight: '6px' }}>Designed by</span>
                <span style={{
                    fontSize: '0.9rem', fontWeight: 700,
                    background: 'linear-gradient(to right, #38bdf8, #c084fc, #f472b6, #38bdf8)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    animation: 'shine 5s linear infinite',
                }}>
                    Padmalochan Maharana
                </span>
            </div>
        </div>
    );
};

export default Login;
