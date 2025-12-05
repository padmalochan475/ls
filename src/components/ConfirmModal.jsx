import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Delete", cancelText = "Cancel", isDangerous = false }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300); // Wait for animation
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    return createPortal(
        <div className={`modal-overlay ${isOpen ? 'open' : 'closing'}`} style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: isOpen ? 1 : 0,
            transition: 'opacity 0.2s',
            pointerEvents: isOpen ? 'auto' : 'none'
        }}>
            <div className={`modal-content-glass ${isOpen ? 'open' : 'closing'}`} style={{
                background: 'var(--color-bg-main, #0f172a)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '1.5rem',
                width: '90%',
                maxWidth: '400px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                transform: isOpen ? 'scale(1)' : 'scale(0.95)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{
                        padding: '10px',
                        borderRadius: '50%',
                        background: isDangerous ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                        color: isDangerous ? '#ef4444' : '#3b82f6',
                        flexShrink: 0
                    }}>
                        <AlertTriangle size={24} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>
                            {title}
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8', lineHeight: '1.5' }}>
                            {message}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '0.6rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            background: 'transparent',
                            color: '#e2e8f0',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.target.style.background = 'rgba(255, 255, 255, 0.05)'}
                        onMouseLeave={e => e.target.style.background = 'transparent'}
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '0.6rem 1rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDangerous ? '#ef4444' : '#3b82f6',
                            color: 'white',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: isDangerous ? '0 4px 12px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(59, 130, 246, 0.3)',
                            transition: 'transform 0.1s'
                        }}
                        onMouseDown={e => e.target.style.transform = 'scale(0.96)'}
                        onMouseUp={e => e.target.style.transform = 'scale(1)'}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmModal;
