/* eslint-env node */
import admin from 'firebase-admin';
import axios from 'axios';

// Initialize Firebase Admin (Singleton)
if (!admin.apps.length) {
    try {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
            : null;

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        } else {
            console.warn("FIREBASE_SERVICE_ACCOUNT env var missing. Notifications will fail.");
        }
    } catch (e) {
        console.error("Firebase Admin Init Error:", e);
    }
}

const db = admin.firestore();

// OneSignal Config (Dynamic from Env)
const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "6764f541-4220-4ffd-85d2-6660b86d5a48";
const ONE_SIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY || "os_v2_app_m5spkqkcebh73bosmzqlq3k2jbg2vlaf5qmuwmurufnife2zoxh52xfshmyaedy3z2i4iojios5kh37dj4x4azvlgwxrlga64lrsgey";

async function sendOneSignal(target, title, body, data, targetType = 'external_id', options = {}) {
    if (!target) return false;
    if (Array.isArray(target) && target.length === 0) return false;

    try {
        console.log(`Sending OneSignal... Target: ${Array.isArray(target) ? target.length + ' IDs' : target} (${targetType})`);

        let payload = {
            app_id: ONE_SIGNAL_APP_ID,
            target_channel: "push",
            contents: { en: body },
            headings: { en: title },
            data: data || {},
            priority: 10,
            url: "https://lams.vercel.app",
            collapse_id: options.collapse_id,
            ttl: options.ttl || 1800,
            android_channel_id: options.android_channel_id || "lams_alerts",
            android_group: options.group || 'lams_updates',
            android_group_message: { en: "$[notif_count] New Updates" },
            android_visibility: 1, // Public on lock screen
            locked: true,
            renotify: true
        };

        if (target === 'ALL') {
            payload.included_segments = ["Total Subscriptions"];
        } else if (targetType === 'player_id') {
            payload.include_player_ids = target;
        } else {
            payload.include_aliases = { "external_id": target };
        }

        await axios.post('https://onesignal.com/api/v1/notifications', payload, {
            headers: {
                "Authorization": `Basic ${ONE_SIGNAL_API_KEY}`,
                "Content-Type": "application/json"
            }
        });
        return true;
    } catch (e) {
        console.error("OneSignal Error:", e.response?.data || e.message);
        return false;
    }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log("Starting check-classes (OneSignal)...");

        // 1. Get Settings
        const configSnap = await db.collection('settings').doc('config').get();
        const activeAcademicYear = configSnap.exists ? configSnap.data().activeAcademicYear : '2024-2025';

        const notifSnap = await db.collection('settings').doc('notifications').get();
        const notifSettings = notifSnap.exists ? notifSnap.data() : {};

        const warn1Min = parseInt(notifSettings.firstWarning) || 15;
        const warn2Min = parseInt(notifSettings.secondWarning) || 5;
        const holidayTime = notifSettings.holidayTime || '09:00';

        // 2. Determine Current Time in IST
        const nowUTC = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(nowUTC.getTime() + istOffset);

        const dayName = nowUTC.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
        const todayDateStr = nowUTC.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        // CHECK HOLIDAYS
        try {
            const holidaySnap = await db.collection('settings').where('date', '==', todayDateStr).get();
            const holidayDoc = holidaySnap.docs.find(d => d.data().type === 'holiday');

            if (holidayDoc) {
                const h = holidayDoc.data();
                const [hHour, hMin] = holidayTime.split(':').map(Number);
                const holidayAlertTime = new Date(nowIST);
                holidayAlertTime.setHours(hHour, hMin, 0, 0);

                const notifIdHoliday = `holiday_notif_${todayDateStr}`;
                const alreadySentHoliday = await db.collection('sent_notifications').doc(notifIdHoliday).get();

                if (!alreadySentHoliday.exists && nowIST >= holidayAlertTime) {
                    const success = await sendOneSignal(
                        'ALL',
                        '🎉 Holiday Alert',
                        `Today is ${h.name}. No classes today. Enjoy!`,
                        { type: 'holiday', date: todayDateStr }
                    );

                    if (success) {
                        await db.collection('sent_notifications').doc(notifIdHoliday).set({
                            sentAt: new Date(), type: 'holiday_alert', holidayName: h.name
                        });
                        return res.status(200).json({ message: `Holiday Broadcast Sent: ${h.name}`, count: 1 });
                    }
                }
                return res.status(200).json({ message: `Holiday: ${h.name}. Automation Active.`, count: 0 });
            }
        } catch (hErr) {
            console.error("Error checking holidays:", hErr);
        }

        // 3. Query Schedule
        const scheduleSnap = await db.collection('schedule')
            .where('academicYear', '==', activeAcademicYear)
            .where('day', '==', dayName)
            .get();

        if (scheduleSnap.empty) {
            return res.status(200).json({ message: 'No classes today.', count: 0 });
        }

        const upcomingClasses = [];
        const debugLogs = [];
        const lookaheadMinutes = warn1Min + 15;

        // 4. Filter Upcoming Classes
        for (const doc of scheduleSnap.docs) {
            const data = doc.data();
            if (!data.time) continue;

            const [startStr] = data.time.split(' - ');
            if (!startStr) continue;

            const classTime = parseTimeStr(startStr, nowIST);
            const diffMs = classTime.getTime() - nowIST.getTime();
            const diffMinutes = diffMs / (1000 * 60);

            // Audit
            const debugEntry = {
                subject: data.subject || 'Unknown',
                timeStr: startStr,
                parsedTime: classTime.toString(),
                diffMinutes: Math.round(diffMinutes),
                status: 'Rejected'
            };

            if (diffMinutes > 0 && diffMinutes <= lookaheadMinutes) {
                upcomingClasses.push({ id: doc.id, ...data, startTime: classTime });
                debugEntry.status = 'UPCOMING - MATCHED';
                debugLogs.push(debugEntry);
            } else {
                if (debugLogs.length < 50) debugLogs.push(debugEntry);
            }
        }

        // 5. Send Notifications
        const notifDateKey = todayDateStr;
        let sentCount = 0;

        // eslint-disable-next-line sonarjs/cognitive-complexity
        await Promise.all(upcomingClasses.map(async (cls) => {
            const logIdx = debugLogs.findIndex(l => l.subject === cls.subject && l.status === 'UPCOMING - MATCHED');
            const log = (logIdx >= 0) ? debugLogs[logIdx] : {};

            try {
                const minutesLeft = Math.round((cls.startTime - nowIST) / 60000);
                log.minutesLeft = minutesLeft;

                let groupStr = `${cls.dept || ''}-${cls.section || ''}`;
                if (cls.group && cls.group !== 'All') groupStr += `-${cls.group}`;
                groupStr = groupStr.toUpperCase();

                const facultyTargets = [
                    { id: cls.facultyEmpId, name: cls.faculty },
                    { id: cls.faculty2EmpId, name: cls.faculty2 }
                ];

                // Get Full User Objects (including Name) for primary faculty
                const users = await getFacultyData(facultyTargets);

                // DATA ENRICHMENT: Resolve Names for Template
                let resolvedCoFacultyName = cls.faculty2;
                if (cls.faculty2 && cls.faculty2.length > 5) { // Heuristic for ID/External Name
                    const foundUser = users.find(u => u.uid === cls.faculty2 || u.empId === cls.faculty2 || u.name === cls.faculty2);
                    if (foundUser && foundUser.name) {
                        resolvedCoFacultyName = foundUser.name;
                    }
                }

                log.usersFound = users.length;
                if (users.length === 0) {
                    log.status = "No users found";
                    // Still continue to see if substitution exists
                }

                let targetPayload = [];
                let targetType = 'external_id';
                const uids = users.map(u => u.uid).filter(Boolean);
                if (uids.length > 0) {
                    targetPayload = uids;
                } else {
                    targetPayload = users.map(u => u.oneSignalId).filter(Boolean);
                    if (targetPayload.length > 0) targetType = 'player_id';
                }

                // DATA ENRICHMENT: Check for Substitutions (Master Overwrite)
                try {
                    const subSnap = await db.collection('substitutions')
                        .where('assignmentId', '==', cls.id)
                        .where('date', '==', todayDateStr)
                        .where('status', '==', 'approved')
                        .get();

                    if (!subSnap.empty) {
                        const subData = subSnap.docs[0].data();
                        log.substitutionFound = true;
                        log.originalFaculty = cls.faculty;
                        log.substituteFaculty = subData.substituteName;

                        // We replace the primary targets with the substitute
                        const substituteUsers = await getFacultyData([{ id: subData.substituteEmpId, name: subData.substituteName }]);
                        if (substituteUsers.length > 0) {
                            const subUids = substituteUsers.map(u => u.uid).filter(Boolean);
                            if (subUids.length > 0) {
                                targetPayload = subUids;
                                targetType = 'external_id';
                            } else {
                                const subPids = substituteUsers.map(u => u.oneSignalId).filter(Boolean);
                                if (subPids.length > 0) {
                                    targetPayload = subPids;
                                    targetType = 'player_id';
                                }
                            }
                        }
                    }
                } catch (subErr) {
                    console.error("Substitution Lookup Error:", subErr);
                }

                if (targetPayload.length === 0) {
                    log.status = log.status || "No targets found";
                    return;
                }

                const getAICopy = (minutes, sub, grp, room, coFac) => {
                    let urgency = 'info';
                    if (minutes <= 5) urgency = 'urgent';
                    else if (minutes <= 15) urgency = 'warning';

                    // Use resolved name here
                    const coFacStr = coFac ? ` WITH ${coFac} ` : ' ';
                    const templates = {
                        urgent: [`🚀 ACTION: Run to Room ${room}! ${sub} of (${grp})${coFacStr}is starting NOW!`],
                        warning: [`🔔 Heads Up: ${sub} of (${grp})${coFacStr}starts in ${minutes} mins at Room ${room}.`],
                        info: [`📅 Reminder: ${sub} of (${grp})${coFacStr}is scheduled in ${minutes} mins.`]
                    };
                    const options = templates[urgency] || templates['warning'];
                    return options[Date.now() % options.length];
                };

                // Warnings
                if (minutesLeft > warn2Min && minutesLeft <= (warn1Min + 5)) {
                    const notifId = `notif_${cls.id}_${notifDateKey}_warn_first`;
                    const exists = (await db.collection('sent_notifications').doc(notifId).get()).exists;
                    if (!exists) {
                        const success = await sendOneSignal(
                            targetPayload, 'Upcoming Class',
                            getAICopy(minutesLeft, cls.subject, groupStr, cls.room, resolvedCoFacultyName),
                            { type: 'class_reminder', assignmentId: cls.id, minutesLeft },
                            targetType, { collapse_id: `class_${cls.id}`, ttl: 1800, group: 'class_alerts', android_channel_id: "lams_alerts" }
                        );
                        if (success) {
                            await db.collection('sent_notifications').doc(notifId).set({ sentAt: new Date(), type: 'first_warning', assignmentId: cls.id });
                            sentCount++;
                            log.action = "Sent First Warning";
                        }
                    } else {
                        log.status = "First warning already sent";
                    }
                }

                if (minutesLeft > 0 && minutesLeft <= warn2Min) {
                    const notifId = `notif_${cls.id}_${notifDateKey}_warn_second`;
                    const exists = (await db.collection('sent_notifications').doc(notifId).get()).exists;
                    if (!exists) {
                        const success = await sendOneSignal(
                            targetPayload, 'Class Starting!',
                            getAICopy(minutesLeft, cls.subject, groupStr, cls.room, resolvedCoFacultyName),
                            { type: 'class_reminder', assignmentId: cls.id, minutesLeft },
                            targetType, { collapse_id: `class_${cls.id}`, ttl: 900, group: 'class_alerts', android_channel_id: "lams_alerts" }
                        );
                        if (success) {
                            await db.collection('sent_notifications').doc(notifId).set({ sentAt: new Date(), type: 'second_warning', assignmentId: cls.id });
                            sentCount++;
                            log.action = "Sent Second Warning";
                        }
                    } else {
                        log.status = "Second warning already sent";
                    }
                }
            } catch (err) {
                log.error = err.message;
            }
        }));

        return res.status(200).json({
            success: true,
            checked: scheduleSnap.size,
            upcoming: upcomingClasses.length,
            sent: sentCount,
            academicYear: activeAcademicYear,
            serverTimeIST: nowIST.toString(),
            debug: debugLogs
        });

    } catch (error) {
        console.error('Check Classes API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}

async function getFacultyData(targets) {
    if (!targets || targets.length === 0) return [];
    let discoveredUsers = [];

    try {
        // Fetch all users once for manual fuzzy matching (performance is fine for < 500 users)
        const allUsersSnap = await db.collection('users').get();
        const allUsers = allUsersSnap.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
        }));

        targets.forEach(target => {
            if (!target || (!target.id && !target.name)) return;

            const targetId = target.id ? target.id.toString().trim().toLowerCase() : null;
            const targetName = target.name ? target.name.toString().trim().toLowerCase() : null;

            // 1. Direct Match by EmpId (Case Insensitive)
            let match = allUsers.find(u => {
                const uEmpId = u.empId ? u.empId.toString().trim().toLowerCase() : null;
                return targetId && uEmpId === targetId;
            });

            // 2. Fallback: Fuzzy Match by Name
            if (!match && targetName) {
                match = allUsers.find(u => {
                    const uName = u.name ? u.name.toString().trim().toLowerCase() : null;
                    return uName && (uName === targetName || uName.includes(targetName) || targetName.includes(uName));
                });
            }

            if (match) {
                discoveredUsers.push({
                    uid: match.uid,
                    oneSignalId: match.oneSignalId || null,
                    name: match.name,
                    empId: match.empId
                });
            }
        });

    } catch (err) {
        console.error("Fuzzy Match Error:", err);
    }

    // Deduplicate
    const unique = [];
    const map = new Map();
    for (const item of discoveredUsers) {
        if (!map.has(item.uid)) {
            map.set(item.uid, true);
            unique.push(item);
        }
    }
    return unique;
}

function parseTimeStr(timeStr, referenceDate) {
    const d = new Date(referenceDate);
    const match = timeStr.match(/(\d{1,2})[:.]?(\d{2})?\s*([ap]m)?/i);
    if (!match) return d;
    let [, hStr, mStr, marker] = match;
    let hours = parseInt(hStr, 10);
    let minutes = mStr ? parseInt(mStr, 10) : 0;
    const cleanStr = timeStr.trim().toUpperCase();
    const isPM = marker ? marker.toLowerCase() === 'pm' : cleanStr.includes('PM');
    const isAM = marker ? marker.toLowerCase() === 'am' : cleanStr.includes('AM');
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
    if (!marker && !isPM && !isAM && hours < 7) hours += 12;
    d.setHours(hours, minutes, 0, 0);
    return d;
}
