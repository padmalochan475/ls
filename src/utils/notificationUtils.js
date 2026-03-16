import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { sendWhatsAppNotification } from './whatsappUtils';

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

        // 2. Add to In-App Notification History (Firestore)
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
        await Promise.all(historyPromises);

        // 3. WHATSAPP INTEGRATION (Dynamic Template Engine)
        const getWhatsAppTemplate = (profile) => {
            const userName = profile.name || 'Faculty';
            
            switch (type) {
                case 'substitution_request':
                    return `🔄 *Substitution Request* 🔄\n\nHello *${userName}*,\nYou have received a new substitution request.\n\n📝 *Details*:\n${body}\n\n👉 _Log in to the portal to Accept or Reject._`;
                
                case 'substitution_approved':
                    return `✅ *Substitution Approved* ✅\n\nGood news *${userName}*,\nYour substitution has been *Approved*.\n\n📅 *Updated Schedule*:\n${body}\n\n_System Admin_`;

                case 'substitution_rejected':
                    return `❌ *Substitution Request Status* ❌\n\nHello *${userName}*,\nA substitution request has been *Rejected* or cancelled.\n\nℹ️ *Info*:\n${body}`;

                case 'account_approved':
                    return `👋 *Welcome to LAMS, ${userName}!* 🎉\n\nYour account has been *Approved* by the Administrator.\n\nYou can now log in and manage your classes, labs, and substitutions.\n\n🌐 _https://lams.vercel.app_`;

                case 'substitution_accepted':
                    return `🎉 *Substitution Request Confirmed* 🎉\n\nHello *${userName}*,\nYour request has been *Accepted* by the target faculty member.\n\n📅 *Schedule Updated*:\n${body}\n\n_System Admin_`;

                case 'substitution_cancelled':
                    return `⚠️ *Substitution Cancelled* ⚠️\n\nHello *${userName}*,\nA previously requested substitution has been *Cancelled*.\n\nℹ️ *Info*:\n${body}`;

                case 'manual':
                case 'manual_alert':
                case 'alert':
                    return `📢 *Admin Announcement* 📢\n\n*${title}*\n${body}\n\n_System Broadcast_`;

                default:
                    return `🔔 *LAMS Notification* 🔔\n\n*${title}*\n${body}\n\n_Check the portal for details._`;
            }
        };

        const whatsappPromises = targetUids.map(async (uid) => {
            try {
                const userSnap = await getDoc(doc(db, 'users', uid));
                if (userSnap.exists()) {
                    const profile = userSnap.data();
                    if (profile.mobile && profile.whatsappEnabled !== false) {
                        const waMessage = getWhatsAppTemplate(profile);
                        return sendWhatsAppNotification(profile.mobile, waMessage);
                    }
                }
            } catch (err) {
                console.warn(`WhatsApp skip for ${uid}:`, err.message);
            }
            return null;
        });
        // We don't await all WhatsApp calls to block the flow, but we initiate them
        Promise.all(whatsappPromises).catch(err => console.error("WhatsApp Bulk Error:", err));

        // 4. Send Push Notification via Serverless API
        let pushStatus = "skipped";

        if (import.meta.env.DEV) {
            console.log(`[DEV] Mocking Push Notification: "${title}" to ${targetUids.length} users.`);
            pushStatus = "dev_mock_success";
        } else {
            try {
                const apiRes = await fetch('/api/send-notification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-secret-key': import.meta.env.VITE_LAMS_SECRET || 'lams_secure_notification_v1'
                    },
                    body: JSON.stringify({
                        targetUids,
                        targetType: 'external_id',
                        title,
                        body,
                        data: { ...data, type }
                    })
                });

                if (apiRes.ok) pushStatus = "sent";
                else console.warn("Push API Warning:", await apiRes.text());
            } catch (err) {
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
