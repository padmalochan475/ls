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
const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONE_SIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

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
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || process.env.VITE_WHATSAPP_API_KEY;

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
        // 1. Determine Current Time in IST immediately
        const nowUTC = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(nowUTC.getTime() + istOffset);
        const dayName = nowUTC.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
        const todayDateStr = nowUTC.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        console.log(`Starting check-classes (${todayDateStr} ${nowIST.toLocaleTimeString()})...`);

        // 🛡️ AUTO-WAKE: Every time LAMS runs, it "pokes" the WhatsApp bot to keep it awake.
        // No more opening the browser manually!
        axios.get('https://lams-whatsapp-bot.onrender.com/').catch(() => {});

        // 2. Parallel Fetch of settings and today's holiday status
        const [configSnap, notifSnap, holidaySnap] = await Promise.all([
            db.collection('settings').doc('config').get(),
            db.collection('settings').doc('notifications').get(),
            db.collection('settings').where('date', '==', todayDateStr).get()
        ]);

        const activeAcademicYear = configSnap.exists ? configSnap.data().activeAcademicYear : '2024-2025';
        const notifSettings = notifSnap.exists ? notifSnap.data() : {};
        const warn1Min = parseInt(notifSettings.firstWarning) || 15;
        const warn2Min = parseInt(notifSettings.secondWarning) || 5;
        const holidayTime = notifSettings.holidayTime || '09:00';

        // 3. CHECK HOLIDAYS
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
                        // REUSE logic or fetch once. Re-using once-per-execution pattern.
                        const [uSnap, fSnap] = await Promise.all([db.collection('users').get(), db.collection('faculty').get()]);
                        const usersMap = new Map();
                        uSnap.forEach(d => usersMap.set(d.id, d.data()));
                        
                        const waTargets = fSnap.docs.map(d => {
                            const fac = d.data();
                            const user = fac.uid ? usersMap.get(fac.uid) : null;
                            return {
                                mobile: fac.mobile || fac.phone || user?.mobile || null,
                                whatsappEnabled: (fac.whatsappEnabled !== false) && (user?.whatsappEnabled !== false)
                            };
                        }).filter(u => u.mobile && u.whatsappEnabled);
                        
                        const waMsg = `🎉 *LAMS Holiday Alert* 🎉\n\nToday is *${h.name}*.\nNo classes today. Enjoy!\n\n_System Admin_`;
                        
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

        if (holidayDoc) {
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

        // 5. CACHE DATA FOR REMINDERS (Fetch once to save Firebase Reads/Costs)
        const scheduleSnap = await db.collection('schedule')
            .where('academicYear', '==', activeAcademicYear)
            .where('day', '==', dayName)
            .get();

        if (scheduleSnap.empty) {
            return res.status(200).json({ success: true, checked: 0, message: 'No classes today.' });
        }

        let cachedUsers = null;
        let cachedFaculty = null;
        
        const upcomingClasses = [];
        const debugLogs = [];
        const lookaheadMinutes = warn1Min + 15;

        // Filter Upcoming Classes
        for (const doc of scheduleSnap.docs) {
            const data = doc.data();
            if (!data.time) continue;
            const [startStr] = data.time.split(' - ');
            if (!startStr) continue;

            const classTime = parseTimeStr(startStr, nowIST);
            const diffMinutes = (classTime.getTime() - nowIST.getTime()) / 60000;

            if (diffMinutes > 0 && diffMinutes <= lookaheadMinutes) {
                upcomingClasses.push({ id: doc.id, ...data, startTime: classTime });
            }
        }

        if (upcomingClasses.length > 0) {
            // Fetch Directory ONCE for all upcoming classes
            const [uSnap, fSnap] = await Promise.all([
                db.collection('users').get(),
                db.collection('faculty').get()
            ]);
            cachedUsers = uSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
            cachedFaculty = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        // 6. Send Notifications
        const notifDateKey = todayDateStr;
        let sentCount = 0;

        await Promise.all(upcomingClasses.map(async (cls) => {
            try {
                const minutesLeft = Math.round((cls.startTime - nowIST) / 60000);
                let groupStr = `${cls.dept || ''}-${cls.section || ''}`.toUpperCase();
                
                // Get Full User Objects using CACHED data
                const users = await getFacultyData([
                    { id: cls.facultyEmpId, name: cls.faculty },
                    { id: cls.faculty2EmpId, name: cls.faculty2 }
                ], cachedUsers, cachedFaculty);

                // Substitution Logic
                const subSnap = await db.collection('substitutions')
                    .where('assignmentId', '==', cls.id)
                    .where('date', '==', todayDateStr)
                    .where('status', '==', 'approved')
                    .get();

                let finalUsers = users;
                if (!subSnap.empty) {
                    const subData = subSnap.docs[0].data();
                    const subs = await getFacultyData([{ id: subData.substituteEmpId, name: subData.substituteName }], cachedUsers, cachedFaculty);
                    if (subs.length > 0) finalUsers = subs;
                }

                if (finalUsers.length === 0) return;

                const targetPayload = finalUsers.map(u => u.uid).filter(Boolean);
                if (targetPayload.length === 0) return;

                const getAICopy = (min, sub, grp, room) => {
                    if (min <= 5) return `🚀 ACTION: Run to Room ${room}! ${sub} (${grp}) is starting NOW!`;
                    return `🔔 Heads Up: ${sub} (${grp}) starts in ${min} mins at Room ${room}.`;
                };

                // Triggers
                if (minutesLeft > warn2Min && minutesLeft <= (warn1Min + 5)) {
                    const notifId = `notif_${cls.id}_${notifDateKey}_warn_first`;
                    const alreadySent = (await db.collection('sent_notifications').doc(notifId).get()).exists;
                    if (!alreadySent) {
                        const msg = getAICopy(minutesLeft, cls.subject, groupStr, cls.room);
                        await sendOneSignal(targetPayload, 'Upcoming Class', msg, { type: 'class_reminder', id: cls.id }, 'external_id');
                        await Promise.all(finalUsers.filter(u => u.mobile && u.whatsappEnabled !== false).map(u => sendWhatsApp(u.mobile, `🔔 *Upcoming* 🔔\n\n${msg}`)));
                        await db.collection('sent_notifications').doc(notifId).set({ sentAt: new Date(), type: 'first_warning' });
                        sentCount++;
                    }
                }

                if (minutesLeft > 0 && minutesLeft <= warn2Min) {
                    const notifId = `notif_${cls.id}_${notifDateKey}_warn_second`;
                    const alreadySent = (await db.collection('sent_notifications').doc(notifId).get()).exists;
                    if (!alreadySent) {
                        const msg = getAICopy(minutesLeft, cls.subject, groupStr, cls.room);
                        await sendOneSignal(targetPayload, 'Class Starting!', msg, { type: 'class_reminder', id: cls.id }, 'external_id');
                        await Promise.all(finalUsers.filter(u => u.mobile && u.whatsappEnabled !== false).map(u => sendWhatsApp(u.mobile, `🚀 *Now* 🚀\n\n${msg}`)));
                        await db.collection('sent_notifications').doc(notifId).set({ sentAt: new Date(), type: 'second_warning' });
                        sentCount++;
                    }
                }
            } catch (err) { console.error("Reminder Error for", cls.subject, err); }
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

async function getFacultyData(targets, existingUsers = null, existingFaculty = null) {
    if (!targets || targets.length === 0) return [];
    let discoveredUsers = [];

    try {
        // Use provided cache OR fetch fresh if necessary
        let allUsers = existingUsers;
        let allFaculty = existingFaculty;

        if (!allUsers || !allFaculty) {
            const [uSnap, fSnap] = await Promise.all([
                db.collection('users').get(),
                db.collection('faculty').get()
            ]);
            allUsers = uSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
            allFaculty = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        targets.forEach(target => {
            if (!target || (!target.id && !target.name)) return;

            const targetId = target.id ? target.id.toString().trim().toLowerCase() : null;
            const targetName = target.name ? target.name.toString().trim().toLowerCase() : null;

            // 1. SEARCH BY ID (STRICT PRIMARY)
            if (targetId) {
                const userMatch = allUsers.find(u => 
                    u.empId && u.empId.toString().trim().toLowerCase() === targetId
                );
                
                const facMatch = allFaculty.find(f => 
                    f.empId && f.empId.toString().trim().toLowerCase() === targetId
                );

                if (userMatch || facMatch) {
                    // MERGE: Prefer User profile data, fallback to Faculty Master
                    discoveredUsers.push({
                        uid: userMatch?.uid || facMatch?.uid || facMatch?.id,
                        oneSignalId: userMatch?.oneSignalId || null,
                        name: userMatch?.name || facMatch?.name,
                        empId: userMatch?.empId || facMatch?.empId,
                        mobile: userMatch?.mobile || facMatch?.mobile || facMatch?.phone || null,
                        whatsappEnabled: (userMatch?.whatsappEnabled !== false) && (facMatch?.whatsappEnabled !== false),
                        isExactMatch: true
                    });
                    return; 
                }
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
