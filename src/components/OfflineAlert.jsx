import React from 'react';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const OfflineAlert = () => {
    const isOnline = useNetworkStatus();

    if (isOnline) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'linear-gradient(90deg, #ef4444, #b91c1c)',
            color: 'white',
            textAlign: 'center',
            padding: '0.5rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
            animation: 'slideDown 0.3s ease-out'
        }}>
            <WifiOff size={18} />
            <span>You are currently offline. Changes will not be saved.</span>
            <style>
                {`
                    @keyframes slideDown {
                        from { transform: translateY(-100%); }
                        to { transform: translateY(0); }
                    }
                `}
            </style>
        </div>
    );
};

export default OfflineAlert;
