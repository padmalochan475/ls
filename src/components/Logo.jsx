import React from 'react';

const Logo = ({ size = 40, iconSize = 24, showText = false }) => {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img 
                src="/logo.png" 
                alt="LAMS Logo" 
                style={{ 
                    width: `${size}px`, 
                    height: `${size}px`,
                    objectFit: 'contain'
                }} 
            />

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
