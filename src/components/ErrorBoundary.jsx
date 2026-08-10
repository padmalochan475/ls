import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null, isFirestoreError: false };
        this.reloadTimer = null;
    }

    static getDerivedStateFromError(error) {
        const message = error?.message ? String(error.message) : '';
        const isFirestoreError =
            message.includes('INTERNAL ASSERTION FAILED') ||
            message.includes('Unexpected state') ||
            (message.includes('FIRESTORE') && message.includes('INTERNAL'));

        const isDynamicImportError = message.includes('Failed to fetch dynamically imported module') || 
                                     message.includes('Importing a module script failed') || 
                                     message.includes('Unable to preload CSS');

        return { hasError: true, isFirestoreError, isDynamicImportError };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });

        const message = error?.message ? String(error.message) : '';
        const isFirestore =
            message.includes('INTERNAL ASSERTION FAILED') ||
            message.includes('Unexpected state') ||
            (message.includes('FIRESTORE') && message.includes('INTERNAL'));

        if (isFirestore) {
            console.warn('[ErrorBoundary] Firestore SDK error detected. Auto-reloading in 2.5s...');
            this.reloadTimer = setTimeout(() => window.location.reload(), 2500);
        }
        
        const isDynamicImportError = message.includes('Failed to fetch dynamically imported module') || 
                                     message.includes('Importing a module script failed') ||
                                     message.includes('Unable to preload CSS');
        if (isDynamicImportError) {
            console.warn('[ErrorBoundary] Dynamic import error detected. Forcing hard reload...');
            
            // 1. Unregister all Service Workers immediately
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) {
                        registration.unregister();
                    }
                });
            }

            // 2. Clear all Caches
            if ('caches' in window) {
                caches.keys().then((names) => {
                    for (let name of names) {
                        caches.delete(name);
                    }
                });
            }

            // 3. Clear Session Storage loop preventer just in case it's stuck
            sessionStorage.removeItem('vite_hmr_reloaded');

            // 4. Force a hard reload with a cache-busting query parameter
            setTimeout(() => {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('v', Date.now().toString());
                window.location.href = currentUrl.toString();
            }, 500);
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
