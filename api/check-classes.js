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

const WHATSAPP_API_URL = 'https://lams-whatsapp-bot.onrender.com/api/sendText';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || process.env.VITE_WHATSAPP_API_KEY || 'lams_local_dev_key_123';

async function sendWhatsApp(phoneNumber, message) {
    if (!phoneNumber || !message) return false;
    try {
        await axios.post(WHATSAPP_API_URL, {
            number: phoneNumber,
            text: message
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': WHATSAPP_API_KEY
            }
        });
        return true;
    } catch (e) {
        console.error("WhatsApp Error:", e.response?.data || e.message);
        return false;
    }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log("Starting check-classes (OneSignal + WhatsApp)...");

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
                    const title = '🎉 Holiday Alert';
                    const body = `Today is ${h.name}. No classes today. Enjoy!`;
                    
                    const success = await sendOneSignal(
                        'ALL',
                        title,
                        body,
                        { type: 'holiday', date: todayDateStr }
                    );

                    // WhatsApp Holiday Broadcast
                    try {
                        const usersSnap = await db.collection('users').get();
                        const waTargets = usersSnap.docs
                            .map(d => d.data())
                            .filter(u => u.mobile && u.whatsappEnabled !== false);
                        
                        const waMsg = `🎉 *LAMS Holiday Alert* 🎉\n\nToday is *${h.name}*.\nNo classes today. Enjoy!\n\n_System Admin_`;
                        
                        // We do these in chunks or map, but since it's a small app, map is fine for now
                        await Promise.all(waTargets.map(u => sendWhatsApp(u.mobile, waMsg)));
                    } catch (waErr) {
                        console.error("Holiday WhatsApp Error:", waErr);
                    }

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

        // 3. BIRTHDAY & ANNIVERSARY GREETINGS (8:00 AM IST) - Done first so they fire even on holidays
        const greetingAlertTime = new Date(nowIST);
        greetingAlertTime.setHours(8, 0, 0, 0);

        if (nowIST >= greetingAlertTime) {
            const greetingSentId = `greetings_${todayDateStr}`;
            const alreadySentGreeting = await db.collection('sent_notifications').doc(greetingSentId).get();

            if (!alreadySentGreeting.exists) {
                try {
                    const facultySnap = await db.collection('faculty').get();
                    const greetingTasks = [];

                    for (const doc of facultySnap.docs) {
                        const fac = doc.data();
                        if (!fac.mobile && !fac.phone) continue;
                        if (fac.whatsappEnabled === false) continue;

                        const targetNumber = String(fac.mobile || fac.phone).replace(/[^0-9]/g, '');
                        if (targetNumber.length < 10) continue;

                        const [todayMonth, todayDay] = todayDateStr.split('-').slice(1).map(Number); // [MM, DD]

                        // BIRTHDAY CHECK
                        if (fac.dob) {
                            const [bYear, bMonth, bDay] = fac.dob.split('-').map(Number);
                            if (bMonth === todayMonth && bDay === todayDay) {
                                let bdayMsg = `🎂 *Happy Birthday, ${fac.name}!* 🎂\n\nOn behalf of the entire college, we wish you a fantastic day filled with joy and a year ahead full of success and happiness. Keep inspiring! ✨\n\n_Best Wishes,_\n*LAMS Administration*`;
                                greetingTasks.push(sendWhatsApp(targetNumber, bdayMsg));
                                console.log(`Birthday greeting triggered for ${fac.name}`);
                            }
                        }

                        // ANNIVERSARY CHECK
                        if (fac.joiningDate) {
                            const [jYear, jMonth, jDay] = fac.joiningDate.split('-').map(Number);
                            if (jMonth === todayMonth && jDay === todayDay) {
                                const yearsCompleted = nowIST.getFullYear() - jYear;
                                if (yearsCompleted > 0) {
                                    let annMsg = `🎊 *Work Anniversary Celebration* 🎊\n\nCongratulations *${fac.name}* on completing *${yearsCompleted} ${yearsCompleted === 1 ? 'year' : 'years'}* with our institution! 🏫\n\nThank you for your dedication, hard work, and the positive impact you've made. We are proud to have you on our team!\n\n_Warm Regards,_\n*College Management*`;
                                    greetingTasks.push(sendWhatsApp(targetNumber, annMsg));
                                    console.log(`Anniversary greeting triggered for ${fac.name} (${yearsCompleted} years)`);
                                }
                            }
                        }
                    }

                    if (greetingTasks.length > 0) {
                        await Promise.all(greetingTasks);
                    }
                    await db.collection('sent_notifications').doc(greetingSentId).set({ sentAt: new Date(), type: 'greetings_broadcast' });
                } catch (greetErr) {
                    console.error("Greetings Error:", greetErr);
                }
            }
        }

        // 4. BLOCK CLASS NOTIFICATIONS ON HOLIDAYS
        const holidaySnap = await db.collection('settings').where('date', '==', todayDateStr).get();
        const activeHoliday = holidaySnap.docs.find(d => d.data().type === 'holiday');
        if (activeHoliday) {
             return res.status(200).json({ status: "holiday", message: "Classes paused for holiday." });
        }

        // 3. WEEKLY PREVIEW (Sunday 7:00 PM Broadcast)
        const weeklyAlertTime = new Date(nowIST);
        weeklyAlertTime.setHours(19, 0, 0, 0);

        if (dayName === 'Sunday' && nowIST >= weeklyAlertTime) {
            const weeklySentId = `weekly_preview_${todayDateStr}`;
            const alreadySentWeekly = await db.collection('sent_notifications').doc(weeklySentId).get();

            if (!alreadySentWeekly.exists) {
                try {
                    const fullScheduleSnap = await db.collection('schedule')
                        .where('academicYear', '==', activeAcademicYear)
                        .get();
                    const allSchedule = fullScheduleSnap.docs.map(d => d.data());
                    
                    // UNIFIED TARGET FETCHING
                    const [uSnap, fSnap] = await Promise.all([db.collection('users').get(), db.collection('faculty').get()]);
                    const usersMap = new Map();
                    uSnap.forEach(d => usersMap.set(d.id, d.data()));
                    
                    const waTargets = fSnap.docs.map(d => {
                        const fac = d.data();
                        const user = fac.uid ? usersMap.get(fac.uid) : null;
                        return {
                            name: fac.name,
                            empId: fac.empId,
                            mobile: fac.mobile || fac.phone || user?.mobile || null,
                            whatsappEnabled: (fac.whatsappEnabled !== false) && (user?.whatsappEnabled !== false)
                        };
                    }).filter(t => t.mobile && t.whatsappEnabled);

                    await Promise.all(waTargets.map(async (target) => {
                        const mySchedule = allSchedule.filter(cls => 
                            cls.facultyEmpId === target.empId || cls.faculty === target.name || 
                            cls.faculty2EmpId === target.empId || cls.faculty2 === target.name
                        );

                        if (mySchedule.length > 0) {
                            let previewMsg = `🗓️ *Weekly Preview for ${target.name}* 🗓️\n\nPrep for the upcoming week! You have *${mySchedule.length} sessions* scheduled.\n\n`;
                            
                            // Group by day
                            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            days.forEach(d => {
                                const dayClasses = mySchedule.filter(cls => cls.day === d);
                                if (dayClasses.length > 0) {
                                    previewMsg += `*${d}*: ${dayClasses.length} class(es)\n`;
                                }
                            });

                            previewMsg += `\n🌐 _Check the portal for full timetable._\nGood luck for the week! 💪`;
                            await sendWhatsApp(target.mobile, previewMsg);
                        }
                    }));
                    await db.collection('sent_notifications').doc(weeklySentId).set({ sentAt: new Date(), type: 'weekly_preview' });
                } catch (wErr) { console.error("Weekly Preview Error:", wErr); }
            }
        }

        // 4. MORNING SCHEDULE SUMMARY (7:30 AM Broadcast)
        const summaryAlertTime = new Date(nowIST);
        summaryAlertTime.setHours(7, 30, 0, 0);

        if (nowIST >= summaryAlertTime) {
            const summarySentId = `morning_summary_${todayDateStr}`;
            const alreadySentSummary = await db.collection('sent_notifications').doc(summarySentId).get();

            if (!alreadySentSummary.exists) {
                try {
                    // Fetch all schedule for today
                    const dayScheduleSnap = await db.collection('schedule')
                        .where('academicYear', '==', activeAcademicYear)
                        .where('day', '==', dayName)
                        .get();

                    if (!dayScheduleSnap.empty) {
                        const allTodaysClasses = dayScheduleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                        
                        // Fetch substitution data to reflect changes in summary
                        const subSnap = await db.collection('substitutions')
                            .where('date', '==', todayDateStr)
                            .where('status', '==', 'approved')
                            .get();
                        const subsMap = new Map();
                        subSnap.forEach(s => subsMap.set(s.data().assignmentId, s.data()));

                        // UNIFIED TARGET FETCHING
                        const [uSnap, fSnap] = await Promise.all([db.collection('users').get(), db.collection('faculty').get()]);
                        const usersMap = new Map();
                        uSnap.forEach(d => usersMap.set(d.id, d.data()));

                        const waTargets = fSnap.docs.map(d => {
                            const fac = d.data();
                            const user = fac.uid ? usersMap.get(fac.uid) : null;
                            return {
                                name: fac.name,
                                empId: fac.empId,
                                mobile: fac.mobile || fac.phone || user?.mobile || null,
                                whatsappEnabled: (fac.whatsappEnabled !== false) && (user?.whatsappEnabled !== false)
                            };
                        }).filter(t => t.mobile && t.whatsappEnabled);
                        
                        await Promise.all(waTargets.map(async (target) => {
                            // Find classes where they are the primary, co-faculty, or substitute
                            const targetClasses = allTodaysClasses.filter(cls => {
                                const sub = subsMap.get(cls.id);
                                if (sub) {
                                    return sub.substituteEmpId === target.empId || sub.substituteName === target.name;
                                }
                                return cls.facultyEmpId === target.empId || cls.faculty === target.name || 
                                       cls.faculty2EmpId === target.empId || cls.faculty2 === target.name;
                            });

                            if (targetClasses.length > 0) {
                                // Sort by time
                                targetClasses.sort((a,b) => parseTimeStr(a.time.split(' - ')[0], nowIST) - parseTimeStr(b.time.split(' - ')[0], nowIST));

                                let waMsg = `📅 *Today's Briefing: ${target.name}* 📅\n`;
                                waMsg += `Day: *${dayName}* | Classes: *${targetClasses.length}*\n\n`;
                                
                                targetClasses.forEach((cls, idx) => {
                                    const sub = subsMap.get(cls.id);
                                    const isSub = sub && (sub.substituteEmpId === target.empId || sub.substituteName === target.name);
                                    
                                    let typeIcon = cls.subject?.toLowerCase().includes('lab') ? '🧪' : '📖';
                                    let time = cls.time.split(' - ')[0];
                                    
                                    waMsg += `${idx + 1}. *${time}* | ${typeIcon} *${cls.subject}*\n`;
                                    waMsg += `   📍 Room: ${cls.room} | Group: ${cls.dept}-${cls.section}\n`;
                                    
                                    // Co-Faculty Info
                                    if (cls.faculty && cls.faculty2) {
                                        const otherFac = (cls.facultyEmpId === target.empId || cls.faculty === target.name) ? cls.faculty2 : cls.faculty;
                                        waMsg += `   🤝 With: ${otherFac}\n`;
                                    }

                                    if (isSub) waMsg += `   🔄 _(Substitution for ${cls.faculty})_\n`;
                                    waMsg += `\n`;
                                });

                                waMsg += `Have a productive day! ✨\n_LAMS Admin_`;
                                await sendWhatsApp(target.mobile, waMsg);
                            }
                        }));
                    }
                    await db.collection('sent_notifications').doc(summarySentId).set({ sentAt: new Date(), type: 'morning_summary' });
                } catch (summaryErr) {
                    console.error("Morning Summary Error:", summaryErr);
                }
            }
        }

        // 5. Query Schedule for Real-Time Warnings (Original Logic)
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
                        const msgText = getAICopy(minutesLeft, cls.subject, groupStr, cls.room, resolvedCoFacultyName);
                        const success = await sendOneSignal(
                            targetPayload, 'Upcoming Class',
                            msgText,
                            { type: 'class_reminder', assignmentId: cls.id, minutesLeft },
                            targetType, { collapse_id: `class_${cls.id}`, ttl: 1800, group: 'class_alerts', android_channel_id: "lams_alerts" }
                        );

                        // WhatsApp Warning 1
                        try {
                            const waTargets = users.filter(u => u.mobile && u.whatsappEnabled !== false);
                            if (waTargets.length > 0) {
                                const waMsg = `🔔 *Upcoming Class Alert* 🔔\n\n${msgText}\n\n_System Admin_`;
                                await Promise.all(waTargets.map(u => sendWhatsApp(u.mobile, waMsg)));
                            }
                        } catch (waErr) { console.error("WA Warn1 Error:", waErr); }

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
                        const msgText = getAICopy(minutesLeft, cls.subject, groupStr, cls.room, resolvedCoFacultyName);
                        const success = await sendOneSignal(
                            targetPayload, 'Class Starting!',
                            msgText,
                            { type: 'class_reminder', assignmentId: cls.id, minutesLeft },
                            targetType, { collapse_id: `class_${cls.id}`, ttl: 900, group: 'class_alerts', android_channel_id: "lams_alerts" }
                        );

                        // WhatsApp Warning 2
                        try {
                            const waTargets = users.filter(u => u.mobile && u.whatsappEnabled !== false);
                            if (waTargets.length > 0) {
                                const waMsg = `🚀 *Class Starting Soon* 🚀\n\n${msgText}\n\n_System Admin_`;
                                await Promise.all(waTargets.map(u => sendWhatsApp(u.mobile, waMsg)));
                            }
                        } catch (waErr) { console.error("WA Warn2 Error:", waErr); }

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
        // Fetch all users and faculty once for manual fuzzy matching
        const [usersSnap, facultySnap] = await Promise.all([
            db.collection('users').get(),
            db.collection('faculty').get()
        ]);

        const allUsers = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        const allFaculty = facultySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        targets.forEach(target => {
            if (!target || (!target.id && !target.name)) return;

            const targetId = target.id ? target.id.toString().trim().toLowerCase() : null;
            const targetName = target.name ? target.name.toString().trim().toLowerCase() : null;

            // 1. SEARCH BY ID (STRICT PRIMARY) - If ID exists, we ONLY use ID.
            if (targetId) {
                // Check Users
                const userMatch = allUsers.find(u => 
                    u.empId && u.empId.toString().trim().toLowerCase() === targetId
                );
                
                if (userMatch) {
                    discoveredUsers.push({
                        uid: userMatch.uid,
                        oneSignalId: userMatch.oneSignalId || null,
                        name: userMatch.name,
                        empId: userMatch.empId,
                        mobile: userMatch.mobile || null,
                        whatsappEnabled: userMatch.whatsappEnabled !== false,
                        isExactMatch: true
                    });
                    return; // ⛔ STOP: ID matched. Never guess by name.
                }

                // Check Faculty Master
                const facMatch = allFaculty.find(f => 
                    f.empId && f.empId.toString().trim().toLowerCase() === targetId
                );

                if (facMatch) {
                    discoveredUsers.push({
                        uid: facMatch.uid || facMatch.id,
                        oneSignalId: null,
                        name: facMatch.name,
                        empId: facMatch.empId,
                        mobile: facMatch.mobile || facMatch.phone || null,
                        whatsappEnabled: facMatch.whatsappEnabled !== false,
                        isExactMatch: true
                    });
                    return; // ⛔ STOP: ID matched. Never guess by name.
                }

                // ⚠️ IMPORTANT: If targetId was provided but not found, 
                // we ABORT for this target. We do NOT fall back to name-guessing.
                return;
            }

            // 2. SEARCH BY NAME (LEGACY FALLBACK) - Only if target.id is truly blank.
            if (targetName) {
                let nameMatch = allUsers.find(u => {
                    const uName = u.name ? u.name.toString().trim().toLowerCase() : null;
                    return uName && (uName === targetName || uName.includes(targetName) || targetName.includes(uName));
                });

                if (!nameMatch) {
                    nameMatch = allFaculty.find(f => {
                        const fName = f.name ? f.name.toString().trim().toLowerCase() : null;
                        return fName && (fName === targetName || fName.includes(targetName) || targetName.includes(fName));
                    });
                    if (nameMatch) {
                        nameMatch = {
                            uid: nameMatch.uid || nameMatch.id,
                            oneSignalId: null,
                            name: nameMatch.name,
                            empId: nameMatch.empId,
                            mobile: nameMatch.mobile || nameMatch.phone || null,
                            whatsappEnabled: nameMatch.whatsappEnabled !== false
                        };
                    }
                } else {
                    nameMatch = {
                        uid: nameMatch.uid,
                        oneSignalId: nameMatch.oneSignalId || null,
                        name: nameMatch.name,
                        empId: nameMatch.empId,
                        mobile: nameMatch.mobile || null,
                        whatsappEnabled: nameMatch.whatsappEnabled !== false
                    };
                }

                if (nameMatch) {
                    discoveredUsers.push({ ...nameMatch, isExactMatch: false });
                }
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
