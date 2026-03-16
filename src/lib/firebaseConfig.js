// Helper to safely get config values
// Tries Environment Variable first (Best Practice)
// Falls back to "Default Public Config" if Env Var is missing (Robustness)
// Helper to safely process config values
// Clean up values (trim, remove quotes) and fallback to defaults if empty
// Helper to safely process config values
// Clean up values (trim, remove quotes, remove internal whitespace) and fallback to defaults if empty or invalid
const getEnv = (val, defaultValue, validator = null) => {
    if (!val) return defaultValue;

    // Remove start/end quotes and ALL whitespace (newlines, tabs, spaces)
    // eslint-disable-next-line sonarjs/anchor-precedence
    const cleanVal = val.toString().replace(/^["']|["']$/g, '').replace(/\s+/g, '');

    if (cleanVal === '' || cleanVal === 'undefined') {
        return defaultValue;
    }

    // Custom validation (e.g. for API keys)
    if (validator && !validator(cleanVal)) {
        console.warn(`[LAMS] Config Warning: Value starting with "${cleanVal.substring(0, 3)}..." failed validation.`);
        console.warn(`[LAMS] Falling back to default configuration.`);
        return defaultValue;
    }

    return cleanVal;
};

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

export default firebaseConfig;
