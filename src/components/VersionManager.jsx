import React, { useEffect } from 'react';
import toast from 'react-hot-toast';

const VersionManager = () => {
    const checkForUpdate = async () => {
        if (import.meta.env.DEV) return; // Skip in Dev

        try {
            const res = await fetch('/api/version');
            if (res.ok) {
                const data = await res.json();
                const serverBuildId = data.buildId;
                // eslint-disable-next-line no-undef
                const clientBuildId = __APP_BUILD_ID__;

                // console.log(`[VersionCheck] Client: ${clientBuildId} | Server: ${serverBuildId}`);

                if (serverBuildId && clientBuildId && serverBuildId !== clientBuildId && serverBuildId !== 'local-dev') {
                    // Mismatch Detected!
                    toast((t) => (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span>🚀 New Update Available!</span>
                            <button
                                onClick={() => {
                                    toast.dismiss(t.id);
                                    window.location.reload();
                                }}
                                style={{
                                    padding: '4px 8px',
                                    background: '#2997ff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Refresh
                            </button>
                        </div>
                    ), {
                        duration: Infinity, // Stay until clicked
                        position: 'bottom-right',
                        style: {
                            background: '#0f172a',
                            color: 'white',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }
                    });
                }
            }
        } catch (e) {
            console.error("Version check failed", e);
        }
    };

    useEffect(() => {
        // Run every 5 minutes
        const interval = setInterval(checkForUpdate, 5 * 60 * 1000);

        // Also run on focus (user comes back to tab)
        window.addEventListener('focus', checkForUpdate);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', checkForUpdate);
        };
    }, []);

    return null; // Renderless component
};

export default VersionManager;
