import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null, isFirestoreError: false };
        this.reloadTimer = null;
    }

    static getDerivedStateFromError(error) {
        const message = error?.message || '';
        const isFirestoreError =
            message.includes('INTERNAL ASSERTION FAILED') ||
            message.includes('Unexpected state') ||
            (message.includes('FIRESTORE') && message.includes('INTERNAL'));

        return { hasError: true, isFirestoreError };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });

        const message = error?.message || '';
        const isFirestore =
            message.includes('INTERNAL ASSERTION FAILED') ||
            message.includes('Unexpected state') ||
            (message.includes('FIRESTORE') && message.includes('INTERNAL'));

        if (isFirestore) {
            console.warn('[ErrorBoundary] Firestore SDK error detected. Auto-reloading in 2.5s...');
            this.reloadTimer = setTimeout(() => window.location.reload(), 2500);
        }
    }

    componentWillUnmount() {
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        if (this.state.isFirestoreError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    background: '#0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    gap: '1.5rem',
                    padding: '2rem'
                }}>
                    <div style={{
                        width: '72px', height: '72px', borderRadius: '50%',
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '2px solid rgba(59, 130, 246, 0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
                    }}>⚡</div>
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 700 }}>Reconnecting...</h2>
                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', maxWidth: '380px', lineHeight: 1.6 }}>
                            A real-time database connection was interrupted. The app will automatically reload and reconnect.
                        </p>
                    </div>
                    <div style={{
                        width: '240px', height: '4px', background: 'rgba(255,255,255,0.08)',
                        borderRadius: '2px', overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                            borderRadius: '2px',
                            animation: 'eb_expand 2.5s linear forwards'
                        }} />
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 28px', background: 'rgba(59,130,246,0.15)',
                            border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd',
                            borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500
                        }}
                    >
                        Reload Now
                    </button>
                    <style>{`@keyframes eb_expand { from { width: 0% } to { width: 100% } }`}</style>
                </div>
            );
        }

        // Generic error fallback
        return (
            <div style={{ padding: '2rem', color: 'white', background: '#1a1a1a', minHeight: '100vh' }}>
                <h1>Something went wrong.</h1>
                <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', color: '#fca5a5' }}>
                    {this.state.error && this.state.error.toString()}
                    <br />
                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                </details>
                <button
                    onClick={() => window.location.reload()}
                    style={{ marginTop: '2rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
                >
                    Reload Application
                </button>
            </div>
        );
    }
}

export default ErrorBoundary;
