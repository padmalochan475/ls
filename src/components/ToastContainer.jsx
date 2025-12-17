import React, { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import '../styles/design-system.css';

const ToastItem = ({ toast }) => {
    const { removeToast } = useToast();
    const [isExiting, setIsExiting] = useState(false);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(() => removeToast(toast.id), 300); // Match animation duration
    };

    // Auto-dismiss logic is in Context, but handle the generic animation here if needed

    let Icon = Info;
    let colorClass = 'text-blue-400';
    let bgClass = 'bg-blue-900/40'; // Fallback using standard CSS if tailwind not available
    let borderClass = '#3b82f6';

    switch (toast.type) {
        case 'success':
            Icon = CheckCircle;
            borderClass = '#10b981';
            break;
        case 'error':
            Icon = AlertCircle;
            borderClass = '#ef4444';
            break;
        case 'warning':
            Icon = AlertTriangle;
            borderClass = '#f59e0b';
            break;
        default:
            Icon = Info;
            borderClass = '#3b82f6';
    }

    return (
        <div
            className="toast-item glass-panel"
            style={{
                marginBottom: '0.75rem',
                padding: '1rem',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'start',
                gap: '12px',
                minWidth: '300px',
                maxWidth: '400px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                borderLeft: `4px solid ${borderClass}`,
                animation: isExiting ? 'slideOut 0.3s forwards' : 'slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                pointerEvents: 'auto',
                position: 'relative',
                overflow: 'hidden'
            }}
        >
            <Icon size={20} color={borderClass} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#f8fafc', fontWeight: 500, lineHeight: 1.5 }}>
                    {toast.message}
                </p>
            </div>
            <button
                onClick={handleDismiss}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.2s'
                }}
            >
                <X size={16} />
            </button>
        </div>
    );
};

const ToastContainer = () => {
    const { toasts } = useToast();

    return (
        <div
            style={{
                position: 'fixed',
                bottom: '2rem',
                right: '2rem',
                zIndex: 10000,
                display: 'flex',
                flexDirection: 'column',
                pointerEvents: 'none' // Allow clicking through the container
            }}
        >
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} />
            ))}
        </div>
    );
};

export default ToastContainer;
