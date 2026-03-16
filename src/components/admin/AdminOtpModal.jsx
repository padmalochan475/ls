import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X, ArrowRight } from 'lucide-react';

const AdminOtpModal = ({ isOpen, onClose, onVerify, email, isSending }) => {
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [isVisible, setIsVisible] = useState(false);
    const [error, setError] = useState(false);
    const inputRefs = useRef([]);

    useEffect(() => {
        if (isOpen) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsVisible(true);
            // Focus first input
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } else {
            // Delay unmount to allow exit animation
            const timer = setTimeout(() => {
                setIsVisible(false);
                setOtp(['', '', '', '', '', '']);
                setError(false);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleChange = (element, index) => {
        if (isNaN(element.value)) return;

        const newOtp = [...otp];
        newOtp[index] = element.value;
        setOtp(newOtp);

        // Focus next input
        if (element.value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit if full
        if (newOtp.every(d => d !== '') && index === 5) {
            // Optional: Auto submit disabled to let user click verify
        }
    };

    const handleKeyDown = (e, index) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
        if (e.key === 'Enter') {
            handleVerify();
        }
    };

    const handleVerify = () => {
        const code = otp.join('');
        if (code.length < 6) {
            setError(true);
            return;
        }
        onVerify(code);
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const data = e.clipboardData.getData('text').slice(0, 6).split('');
        if (data.length === 0) return;

        const newOtp = [...otp];
        data.forEach((char, index) => {
            if (index < 6 && !isNaN(char)) newOtp[index] = char;
        });
        setOtp(newOtp);
        inputRefs.current[Math.min(data.length, 5)]?.focus();
    };

    if (!isOpen && !isVisible) return null;

    return createPortal(
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(12px)',
            opacity: isOpen ? 1 : 0,
            transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: isOpen ? 'auto' : 'none'
        }}>
            <style>
                {`
                @keyframes float-shield {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(96, 165, 250, 0.2); }
                    50% { box-shadow: 0 0 40px rgba(96, 165, 250, 0.4); }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .otp-input:focus {
                    border-color: #60a5fa !important;
                    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.3);
                    transform: translateY(-2px);
                }
                `}
            </style>

            <div style={{
                width: '90%',
                maxWidth: '420px',
                background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
                borderRadius: '24px',
                padding: '2rem',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
                transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
                transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                animation: error ? 'shake 0.4s ease-in-out' : 'none'
            }}>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        borderRadius: '50%',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.color = '#64748b';
                        e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <X size={20} />
                </button>

                {/* Icon */}
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.5rem',
                    boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.2), 0 0 30px rgba(59, 130, 246, 0.2)',
                    animation: 'float-shield 3s ease-in-out infinite'
                }}>
                    <ShieldCheck size={40} color="#60a5fa" strokeWidth={1.5} />
                </div>

                <h2 style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    textAlign: 'center',
                    background: 'linear-gradient(to right, #fff, #94a3b8)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                }}>
                    Security Verification
                </h2>

                <p style={{
                    margin: '0 0 1.5rem 0',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: '0.95rem',
                    lineHeight: '1.5'
                }}>
                    We've sent a 6-digit code to <span style={{ color: 'white', fontWeight: 600 }}>
                        {(() => {
                            if (!email) return 'your email';
                            const [name, domain] = email.split('@');
                            if (!domain) return email;
                            const maskedName = name.length > 2 ? `${name.substring(0, 2)}**` : `${name}**`;
                            return `${maskedName}@${domain}`;
                        })()}
                    </span>
                    <br />
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Enter the code to verify your identity.</span>
                </p>

                {/* OTP Inputs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
                    {otp.map((digit, i) => (
                        <input
                            key={i}
                            ref={ref => inputRefs.current[i] = ref}
                            type="text"
                            maxLength="1"
                            value={digit}
                            onChange={(e) => handleChange(e.target, i)}
                            onKeyDown={(e) => handleKeyDown(e, i)}
                            onPaste={handlePaste}
                            className="otp-input"
                            style={{
                                width: '3rem',
                                height: '3.5rem',
                                borderRadius: '12px',
                                border: error ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                                background: 'rgba(0, 0, 0, 0.3)',
                                color: 'white',
                                fontSize: '1.5rem',
                                fontWeight: '700',
                                textAlign: 'center',
                                outline: 'none',
                                transition: 'all 0.2s',
                                caretColor: '#60a5fa'
                            }}
                        />
                    ))}
                </div>

                {isSending && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.8)',
                        backdropFilter: 'blur(4px)',
                        borderRadius: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10
                    }}>
                        <div style={{
                            width: '40px', height: '40px', border: '3px solid rgba(96, 165, 250, 0.3)',
                            borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite'
                        }}></div>
                        <span style={{ marginTop: '1rem', color: '#60a5fa', fontWeight: 600 }}>Verifying...</span>
                    </div>
                )}

                <button
                    onClick={handleVerify}
                    style={{
                        width: '100%',
                        padding: '1rem',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: 'white',
                        border: 'none',
                        fontSize: '1rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.75rem',
                        boxShadow: '0 4px 15px rgba(37, 99, 235, 0.3)',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(37, 99, 235, 0.4)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(37, 99, 235, 0.3)';
                    }}
                >
                    Verify & Proceed <ArrowRight size={18} />
                </button>

            </div>

            <style>
                {`@keyframes spin { 100% { transform: rotate(360deg); } }`}
            </style>
        </div>,
        document.body
    );
};

export default AdminOtpModal;
