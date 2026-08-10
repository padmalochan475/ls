import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { sendWhatsAppNotification } from './whatsappUtils';
import { getDayName } from './timeUtils';

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
                body,
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
            const vars = { name: userName, title: title || '', body: body || '', ...data };
            
            if (vars.date && !vars.day) {
                vars.day = getDayName(vars.date);
            }
            
            const formatMsg = (key, defaultText) => {
                let str = customTemplates[key] || defaultText;
                for (const [vKey, vVal] of Object.entries(vars)) {
                    str = str.replace(new RegExp(`{${vKey}}`, 'g'), vVal);
                }
                return str;
            };
            
            switch (type) {
                case 'substitution_request':
                    return formatMsg('sys_sub_req', `🔄 *NEW SUBSTITUTION REQUEST* 🔄\n\nHello *${userName}*,\nYou have received a new substitution request!\n\n📝 *Details*:\n${body}\n\n👉 _Please log in to the portal to Accept or Reject._`);
                
                case 'substitution_approved':
                    return formatMsg('sys_sub_app', `✅ *SUBSTITUTION APPROVED!* ✅\n\nGreat news, *${userName}*!\nYour substitution request has been *officially approved*.\n\n📅 *Updated Schedule*:\n${body}\n\n~ *LAMS Admin*`);

                case 'substitution_rejected':
                    return formatMsg('sys_sub_rej', `❌ *SUBSTITUTION DECLINED* ❌\n\nHello *${userName}*,\nUnfortunately, your substitution request has been *declined* or cancelled.\n\nℹ️ *Info*:\n${body}`);

                case 'account_approved':
                    return formatMsg('sys_acc_app', `👋 *WELCOME TO LAMS, ${userName}!* 🎉\n\nYour account has been *successfully approved* by the Administrator! ✅\n\nYou can now log in and manage your classes, labs, and substitutions seamlessly.\n\n🌐 _https://lams.vercel.app_`);

                case 'assignment':
                    return formatMsg('sys_new_assign', `📚 *NEW CLASS ASSIGNMENT* 📚\n\nHello *${userName}*,\n${body}\n\n~ *LAMS Admin*`);

                case 'substitution_accepted':
                    return formatMsg('sys_sub_acc', `🎉 *SUBSTITUTION ACCEPTED!* 🎉\n\nHello *${userName}*,\nYour request has been *accepted* by the target faculty member!\n\n📅 *Updated Schedule*:\n${body}\n\n~ *LAMS Admin*`);

                case 'substitution_cancelled':
                    return formatMsg('sys_sub_can', `⚠️ *SUBSTITUTION CANCELLED* ⚠️\n\nHello *${userName}*,\nA previously requested substitution has been *cancelled*.\n\nℹ️ *Info*:\n${body}`);

                case 'manual':
                case 'manual_alert':
                case 'alert':
                    return `📢 *ADMIN ANNOUNCEMENT* 📢\n\n*${title}*\n${body}\n\n~ *System Broadcast*`;

                case 'raw':
                    return body;

                default:
                    return `🔔 *LAMS NOTIFICATION* 🔔\n\n*${title}*\n${body}\n\n_Check the portal for details._`;
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
                    body,
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
            // Fallbacks
            const fallbacks = {
                obs_sub_app: "🚨 *Admin Alert: Leave Covered* 🚨\n\n*{requesterName}* is on leave on *{day}, {date}*.\n*{subName}* will cover the *{subject}* class for ({group}) at *{time}* in Room *{room}*.",
                obs_sub_can: "⚠️ *Admin Alert: Sub Cancelled* ⚠️\n\nThe substitution arrangement for *{subject}* on *{day}, {date}* at *{time}* in Room *{room}* has been cancelled.",
                obs_bday: "🎉 *Admin Alert: Birthday Today!* 🎉\n\nToday is *{name}'s* birthday! Be sure to wish them!",
                obs_anni: "🎊 *Admin Alert: Work Anniversary!* 🎊\n\n*{name}* is celebrating {years} years with us today!"
            };
            rawTemplate = fallbacks[templateKey] || "System Alert";
        }

        // 3. Format Message
        let finalMessage = rawTemplate;
        
        // Auto-inject day if date exists
        if (templateVars.date && !templateVars.day) {
            templateVars.day = getDayName(templateVars.date);
        }

        for (const [k, v] of Object.entries(templateVars)) {
            finalMessage = finalMessage.replace(new RegExp(`{${k}}`, 'g'), v);
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

