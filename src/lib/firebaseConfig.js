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
    // We add length validation for API Key (approx 39 chars) to filter out garbage vars
    apiKey: getEnv(import.meta.env.VITE_FIREBASE_API_KEY, "AIzaSyDwGYhgu3Hx_Fdycq3-6tfKNTPYXVZV5ck", (v) => v.startsWith("AIza") && v.length > 30),
    authDomain: getEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "lams-59998.firebaseapp.com"),
    projectId: getEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID, "lams-59998"),
    storageBucket: getEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, "lams-59998.firebasestorage.app"),
    messagingSenderId: getEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, "250431971958"),
    appId: getEnv(import.meta.env.VITE_FIREBASE_APP_ID, "1:250431971958:web:aa4db54237825bcd0f7557"),
    measurementId: getEnv(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, "G-0HN1E0VMRS")
};

export default firebaseConfig;
