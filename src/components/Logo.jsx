import React from 'react';
import { Monitor, FlaskConical } from 'lucide-react';

const Logo = ({ size = 40, iconSize = 24, showText = false }) => {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
                width: `${size}px`,
                height: `${size}px`,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', // Blue to Purple gradient
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5), 0 8px 10px -6px rgba(59, 130, 246, 0.1)', // Deep colored shadow
                transform: 'perspective(500px) rotateX(10deg) rotateY(-10deg)', // 3D tilt
                transition: 'transform 0.3s ease',
                border: '1px solid rgba(255,255,255,0.2)'
            }}
                className="premium-3d-logo"
            >
                {/* Main Icon: Monitor */}
                <Monitor size={iconSize} color="white" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />

                {/* Overlay Icon: Lab/Flask (Small, floating) */}
                <div style={{
                    position: 'absolute',
                    bottom: '-4px',
                    right: '-4px',
                    background: '#10b981', // Emerald green
                    borderRadius: '50%',
                    padding: '3px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <FlaskConical size={iconSize * 0.5} color="white" strokeWidth={3} />
                </div>
            </div>

            {showText && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h1 style={{
                        fontSize: '1.25rem',
                        fontWeight: '800',
                        margin: 0,
                        lineHeight: 1,
                        background: 'linear-gradient(to right, #fff, #bfdbfe)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.02em'
                    }}>
                        LAMS
                    </h1>
                </div>
            )}
            <style>{`
                .premium-3d-logo:hover {
                    transform: perspective(500px) rotateX(0deg) rotateY(0deg) scale(1.05) !important;
                }
            `}</style>
        </div>
    );
};

export default Logo;
