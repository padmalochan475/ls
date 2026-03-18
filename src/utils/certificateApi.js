import toast from 'react-hot-toast';

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMCyjLtnntgDjHXD97bEBzND_y3O7_D_AF-WlSOxWOjW3lpbbZWL2MqgG-CUK1shooDQ/exec"; // SET YOUR DEPLOYED URL HERE

export const certApi = {
    async call(action, data = {}) {
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
            return { success: false, error: err.toString() };
        }
    },

    // Standard Dashboard Data
    getAdminDashboard: () => certApi.call('getAdminData'),
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
