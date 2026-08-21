import { useEffect, useRef } from 'react';

/**
 * useDynamicListener
 * A hook to centrally manage Firebase listener lifecycles.
 * - Injects an `isActiveRef` to prevent state updates on unmounted components.
 * - Automatically suspends the listener if the browser tab is hidden for >30s (conserves quota).
 * - Reconnects instantly when the user returns to the tab.
 * 
 * @param {Function} subscribeFn - Function that starts the listener and returns the unsubscribe function. Receives `isActiveRef` as an argument.
 * @param {Array} dependencies - The dependency array that dictates when the listener should completely restart (like useEffect).
 * @param {Object} options - Configuration options.
 */
export const useDynamicListener = (subscribeFn, dependencies = [], options = {}) => {
    const { suspendOnHidden = true, suspendDelayMs = 30000, enabled = true } = options;
    
    const isActiveRef = useRef(true);
    const unsubRef = useRef(null);
    const suspendTimeoutRef = useRef(null);

    const cleanup = () => {
        if (unsubRef.current) {
            unsubRef.current();
            unsubRef.current = null;
        }
    };

    const startListening = () => {
        cleanup();
        if (!enabled) return;
        
        isActiveRef.current = true;
        const unsub = subscribeFn(isActiveRef);
        if (typeof unsub === 'function') {
            unsubRef.current = unsub;
        }
    };

    useEffect(() => {
        if (!enabled) {
            cleanup();
            return;
        }

        isActiveRef.current = true;
        startListening();

        const handleVisibilityChange = () => {
            if (!suspendOnHidden) return;
            
            if (document.visibilityState === 'visible') {
                if (suspendTimeoutRef.current) {
                    clearTimeout(suspendTimeoutRef.current);
                    suspendTimeoutRef.current = null;
                } else {
                    startListening();
                }
            } else {
                suspendTimeoutRef.current = setTimeout(() => {
                    cleanup();
                    suspendTimeoutRef.current = null;
                }, suspendDelayMs);
            }
        };

        if (suspendOnHidden) {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            isActiveRef.current = false;
            cleanup();
            if (suspendTimeoutRef.current) clearTimeout(suspendTimeoutRef.current);
            if (suspendOnHidden) {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
        // SUPPRESSION REASON: This is a wrapper around useEffect. The `dependencies` array is intentionally passed dynamically from the caller to control lifecycle (exactly like useEffect). The lint rule only supports static array literals and cannot statically analyze dynamic spreads. This is architecturally required and safe provided callers construct their dependency arrays correctly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...dependencies, enabled, suspendOnHidden, suspendDelayMs]);

    return isActiveRef;
};
