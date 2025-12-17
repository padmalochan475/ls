import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Initialize Firebase Admin SDK
// IMPORTANT: This uses Environment Variables for security.
// In Vercel, you must set FIREBASE_SERVICE_ACCOUNT (JSON string) or individual fields.

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT environment variable');
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Prevent multiple initializations in serverless environment
const apps = initializeApp({
    credential: cert(serviceAccount)
}, 'serverless-worker');

const db = getFirestore(apps);
const messaging = getMessaging(apps);

/**
 * Vercel Serverless Function
 * This function will be triggered by Cron-Job.org every minute.
 */
export default async function handler(request, response) {
    // Basic Auth to prevent unauthorized triggering
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return response.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    // Assuming IST for now, or use timezone aware libraries
    // Vercel server time is usually UTC. 
    // We can shift it to IST (+5:30) for calculation.
    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(now.getTime() + istOffset);

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[nowIST.getDay()];

    console.log(`Checking schedule for ${currentDay} at ${nowIST.toISOString()}`);

    try {
        const scheduleRef = db.collection('schedule');
        const snapshot = await scheduleRef.where('day', '==', currentDay).get(); // Note: get() in Admin SDK returns QuerySnapshot

        if (snapshot.empty) return response.status(200).json({ message: 'No classes today' });

        const notifications = [];

        snapshot.forEach(doc => {
            const cls = doc.data();
            if (!cls.time || !cls.academicYear) return;

            // Time Parsing
            const [startStr] = cls.time.split(' - ');
            const [time, modifier] = startStr.split(' ');
            let [h, m] = time.split(':').map(Number);
            if (modifier === 'PM' && h < 12) h += 12;
            if (modifier === 'AM' && h === 12) h = 0;

            const classTime = new Date(nowIST); // Use current date
            classTime.setHours(h, m, 0, 0);

            const diffMs = classTime.getTime() - nowIST.getTime();
            const diffMins = diffMs / 1000 / 60;

            // Target window: 14 to 15.5 minutes
            if (diffMins >= 14 && diffMins <= 15.5) {
                notifications.push(cls);
            }
        });

        if (notifications.length === 0) {
            return response.status(200).json({ message: 'No upcoming classes found' });
        }

        // Send Notifications
        const results = await Promise.all(notifications.map(async (cls) => {
            const empIds = [cls.facultyEmpId, cls.faculty2EmpId].filter(Boolean);
            if (empIds.length === 0) return null;

            // Get Users
            const usersSnap = await db.collection('users').where('empId', 'in', empIds).get();
            const tokens = [];
            usersSnap.forEach(doc => {
                const startData = doc.data();
                if (startData.fcmTokens) tokens.push(...startData.fcmTokens);
            });

            if (tokens.length === 0) return null;
            const uniqueTokens = [...new Set(tokens)];

            const message = {
                notification: {
                    title: `Upcoming Class: ${cls.subject}`,
                    body: `Class starts in 15 mins! Venue: ${cls.room}`
                },
                tokens: uniqueTokens
            };

            const result = await messaging.sendMulticast(message);
            return { subject: cls.subject, successCount: result.successCount };
        }));

        return response.status(200).json({
            message: 'Notifications processed',
            details: results.filter(Boolean)
        });

    } catch (error) {
        console.error('Error in cron job:', error);
        return response.status(500).json({ error: error.message });
    }
}
