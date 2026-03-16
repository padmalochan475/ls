// src/utils/whatsappUtils.js

const WHATSAPP_API_URL = 'https://lams-whatsapp-bot.onrender.com/api/sendText';
const API_KEY = process.env.VITE_WHATSAPP_API_KEY || 'lams_local_dev_key_123';

/**
 * Sends a WhatsApp notification to a specific phone number.
 * 
 * @param {string} phoneNumber - The user's phone number
 * @param {string} textMessage - The message content
 * @returns {Promise<boolean>} - Success status
 */
export const sendWhatsAppNotification = async (phoneNumber, textMessage) => {
    try {
        if (!phoneNumber) return false;
        const response = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                number: phoneNumber,
                text: textMessage
            }),
        });
        
        const data = await response.json();
        if(data.status) {
            console.log("WhatsApp message successfully dispatched!");
            return true;
        } else {
            console.warn("WhatsApp API returned false status:", data.message);
            return false;
        }
    } catch (error) {
        console.error("Failed to ping WhatsApp API server:", error);
        return false;
    }
};
