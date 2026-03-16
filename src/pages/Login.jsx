import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Eye, EyeOff } from 'lucide-react';
import emailjs from '@emailjs/browser';
import '../styles/design-system.css';
import Logo from '../components/Logo';

const Login = () => {
  const { login, signup, resetPassword, currentUser } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Signup Flow State
  const [signupStep, setSignupStep] = useState(1); // 1: Details, 2: OTP
  const [signupOtp, setSignupOtp] = useState('');
  const [generatedSignupOtp, setGeneratedSignupOtp] = useState(null);

  const [formData, setFormData] = useState({ empId: '', password: '', name: '', recoveryEmail: '', mobileNumber: '' });
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // EmailJS Configuration
  const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  // Forgot Password States
  const [resetEmpId, setResetEmpId] = useState('');

  const sendEmailOtp = async (email, name, otpCode) => {
    const templateParams = {
      to_name: name,
      passcode: otpCode,
      time: new Date(Date.now() + 15 * 60 * 1000).toLocaleString(),
      to_email: email,
      email: email, // Adding this as a backup variable name
    };

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, EMAILJS_PUBLIC_KEY);
      return { success: true };
    } catch (error) {
      console.error("EmailJS Error:", error);
      return { success: false, error: error };
    }
  };

  // eslint-disable-next-line sonarjs/cognitive-complexity
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatusMessage('');

    if (isLogin) {
      setIsLoading(true);
      try {
        await login(formData.empId, formData.password);
      } catch (err) {
        console.error(err);
        handleAuthError(err);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Signup Flow
      if (signupStep === 1) {
        // Step 1: Validate and Send OTP
        const empIdRegex = /^[a-zA-Z0-9]+$/;
        if (!empIdRegex.test(formData.empId)) {
          setError('Employee ID must contain only letters and numbers (no special characters).');
          return;
        }

        if (formData.password.length < 6) {
          setError('Password should be at least 6 characters.');
          return;
        }

        setIsLoading(true);

        // Generate OTP
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString(); // eslint-disable-line sonarjs/pseudo-random
        setGeneratedSignupOtp(newOtp);

        // Send Real Email
        const result = await sendEmailOtp(formData.recoveryEmail, formData.name, newOtp);

        if (result.success) {
          setStatusMessage(`OTP sent to ${formData.recoveryEmail}`);
          setSignupStep(2);
        } else {
          const errorMsg = result.error?.text || result.error?.message || "Unknown error";
          setError(`Failed to send OTP: ${errorMsg}`);
        }
        setIsLoading(false);
      } else {
        // Step 2: Verify OTP and Create Account
        if (signupOtp !== generatedSignupOtp) {
          setError('Invalid OTP. Please try again.');
          return;
        }

        setIsLoading(true);
        try {
          await signup(formData.empId, formData.password, formData.name, formData.recoveryEmail, formData.mobileNumber);
          // Auto-redirect will happen via useEffect
        } catch (err) {
          console.error(err);
          handleAuthError(err);
          setIsLoading(false);
        }
      }
    }
  };

  const handleAuthError = (err) => {
    if (err.code === 'auth/invalid-credential') {
      setError('Invalid Employee ID or Password.');
    } else if (err.code === 'auth/email-already-in-use') {
      setError('This Employee ID is already registered.');
    } else if (err.code === 'auth/weak-password') {
      setError('Password should be at least 6 characters.');
    } else {
      setError(`Failed: ${err.message}`);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setStatusMessage('');
    setIsLoading(true);

    try {
      // Step 1: Verify Emp ID and get Email (SECURE LOOKUP)
      // Use emp_lookups because unauthenticated users cannot query the full 'users' collection.
      const lookupDoc = await getDoc(doc(db, 'emp_lookups', resetEmpId));

      if (!lookupDoc.exists()) {
        setError('Employee ID not found. Please contact Admin.');
        setIsLoading(false);
        return;
      }

      const email = lookupDoc.data().email;
      if (!email) {
        setError('No recovery email linked. Contact Admin.');
        setIsLoading(false);
        return;
      }

      // Step 2: Send Firebase Password Reset Email
      await resetPassword(email);
      setStatusMessage(`Password reset link sent to ${email}. Please check your inbox.`);

      // Clear form after success
      setResetEmpId('');

    } catch (err) {
      console.error("Reset Password Error:", err);
      setError(`Failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (isForgotPassword) {
    return (
      <div style={{
        height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at top right, #1e293b, #0f172a)'
      }}>
        <div className="glass-panel animate-fade-in" style={{ padding: 'var(--space-xl)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--space-lg)' }}>Reset Password</h2>

          {statusMessage && <div style={{ padding: '0.5rem', background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', borderRadius: '4px', marginBottom: '1rem' }}>{statusMessage}</div>}
          {error && <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

          <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="text" placeholder="Enter Employee ID" className="glass-input" aria-label="Employee ID for Reset"
              value={resetEmpId} onChange={(e) => setResetEmpId(e.target.value)} required
            />

            <button type="submit" className="btn" style={{ background: 'var(--color-accent)', color: 'white' }}>
              Send Reset Link
            </button>

            <button type="button" onClick={() => setIsForgotPassword(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', marginTop: '1rem' }}>
              Back to Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#030712', // Deepest dark
      backgroundImage: `
        radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.1) 0px, transparent 50%), 
        radial-gradient(at 100% 0%, rgba(168, 85, 247, 0.1) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(56, 189, 248, 0.1) 0px, transparent 50%),
        radial-gradient(at 0% 100%, rgba(168, 85, 247, 0.1) 0px, transparent 50%)
      `,
      position: 'relative',
      overflow: 'hidden',
      padding: '0',
      boxSizing: 'border-box'
    }}>
      {/* Dynamic Background Orbs */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '10%', left: '15%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(60px)', animation: 'float 10s infinite ease-in-out' }}></div>
        <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(60px)', animation: 'float 14s infinite ease-in-out reverse' }}></div>
      </div>

      {/* Login Card */}
      <div style={{
        padding: '2.5rem 2rem',
        width: '90%',
        maxWidth: '420px',
        textAlign: 'center',
        background: 'rgba(17, 25, 40, 0.7)', // Darker tint for contrast
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderTop: '1px solid rgba(255, 255, 255, 0.2)', // Top highlight
        boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.05)', // Inner ring + Deep shadow
        backdropFilter: 'blur(20px) saturate(180%)',
        maxHeight: 'calc(100vh - 80px)',
        overflowY: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        zIndex: 10,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '24px', // Softer feel
        animation: 'crystallize 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
      }}>
        <style>{`.glass-panel::-webkit-scrollbar { display: none; }`}</style>

        <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'center' }}>
          <div style={{
            padding: '12px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)'
          }}>
            <Logo size={48} iconSize={24} />
          </div>
        </div>

        <h1 style={{
          marginBottom: '0.4rem',
          fontSize: '2rem',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          background: 'linear-gradient(to bottom right, #ffffff, #94a3b8)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 2px 10px rgba(255,255,255,0.1))'
        }}>
          {isLogin ? 'Welcome Back' : 'Join LAMS'}
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '1.75rem', fontSize: '0.95rem', fontWeight: 500 }}>
          Lab Assignment Management System
        </p>

        {statusMessage && (
          <div style={{ padding: 'var(--space-sm)', background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-md)', fontSize: '0.875rem' }}>
            {statusMessage}
          </div>
        )}

        {error && (
          <div style={{ padding: 'var(--space-sm)', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-md)', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
          <div key={isLogin ? 'login' : 'signup'} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {!isLogin && signupStep === 1 && (
              <>
                <input
                  id="signup-name" name="name" autoComplete="name" aria-label="Full Name"
                  type="text" placeholder="Full Name" className="glass-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                  <input
                    id="signup-empId" name="empId" autoComplete="off" aria-label="Employee ID"
                    type="text" placeholder="Employee ID" className="glass-input" value={formData.empId} onChange={(e) => setFormData({ ...formData, empId: e.target.value })} required style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
                  />
                  <input
                    id="signup-mobile" name="mobile" autoComplete="tel" aria-label="Mobile Number"
                    type="tel" placeholder="Mobile" className="glass-input" value={formData.mobileNumber || ''} onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })} required style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
                  />
                </div>

                <input
                  id="signup-email" name="email" autoComplete="email" aria-label="Email Address"
                  type="email" placeholder="Email ID" className="glass-input" value={formData.recoveryEmail} onChange={(e) => setFormData({ ...formData, recoveryEmail: e.target.value })} required style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="signup-password" name="password" autoComplete="new-password" aria-label="Create Password"
                      type={showPassword ? "text" : "password"} placeholder="Password" className="glass-input" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required style={{ padding: 'var(--space-md)', paddingRight: '40px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="signup-confirm" name="confirmPassword" autoComplete="new-password" aria-label="Confirm Password"
                      type={showConfirmPassword ? "text" : "password"} placeholder="Confirm" className="glass-input" value={formData.confirmPassword || ''} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} required style={{ padding: 'var(--space-md)', paddingRight: '40px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {(!isLogin && signupStep === 2) ? (
              <input
                id="signup-otp" name="otp" autoComplete="one-time-code" aria-label="OTP"
                type="text" placeholder="Enter OTP" className="glass-input" value={signupOtp} onChange={(e) => setSignupOtp(e.target.value)} required style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', textAlign: 'center', letterSpacing: '2px' }}
              />
            ) : (
              isLogin && (
                <>
                  <input
                    id="login-id" name="username" autoComplete="username" aria-label="Employee ID or Email"
                    type="text" placeholder="Employee ID or Email" className="glass-input" value={formData.empId} onChange={(e) => setFormData({ ...formData, empId: e.target.value })} required style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
                  />
                  <div style={{ position: 'relative' }}>
                    <input
                      id="login-password" name="password" autoComplete="current-password" aria-label="Password"
                      type={showPassword ? "text" : "password"} placeholder="Password" className="glass-input" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required style={{ padding: 'var(--space-md)', paddingRight: '40px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </>
              )
            )}

            <button type="submit" className="btn" disabled={isLoading} style={{ width: '100%', background: 'linear-gradient(135deg, var(--color-accent), #60a5fa)', color: 'white', padding: 'var(--space-md)', fontSize: '1rem', marginTop: '0.25rem', opacity: isLoading ? 0.7 : 1 }}>
              {isLoading ? 'Processing...' : (isLogin ? 'Sign In' : (signupStep === 1 ? 'Send OTP' : 'Verify & Sign Up'))} {/* eslint-disable-line sonarjs/no-nested-conditional */}
            </button>
          </div>
        </form>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          {isLogin && (
            <button onClick={() => setIsForgotPassword(true)} className="hover-text-bright" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', transition: 'color 0.3s ease', letterSpacing: '0.5px' }} onMouseEnter={(e) => e.target.style.color = '#e2e8f0'} onMouseLeave={(e) => e.target.style.color = '#94a3b8'}>
              Forgot Password?
            </button>
          )}
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => { setIsLogin(!isLogin); setError(''); setStatusMessage(''); setSignupStep(1); setFormData({ empId: '', password: '', name: '', recoveryEmail: '', mobileNumber: '' }); }} style={{ border: 'none', cursor: 'pointer', fontWeight: '700', background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginLeft: '4px', fontSize: '0.95rem', transition: 'opacity 0.3s ease' }} onMouseEnter={(e) => e.target.style.opacity = '0.8'} onMouseLeave={(e) => e.target.style.opacity = '1'}>
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </div>
      </div >

      {/* Floating Footer - MOVED OUTSIDE THE CARD */}
      < div style={{
        position: 'absolute',
        bottom: '1rem',
        width: '100%',
        textAlign: 'center',
        zIndex: 5
      }}>
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginRight: '6px' }}>Designed by</span>
        <span style={{ fontSize: '0.9rem', fontWeight: '700', background: 'linear-gradient(to right, #38bdf8, #c084fc, #f472b6, #38bdf8)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'shine 5s linear infinite' }}>
          Padmalochan Maharana
        </span>
      </div >

      <style>{`
          @keyframes float {
            0% { transform: translate(0, 0); }
            50% { transform: translate(20px, 20px); }
            100% { transform: translate(0, 0); }
          }
          @keyframes crystallize {
            0% {
              opacity: 0;
              transform: scale(0.8) translateY(20px);
              backdrop-filter: blur(0px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
              backdrop-filter: blur(24px); /* Output matches --glass-blur */
            }
          }
      `}</style>
    </div >
  );
};

export default Login;
