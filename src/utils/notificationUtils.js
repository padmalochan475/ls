import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { sendWhatsAppNotification } from './whatsappUtils';
import { getDayName } from './timeUtils';
import { defaultTemplates } from './defaultTemplates';

/**
 * Sends notifications (In-App + Push + WhatsApp) to users.
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
        let processedBody = body ? String(body) : '';
        processedBody = processedBody.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, y, m, d) => {
            const dayName = getDayName(match);
            return `${d}-${m}-${y} (${dayName})`;
        });

        let targetUids = [...userIds];

        // 1. Resolve EmpIDs to UIDs
        if (empIds.length > 0) {
            for (const empId of empIds) {
                if (!empId) continue;
                const q = query(collection(db, 'users'), where('empId', '==', empId));
                const snap = await getDocs(q);
                snap.forEach(doc => {
                    targetUids.push(doc.id);
                });
            }
        }

        targetUids = [...new Set(targetUids)];

        if (targetUids.length === 0) {
            console.warn("sendNotification: No valid users found to target.");
            return { success: false, message: 'No valid users found' };
        }

        // 2. Add to In-App Notification History (Firestore) using Batches for scalability
        const { writeBatch } = await import('firebase/firestore');
        const batchArray = [];
        let currentBatch = writeBatch(db);
        let operationCounter = 0;

        for (const uid of targetUids) {
            const notifRef = doc(collection(db, 'users', uid, 'notifications'));
            currentBatch.set(notifRef, {
                title,
                body: processedBody,
                type,
                read: false,
                createdAt: serverTimestamp(),
                ...data
            });
            operationCounter++;

            if (operationCounter === 450) {
                batchArray.push(currentBatch.commit());
                currentBatch = writeBatch(db);
                operationCounter = 0;
            }
        }
        if (operationCounter > 0) {
            batchArray.push(currentBatch.commit());
        }
        await Promise.all(batchArray);

        // 3. WHATSAPP INTEGRATION (Dynamic Template Engine)
        let customTemplates = {};
        try {
            const tplSnap = await getDoc(doc(db, 'settings', 'templates'));
            if (tplSnap.exists()) {
                customTemplates = tplSnap.data();
            }
        } catch (err) {
            console.error("Failed to load templates for notification", err);
        }

        const getWhatsAppTemplate = (profile) => {
            const userName = profile.name || 'Faculty';
            const vars = { name: userName, title: title || '', body: processedBody, ...data };
            
            if (vars.date) {
                if (!vars.day) {
                    vars.day = getDayName(vars.date);
                }
                const parts = String(vars.date).split('-');
                if (parts.length === 3 && parts[0].length === 4) {
                    vars.date = `${parts[2]}-${parts[1]}-${parts[0]} (${vars.day})`;
                }
            }
            
            vars.cofacInline = vars.faculty2 ? ` (w/ ${vars.faculty2})` : '';
            vars.cofacStr = vars.faculty2 ? `\n🤝 *Co-Faculty:* ${vars.faculty2}` : '';
            
            const formatMsg = (key, defaultText) => {
                let str = customTemplates[key] || defaultText;
                str = str.replace(/\{day\}[^a-zA-Z0-9_\{]*\{date\}/g, '{date}');
                str = str.replace(/\{date\}[^a-zA-Z0-9_\{]*\{day\}/g, '{date}');
                for (const [vKey, vVal] of Object.entries(vars)) {
                    str = str.replace(new RegExp(`\\{${vKey}\\}`, 'g'), () => vVal);
                }
                return str;
            };
            
            switch (type) {
                case 'substitution_request':
                    return formatMsg('sys_sub_req', defaultTemplates['sys_sub_req']);
                
                case 'substitution_approved':
                    return formatMsg('sys_sub_app', defaultTemplates['sys_sub_app']);

                case 'substitution_rejected':
                    return formatMsg('sys_sub_rej', defaultTemplates['sys_sub_rej']);

                case 'account_approved':
                    return formatMsg('sys_acc_app', defaultTemplates['sys_acc_app']);

                case 'assignment':
                    return formatMsg('sys_new_assign', defaultTemplates['sys_new_assign']);

                case 'substitution_accepted':
                    return formatMsg('sys_sub_acc', defaultTemplates['sys_sub_acc']);

                case 'substitution_cancelled':
                    return formatMsg('sys_sub_can', defaultTemplates['sys_sub_can']);

                case 'substitution_cancelled_sub':
                    return formatMsg('sys_sub_can_sub', defaultTemplates['sys_sub_can_sub']);

                case 'substitution_request_cancelled':
                    return formatMsg('sys_req_can', defaultTemplates['sys_req_can']);

                case 'manual':
                case 'manual_alert':
                case 'alert':
                    return formatMsg('sys_alert', defaultTemplates['sys_alert']);

                case 'raw':
                    return processedBody;

                default:
                    return `🔔 *LAMS NOTIFICATION* 🔔\n\n*${title}*\n${processedBody}\n\n_Check the portal for details._`;
            }
        };

        // SAFETY LOCK: Prevent browser freeze and WhatsApp Bot DDOS on massive broadcasts
        let waSuccessCount = 0;
        if (targetUids.length <= 25) {
            for (const uid of targetUids) {
                try {
                    const userSnap = await getDoc(doc(db, 'users', uid));
                    if (userSnap.exists()) {
                        const profile = userSnap.data();
                        if (profile.mobile && profile.whatsappEnabled !== false) {
                            const waMessage = getWhatsAppTemplate(profile);
                            const success = await sendWhatsAppNotification(profile.mobile, waMessage);
                            if (success) waSuccessCount++;
                            
                            // Sleep 200ms to simulate human-like typing and prevent gateway rate-limits
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                } catch (err) {
                    console.warn(`WhatsApp skip for ${uid}:`, err.message);
                }
            }
        } else {
            console.log(`Skipping WhatsApp to protect bot from rate limits. Target size: ${targetUids.length}`);
        }

        // 4. Send Push Notification via Serverless API
        let pushStatus = "skipped";

        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const apiRes = await fetch(`${apiUrl}/api/send-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': auth.currentUser ? `Bearer ${await auth.currentUser.getIdToken()}` : ''
                },
                body: JSON.stringify({
                    targetUids,
                    targetType: 'external_id',
                    title,
                    body: processedBody,
                    data: { ...data, type }
                })
            });

            if (apiRes.ok) {
                const responseData = await apiRes.json();
                if (responseData.success) {
                    pushStatus = "sent";
                } else {
                    console.warn("Push API Warning:", responseData.message || "Failed to send to any tokens.");
                    pushStatus = "no_devices";
                }
            } else {
                console.warn("Push API Error:", await apiRes.text());
                pushStatus = "failed";
            }
        } catch (err) {
            console.error("Push Notification API Error (Non-Fatal):", err);
            pushStatus = "failed";
        }

        // We use pushStatus to determine the overall success logic for the toast UI
        if (pushStatus === "no_devices" && waSuccessCount === 0) {
            return { success: false, count: 0, pushStatus, waSuccessCount, message: "Target users have no push devices registered, and WhatsApp delivery failed or was skipped." };
        }
        if (pushStatus === "failed" && waSuccessCount === 0) {
            return { success: false, count: 0, pushStatus, waSuccessCount, message: "Server error while sending push, and WhatsApp delivery failed." };
        }

        return { success: true, count: targetUids.length, pushStatus, waSuccessCount };

    } catch (error) {
        console.error("sendNotification Utility Error:", error);
        return { success: false, message: error.message };
    }
};

/**
 * Helper to fetch Observer Group and send them an automated template message.
 */
