
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Sends notifications (In-App + Push) to users.
 * 
 * @param {Object} params
 * @param {string[]} [params.userIds] - Array of Firebase Auth UIDs to target.
 * @param {string[]} [params.empIds] - Array of Employee IDs to resolve to UIDs and target.
 * @param {string} params.title - Notification Title.
 * @param {string} params.body - Notification Body.
 * @param {string} [params.type='info'] - Notification Type (e.g., 'assignment', 'alert').
 * @param {Object} [params.data={}] - Additional data payload.
 * @returns {Promise<{success: boolean, count: number, message?: string}>}
 */
export const sendNotification = async ({
    userIds = [],
    empIds = [],
    title,
    body,
    type = 'info',
    data = {}
}) => {
    try {
        let targetUids = [...userIds];

        // 1. Resolve EmpIDs to UIDs
        if (empIds.length > 0) {
            // Process sequentially to be safe with Firestore limits/logic
            for (const empId of empIds) {
                if (!empId) continue;
                // Query by empId to get the UID (doc.id)
                const q = query(collection(db, 'users'), where('empId', '==', empId));
                const snap = await getDocs(q);
                snap.forEach(doc => {
                    targetUids.push(doc.id);
                });
            }
        }

        // Deduplicate UIDs
        targetUids = [...new Set(targetUids)];

        if (targetUids.length === 0) {
            console.warn("sendNotification: No valid users found to target.");
            return { success: false, message: 'No valid users found' };
        }

        // 2. Add to In-App Notification History (Firestore) - RELIABLE
        // We write strict "serverTimestamp()" for consistency
        const historyPromises = targetUids.map(uid =>
            addDoc(collection(db, 'users', uid, 'notifications'), {
                title,
                body,
                type,
                read: false,
                createdAt: serverTimestamp(),
                ...data
            })
        );

        // Wait for Firestore writes to ensure data consistency
        await Promise.all(historyPromises);

        // 3. Send Push Notification via Serverless API (Conditional)
        let pushStatus = "skipped";

        // 🛡️ DEV MODE BYPASS: Prevent "develop issues" by skipping external API calls locally
        if (import.meta.env.DEV) {
            console.log(`[DEV] Mocking Push Notification: "${title}" to ${targetUids.length} users.`);
            console.log("To test real push, use a tailored 'npm run build && npm run preview' or deploy.");
            pushStatus = "dev_mock_success";
        } else {
            // PRODUCTION: Attempt sending, but treat as non-fatal enhancement
            try {
                // Uses 'external_id' targeting strategy (Firebase UID mapping)
                const apiRes = await fetch('/api/send-notification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-secret-key': 'lams_secure_notification_v1'
                    },
                    body: JSON.stringify({
                        targetUids,
                        targetType: 'external_id',
                        title,
                        body,
                        data: {
                            ...data,
                            type // Ensure type is passed in data payload for client handlers
                        }
                    })
                });

                if (apiRes.ok) pushStatus = "sent";
                else console.warn("Push API Warning:", await apiRes.text());

            } catch (err) {
                // Network error or blocked
                console.error("Push Notification API Error (Non-Fatal):", err);
                pushStatus = "failed";
            }
        }

        return { success: true, count: targetUids.length, pushStatus };

    } catch (error) {
        console.error("sendNotification Utility Error:", error);
        return { success: false, message: error.message };
    }
};
