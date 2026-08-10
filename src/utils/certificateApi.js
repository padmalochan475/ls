import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

let cachedApiUrl = null;

const getApiUrl = async () => {
    if (cachedApiUrl) return cachedApiUrl;
    try {
        const snap = await getDoc(doc(db, 'settings', 'config'));
        if (snap.exists() && snap.data().certApiUrl) {
            cachedApiUrl = snap.data().certApiUrl;
            return cachedApiUrl;
        }
    } catch (e) {
        console.warn("Could not fetch dynamic certApiUrl.", e);
    }
    return null;
};

export const certApi = {
    async call(action, data = {}) {
        const APPS_SCRIPT_URL = await getApiUrl();
        if (!APPS_SCRIPT_URL) return { success: false, error: "API_NOT_CONFIGURED" };
        try {
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                redirect: 'follow',
                body: JSON.stringify({ action, ...data }),
                headers: { 'Content-Type': 'text/plain' }
            });
            const res = await response.json();
            if (res.error && res.error.includes("CONFLICT")) {
                toast.error(res.error.replace("CONFLICT: ", ""));
                return { success: false, error: res.error, isConflict: true };
            }
            return res;
        } catch (err) {
            if (err.message === 'Failed to fetch') {
                return { success: false, error: "Cannot connect to server. Please check your Google Apps Script Deployment URL." };
            }
            return { success: false, error: err.toString() };
        }
    },

    // Standard Dashboard Data
    getAdminDashboard: (noCache = false) => certApi.call('getAdminData', { noCache }),
    getBranches: () => certApi.call('getBranches'),
    submitApplication: (data) => certApi.call('submitRequest', { data }),
    updateStatus: (id, status, refNo, certData, lastKnownTimestamp) => 
        certApi.call('updateStatus', { id, status, refNo, certData, lastKnownTimestamp }),
    deleteRequest: (id) => certApi.call('deleteRequest', { id }),

    // GENERIC CRUD (Future Proofing)
    listSheets: () => certApi.call('listSheets'),
    getSheetData: (sheetName) => certApi.call('getSheetData', { sheetName }),
    saveGenericRow: (sheetName, rowId, data) => certApi.call('saveGenericRow', { sheetName, rowId, data }),
    deleteGenericRow: (sheetName, rowId) => certApi.call('deleteGenericRow', { sheetName, rowId }),
    saveSetting: (key, value) => certApi.call('saveSetting', { key, value }),
    bulkUpdateStatus: (ids, status) => certApi.call('bulkUpdateStatus', { ids, status }),
    runDiagnostics: () => certApi.call('runDiagnostics'),
    getAuditLogs: () => certApi.call('getAuditLogs')
};
