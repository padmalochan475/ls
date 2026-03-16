import React from 'react';
import { FlaskConical } from 'lucide-react';

const QuantumLoader = ({ size }) => {
    // If size is provided, render inline spinner version
    if (size) {
        return (
            <div
                className="quantum-spinner"
                style={{
                    position: 'relative',
                    width: size,
                    height: size,
                    display: 'inline-block',
                    verticalAlign: 'middle'
                }}
            >
                <div className="orbit orbit-1" style={{ borderTopColor: 'currentColor' }}></div>
                <div className="orbit orbit-2" style={{ borderBottomColor: 'currentColor', opacity: 0.7 }}></div>

                <style>{`
                    .quantum-spinner .orbit {
                        position: absolute;
                        border: 2px solid transparent;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    .quantum-spinner .orbit-1 {
                        inset: 0;
                        border-top-color: currentColor;
                    }
                    .quantum-spinner .orbit-2 {
                        inset: 2px;
                        border-bottom-color: currentColor;
                        animation-direction: reverse;
                        animation-duration: 1.5s;
                    }
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    // Default Full Screen Overlay
    return (
        <div className="premium-loader-container">
            {/* Background Moving Aurora */}
            <div className="aurora-bg"></div>

            {/* Central Content */}
            <div className="loader-core">
                {/* Orbital Rings */}
                <div className="orbit orbit-1"></div>
                <div className="orbit orbit-2"></div>

                {/* Floating Glass Icon */}
                <div className="glass-prism">
                    <FlaskConical size={48} className="beaker-icon" />
                    <div className="prism-shine"></div>
                </div>
            </div>

            {/* Typography */}
            <div className="text-container">
                <h1 className="brand-title">LAMS 2.0</h1>
                <div className="loading-status">
                    <span className="dot"></span> INITIALIZING SYSTEM
                </div>
            </div>

            <style>{`
/* Container & Aurora */
.premium-loader-container {
    position: fixed;
    inset: 0;
    background: #050505;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    font-family: 'Inter', sans-serif;
    overflow: hidden;
}

.aurora-bg {
    position: absolute;
    inset: -50%;
    background: radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.08), transparent 60%),
        radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.08), transparent 40%);
    animation: rotate-bg 20s linear infinite;
    z-index: 0;
}

/* Core Composition */
.loader-core {
    position: relative;
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 2.5rem;
}

/* Orbits */
.orbit {
    position: absolute;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.1);
}

.orbit-1 {
    width: 100%;
    height: 100%;
    border-top-color: rgba(56, 189, 248, 0.8);
    animation: spin 3s linear infinite;
}

.orbit-2 {
    width: 80%;
    height: 80%;
    border-bottom-color: rgba(139, 92, 246, 0.8);
    animation: spin-reverse 4s linear infinite;
}

/* Glass Prism */
.glass-prism {
    width: 64px;
    height: 64px;
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 30px rgba(56, 189, 248, 0.2);
    animation: float 4s ease-in-out infinite;
    position: relative;
    overflow: hidden;
}

.beaker-icon {
    color: white;
    filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.8));
}

.prism-shine {
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    transform: rotate(45deg);
    animation: shine 4s ease-in-out infinite;
}

/* Text */
.brand-title {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    background: linear-gradient(to right, #fff, #94a3b8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin: 0;
    text-transform: uppercase;
    text-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
}

.loading-status {
    margin-top: 0.5rem;
    color: #64748b;
    font-size: 0.75rem;
    letter-spacing: 0.3em;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
}

.dot {
    width: 6px;
    height: 6px;
    background: #38bdf8;
    border-radius: 50%;
    box-shadow: 0 0 10px #38bdf8;
    animation: pulse-dot 1s infinite;
}

/* Animations */
@keyframes spin {
    100% {
        transform: rotate(360deg);
    }
}

@keyframes spin-reverse {
    100% {
        transform: rotate(-360deg);
    }
}

@keyframes float {

    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-5px);
    }
}

@keyframes shine {
    0% {
        left: -100%;
        top: -100%;
    }

    20% {
        left: 100%;
        top: 100%;
    }

    100% {
        left: 100%;
        top: 100%;
    }
}

@keyframes rotate-bg {
    100% {
        transform: rotate(360deg);
    }
}

@keyframes pulse-dot {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.3;
    }
}
            `}</style>
        </div>
    );
};

export default QuantumLoader;
