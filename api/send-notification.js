/* eslint-env node */
import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 🔒 SECURITY: Shared Secret Check
    const SECURITY_KEY = process.env.LAMS_SECRET;

    if (req.headers['x-secret-key'] !== SECURITY_KEY) {
        console.warn("Unauthorized API Access Attempt");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log("API: send-notification (OneSignal) called.");
        const { targetUids, title, body, data, targetType } = req.body;

        // Configuration (Dynamic from Env)
        const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
        const ONE_SIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

        if (targetUids !== 'ALL' && (!targetUids || !Array.isArray(targetUids) || targetUids.length === 0)) {
            console.log("No targets provided.");
            return res.status(200).json({ success: false, successCount: 0, failureCount: 0 });
        }

        console.log(`Sending OneSignal Push to ${targetUids === 'ALL' ? 'ALL USERS' : targetUids.length + ' IDs'} (${targetType || 'auto'})`);

        let payload = {
            app_id: ONE_SIGNAL_APP_ID,
            target_channel: "push",
            contents: { en: body },
            chrome_web_icon: data?.icon || "https://cdn-icons-png.flaticon.com/512/2522/2522055.png",
            headings: { en: title },
            data: data || {},
            url: data?.url || req.body.url || "https://lams.vercel.app",
            priority: 10,
            android_visibility: 1, // Public on lock screen
            renotify: true, // Play sound/vibrate 
            android_group: "lams_manual",
            android_group_message: { en: "$[notif_count] New Updates" },
            buttons: req.body.buttons || data?.buttons || [{ id: 'view', text: 'Open App' }]
        };

        if (targetUids === 'ALL') {
            payload.included_segments = ["Total Subscriptions"];
        } else if (targetType === 'player_id') {
            // Direct Targeting (Reliable)
            payload.include_player_ids = targetUids;
            // V1 API parameter for player_ids doesn't use channel usually, but safe to keep or remove.
            // include_player_ids implies push or email based on the ID, but for web push it's standard.
        } else {
            // Default to Alias
            payload.include_aliases = { "external_id": targetUids };
        }

        // OneSignal API v1
        const response = await axios.post('https://onesignal.com/api/v1/notifications', payload, {
            headers: {
                "Authorization": `Basic ${ONE_SIGNAL_API_KEY}`,
                "Content-Type": "application/json"
            }
        });

        console.log("OneSignal Response:", response.data);
        return res.status(200).json({
            success: true,
            id: response.data.id,
            recipients: response.data.recipients,
            errors: response.data.errors, // Explicitly return errors
            full_response: response.data
        });

    } catch (error) {
        console.error('OneSignal API Error:', error.response?.data || error.message);

        // Handle "No subscribers" error gracefully
        if (error.response?.data?.errors?.includes("All included players are not subscribed")) {
            return res.status(200).json({ success: false, successCount: 0, failureCount: 1, message: "User not subscribed yet" });
        }

        return res.status(500).json({
            error: 'Internal Server Error',
            details: error.response?.data || error.message
        });
    }
}
