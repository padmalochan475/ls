// src/utils/whatsappUtils.js

import toast from 'react-hot-toast';

const API_KEY = import.meta.env.VITE_WHATSAPP_API_KEY || 'lams_secure_api_key_2026';

let cachedSessionId = null;

/**
 * Sends a WhatsApp notification to a specific phone number via OpenWA.
 * 
 * @param {string} phoneNumber - The user's phone number
 * @param {string} textMessage - The message content
 * @returns {Promise<boolean>} - Success status
 */
export const sendWhatsAppNotification = async (phoneNumber, textMessage) => {
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries) {
        try {
            if (!phoneNumber) return false;
            
            // Strip everything except numbers
            let formattedNumber = String(phoneNumber).replace(/[^0-9]/g, '');
            
            // Basic validation: Indian numbers are 10 digits. If it's already 12 digits starting with 91, it's fine.
            if (formattedNumber.length === 10) {
                formattedNumber = '91' + formattedNumber;
            } else if (formattedNumber.length < 10) {
                console.warn(`WhatsApp skip: Number too short (${formattedNumber})`);
                return false;
            }

            // WAHA / OpenWA requires the destination to end with @c.us for regular chats
            const chatId = formattedNumber + '@c.us';

            // Point to our dynamic Vercel Serverless Function proxy instead of static Vite/Vercel rewrite
            const proxyUrl = '/api/whatsapp-proxy';
            let sessionId = cachedSessionId;

            // 1. Fetch active sessions to dynamically get the correct session UUID if not cached
            if (!sessionId) {
                const sessionsRes = await fetch(`${proxyUrl}?path=/api/sessions`, {
                    headers: { 'x-api-key': API_KEY }
                });
                const sessions = await sessionsRes.json();
                
                if (!Array.isArray(sessions) || sessions.length === 0) {
                    console.error("No active WhatsApp sessions found on the gateway or unauthorized.", sessions);
                    if (attempt === maxRetries - 1) toast.error(sessions?.message ? `API Auth Error: ${sessions.message}` : "No active WhatsApp sessions available.");
                    return false;
                }
                
                // Use the first active session's UUID and cache it
                sessionId = sessions[0].id;
                cachedSessionId = sessionId;
            }
            
            const endpoint = `${proxyUrl}?path=/api/sessions/${sessionId}/messages/send-text`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'x-api-key': API_KEY 
                },
                body: JSON.stringify({
                    chatId: chatId,
                    text: textMessage
                }),
            });
            
            if(response.ok) {
                console.log("WhatsApp message successfully dispatched!");
                return true;
            } else {
                if (response.status === 400 || response.status === 404 || response.status === 401) {
                    // The session might have expired or gateway restarted, clear cache so we fetch new session next time
                    cachedSessionId = null;
                }
                const data = await response.json().catch(() => ({}));
                const errMsg = data.message || response.statusText || 'Unknown API Error';
                console.warn(`WhatsApp API returned false status (attempt ${attempt + 1}):`, errMsg);
                
                if (attempt === maxRetries - 1) toast.error(`WA API Error: ${response.status} ${errMsg}`);
            }
        } catch (error) {
            console.error(`Failed to ping WhatsApp API server (attempt ${attempt + 1}):`, error);
            if (attempt === maxRetries - 1) toast.error(`Network Error: ${error.message}`);
        }

        attempt++;
        if (attempt < maxRetries) {
            await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
        }
    }
    return false;
};