export const sendToObservers = async (templateKey, templateVars) => {
    try {
        // 1. Get Observer Group IDs
        const notifSnap = await getDoc(doc(db, 'settings', 'notifications'));
        if (!notifSnap.exists()) return;
        const observerGroupIds = notifSnap.data().observerGroupIds || [];
        if (observerGroupIds.length === 0) return;

        // 2. Get Template
        const templateSnap = await getDoc(doc(db, 'settings', 'templates'));
        let rawTemplate = '';
        if (templateSnap.exists() && templateSnap.data()[templateKey]) {
            rawTemplate = templateSnap.data()[templateKey];
        } else {
            // Use shared defaultTemplates as single source of truth
            rawTemplate = defaultTemplates[templateKey] || "System Alert";
        }

        // 3. Format Message
        let finalMessage = rawTemplate;
        
        // Auto-inject day if date exists
        if (templateVars.date) {
            if (!templateVars.day) {
                templateVars.day = getDayName(templateVars.date);
            }
            const parts = String(templateVars.date).split('-');
            if (parts.length === 3 && parts[0].length === 4) {
                templateVars.date = `${parts[2]}-${parts[1]}-${parts[0]} (${templateVars.day})`;
            }
        }
        
        templateVars.cofacInline = templateVars.faculty2 ? ` (w/ ${templateVars.faculty2})` : '';
        templateVars.cofacStr = templateVars.faculty2 ? `\n👥 _Cofaculty:_ ${templateVars.faculty2}` : '';

        finalMessage = finalMessage.replace(/\{day\}[^a-zA-Z0-9_\{]*\{date\}/g, '{date}');
        finalMessage = finalMessage.replace(/\{date\}[^a-zA-Z0-9_\{]*\{day\}/g, '{date}');

        for (const [k, v] of Object.entries(templateVars)) {
            finalMessage = finalMessage.replace(new RegExp(`\\{${k}\\}`, 'g'), () => v);
        }

        // 4. Send via raw channel
        await sendNotification({
            userIds: observerGroupIds,
            title: "Admin Alert",
            body: finalMessage, 
            type: 'raw',
            data: { type: 'observer_alert' }
        });

    } catch (e) {
        console.error("sendToObservers failed:", e);
    }
};

