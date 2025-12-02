import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Eye, EyeOff } from 'lucide-react';
import emailjs from '@emailjs/browser';
import '../styles/design-system.css';

const Login = () => {
  const { login, signup, currentUser } = useAuth();
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

  // EmailJS Configuration
  const EMAILJS_SERVICE_ID = "service_xoq8zys";
  const EMAILJS_TEMPLATE_ID = "template_ag70wm8";
  const EMAILJS_PUBLIC_KEY = "OLfq9wSgarnn9O5z-";

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  // Forgot Password States
  const [resetStep, setResetStep] = useState(1); // 1: EmpID, 2: OTP, 3: New Password
  const [resetEmpId, setResetEmpId] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState(null);
  const [newPassword, setNewPassword] = useState('');

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
        if (formData.password.length < 6) {
          setError('Password should be at least 6 characters.');
          return;
        }

        setIsLoading(true);

        // Generate OTP
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
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
      if (resetStep === 1) {
        // Step 1: Verify Emp ID and send OTP
        const q = query(collection(db, 'users'), where('empId', '==', resetEmpId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setError('Employee ID not found.');
          setIsLoading(false);
          return;
        }

        const userData = querySnapshot.docs[0].data();
        if (!userData.email) {
          setError('No recovery email found for this user. Contact Admin.');
          setIsLoading(false);
          return;
        }

        // Generate OTP
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
        setGeneratedOtp(newOtp);

        // Send Real Email
        const result = await sendEmailOtp(userData.email, userData.name || 'User', newOtp);

        if (result.success) {
          setStatusMessage(`OTP sent to ${userData.email}`);
          setResetStep(2);
        } else {
          const errorMsg = result.error?.text || result.error?.message || "Unknown error";
          setError(`Failed to send OTP: ${errorMsg}`);
        }

      } else if (resetStep === 2) {
        // Step 2: Verify OTP
        if (otp === generatedOtp) {
          setResetStep(3);
          setStatusMessage('OTP Verified. Enter new password.');
        } else {
          setError('Invalid OTP.');
        }
      } else if (resetStep === 3) {
        // Step 3: Reset Password (Simulated)
        // Note: We cannot actually reset the password here without Admin SDK or re-auth.
        // For this demo, we will just show success.
        alert('Password Reset Successfully! (Simulated - In a real app, this would update Auth)');
        setIsForgotPassword(false);
        setResetStep(1);
        setResetEmpId('');
        setOtp('');
        setNewPassword('');
        setStatusMessage('Password reset successful. Please login with your new password.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred. Please try again.');
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
            {resetStep === 1 && (
              <input
                type="text" placeholder="Enter Employee ID" className="glass-input"
                value={resetEmpId} onChange={(e) => setResetEmpId(e.target.value)} required
              />
            )}
            {resetStep === 2 && (
              <input
                type="text" placeholder="Enter OTP" className="glass-input"
                value={otp} onChange={(e) => setOtp(e.target.value)} required
              />
            )}
            {resetStep === 3 && (
              <input
                type="password" placeholder="New Password" className="glass-input"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required
              />
            )}

            <button type="submit" className="btn" style={{ background: 'var(--color-accent)', color: 'white' }}>
              {resetStep === 1 ? 'Send OTP' : resetStep === 2 ? 'Verify OTP' : 'Reset Password'}
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
      background: 'radial-gradient(circle at top right, #1e293b, #0f172a)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated Background Orbs */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, var(--color-accent-glow) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        opacity: 0.5,
        animation: 'float 10s infinite ease-in-out'
      }}></div>
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-10%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        opacity: 0.4,
        animation: 'float 15s infinite ease-in-out reverse'
      }}></div>

      {/* Login Card */}
      <div className="glass-panel animate-fade-in" style={{
        padding: 'var(--space-xl)',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        zIndex: 10,
        border: '1px solid rgba(255, 255, 255, 0.15)'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          background: 'linear-gradient(135deg, var(--color-accent), #60a5fa)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          margin: '0 auto var(--space-lg)',
          boxShadow: '0 0 20px var(--color-accent-glow)'
        }}>
          🔬
        </div>

        <h1 style={{ marginBottom: 'var(--space-xs)', fontSize: '2rem' }}>{isLogin ? 'Welcome Back' : 'Join LAB'}</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-xl)' }}>
          Institute Lab Management System
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {!isLogin && signupStep === 1 && (
            <>
              <input
                type="text"
                placeholder="Full Name"
                className="glass-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
              />
              <input
                type="email"
                placeholder="Recovery Email"
                className="glass-input"
                value={formData.recoveryEmail}
                onChange={(e) => setFormData({ ...formData, recoveryEmail: e.target.value })}
                required
                style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
              />
              <input
                type="tel"
                placeholder="Mobile Number"
                className="glass-input"
                value={formData.mobileNumber || ''}
                onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                required
                style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
              />
            </>
          )}

          {(!isLogin && signupStep === 2) ? (
            <input
              type="text"
              placeholder="Enter OTP sent to email"
              className="glass-input"
              value={signupOtp}
              onChange={(e) => setSignupOtp(e.target.value)}
              required
              style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', textAlign: 'center', letterSpacing: '2px' }}
            />
          ) : (
            <>
              <input
                type="text"
                placeholder="Employee ID"
                className="glass-input"
                value={formData.empId}
                onChange={(e) => setFormData({ ...formData, empId: e.target.value })}
                required
                style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
              />

              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  className="glass-input"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  style={{
                    padding: 'var(--space-md)',
                    paddingRight: '40px', // Space for icon
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.2)',
                    color: 'white',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn"
            disabled={isLoading}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, var(--color-accent), #60a5fa)',
              color: 'white',
              padding: 'var(--space-md)',
              fontSize: '1rem',
              marginTop: 'var(--space-sm)',
              opacity: isLoading ? 0.7 : 1
            }}
          >
            {isLoading ? 'Processing...' : (isLogin ? 'Sign In' : (signupStep === 1 ? 'Send OTP' : 'Verify & Sign Up'))}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-lg)', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          {isLogin && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                onClick={() => setIsForgotPassword(true)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Forgot Password?
              </button>
            </div>
          )}
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setStatusMessage('');
              setSignupStep(1);
              setFormData({ empId: '', password: '', name: '', recoveryEmail: '', mobileNumber: '' });
            }}
            style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0% { transform: translate(0, 0); }
          50% { transform: translate(20px, 20px); }
          100% { transform: translate(0, 0); }
        }
      `}</style>
    </div>
  );
};

export default Login;
