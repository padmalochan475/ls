/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import axios from 'axios';
import { defaultTemplates } from '../src/utils/defaultTemplates.js';

// Increase Vercel function timeout to 60 seconds (maximum for Hobby tier)
// This gives the Render WhatsApp bot time to wake up from cold starts.
export const maxDuration = 60;

// Initialize Firebase Admin (Singleton)
if (!getApps().length) {
    try {
        let serviceAccount = null;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (serviceAccountStr.startsWith('"') && serviceAccountStr.endsWith('"')) {
                serviceAccountStr = serviceAccountStr.slice(1, -1);
            }
            serviceAccountStr = serviceAccountStr.replace(/\n/g, '\\n').replace(/\\\\n/g, '\\n');
            serviceAccount = JSON.parse(serviceAccountStr);
        }

        if (serviceAccount) {
            initializeApp({
                credential: cert(serviceAccount),
            });
        } else {
            console.warn("FIREBASE_SERVICE_ACCOUNT env var missing. Notifications will fail.");
        }
    } catch (e) {
        console.error("Firebase Admin Init Error:", e);
    }
}

let dbInstance = null;
function getDb() {
    if (!dbInstance) {
        dbInstance = getFirestore();
    }
    return dbInstance;
}

// In-Memory Cache to save Firebase Quota on Vercel warm starts
const Cache = {
    date: null,
    settings: null,
    schedule: null,
    users: null,
    faculty: null,
    lastFetchTime: 0,
    TTL: 10 * 60 * 1000 // 10 minutes cache
};

async function sendFCM(target, title, body, data, targetType = 'external_id', options = {}) {
    if (!target) return false;
    if (Array.isArray(target) && target.length === 0) return false;
    try {
        const db = getDb();
        console.log(`Sending FCM... Target: ${Array.isArray(target) ? target.length + ' IDs' : target} (${targetType})`);

        let tokens = [];
        if (target === 'ALL') {
            const usersSnap = await db.collection('users').get();
            usersSnap.forEach(doc => {
                const userData = doc.data();
                if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                    tokens.push(...userData.fcmTokens);
                } else if (userData.fcmToken && typeof userData.fcmToken === 'string') {
                    tokens.push(userData.fcmToken);
                }
            });
        } else {
            const uids = Array.isArray(target) ? target : [target];
            const CHUNK_SIZE = 100;
            for (let i = 0; i < uids.length; i += CHUNK_SIZE) {
                const chunkUids = uids.slice(i, i + CHUNK_SIZE);
                const refs = chunkUids.map(uid => db.collection('users').doc(uid));
                try {
                    const userDocs = await db.getAll(...refs);
                    userDocs.forEach(userDoc => {
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                                tokens.push(...userData.fcmTokens);
                            } else if (userData.fcmToken && typeof userData.fcmToken === 'string') {
                                tokens.push(userData.fcmToken);
                            }
                        }
                    });
                } catch (err) {
                    console.error("Batch fetch error for tokens:", err);
                }
            }
        }

        tokens = [...new Set(tokens)].filter(t => t && typeof t === 'string');

        if (tokens.length === 0) {
            console.log("No FCM tokens found.");
            return false;
        }

        // Ensure all data values are strings (FCM strict requirement)
        const fcmData = {};
        if (data && typeof data === 'object') {
            for (const [key, value] of Object.entries(data)) {
                fcmData[key] = String(value);
            }
        }

        const message = {
            notification: {
                title: title,
                body: body
            },
            data: fcmData,
            tokens: tokens,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'lams_alerts_channel',
                    priority: 'max',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    visibility: 'public'
                }
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert'
                },
                payload: {
                    aps: {
                        sound: 'default'
                    }
                }
            },
            webpush: {
                headers: {
                    Urgency: 'high'
                },
                notification: {
                    requireInteraction: true
                }
            }
        };

        // FCM limits to 500 tokens per multicast
        let successCount = 0;
        let failureCount = 0;
        const chunkSize = 500;
        for (let i = 0; i < tokens.length; i += chunkSize) {
            const chunk = tokens.slice(i, i + chunkSize);
            const chunkMessage = { ...message, tokens: chunk };
            const response = await getMessaging().sendEachForMulticast(chunkMessage);
            successCount += response.successCount;
            failureCount += response.failureCount;
        }

        console.log(`FCM Result: ${successCount} successful, ${failureCount} failed.`);
        return successCount > 0;
    } catch (e) {
        console.error("FCM Error:", e.message);
        return false;
    }
}

const WHATSAPP_API_BASE = 'http://129.225.114.212:2785';
const WHATSAPP_API_KEY = process.env.VITE_WHATSAPP_API_KEY || 'owa_k1_8a50b3ca467309faccd977e2b1abc741ab3de161d9f8ccb0c100afe81e2b46f1';

let cachedSessionId = null;

async function sendWhatsApp(phoneNumber, message) {
    if (!phoneNumber || !message) return false;
    try {
        let formattedNumber = String(phoneNumber).replace(/[^0-9]/g, '');
        if (formattedNumber.length === 10) formattedNumber = '91' + formattedNumber;
        else if (formattedNumber.length < 10) return false;
        
        const chatId = formattedNumber + '@c.us';

        if (!cachedSessionId) {
            const sessionsRes = await axios.get(`${WHATSAPP_API_BASE}/api/sessions`, {
                headers: { 'x-api-key': WHATSAPP_API_KEY }
            });
            if (sessionsRes.data && sessionsRes.data.length > 0) {
                cachedSessionId = sessionsRes.data[0].id;
            } else {
                console.error("No active WhatsApp sessions found.");
                return false;
            }
        }

        await axios.post(`${WHATSAPP_API_BASE}/api/sessions/${cachedSessionId}/messages/send-text`, {
            chatId: chatId,
            text: message
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_API_KEY}`,
                'x-api-key': WHATSAPP_API_KEY
            }
        });
        return true;
    } catch (error) {
        // Invalidate cached session on failure so it fetches a fresh one next time
        cachedSessionId = null;
        console.error(`WhatsApp Send Error to ${phoneNumber}:`, error.message);
        return error.message;
    }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const db = getDb();
        // 1. Determine Current Time in IST immediately
        const nowUTC = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(nowUTC.getTime() + istOffset);
        const dayName = nowUTC.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
        const todayDateStr = nowUTC.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        let debugLogs = [];
        debugLogs.push(`force_morning received: ${req.query?.force_morning}`);

        const currentISTTimeStr = nowUTC.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' });
        console.log(`Starting check-classes (${todayDateStr} ${currentISTTimeStr})...`);

        // 2. Parallel Fetch of settings and today's holiday status (with 10-min Cache)
        const currentTimeMs = Date.now();
        const isCacheValid = Cache.date === todayDateStr && (currentTimeMs - Cache.lastFetchTime < Cache.TTL);
        
        let configData, notifSettings, holidayDocs, tplData;

        if (isCacheValid && Cache.settings) {
            ({ configData, notifSettings, holidayDocs, tplData } = Cache.settings);
            console.log("Using cached Settings");
        } else {
            const [configSnap, notifSnap, holidaySnap, templateSnap] = await Promise.all([
                getDb().collection('settings').doc('config').get(),
                getDb().collection('settings').doc('notifications').get(),
                getDb().collection('settings').where('date', '==', todayDateStr).get(),
                getDb().collection('settings').doc('templates').get()
            ]);
            
            configData = configSnap.exists ? configSnap.data() : {};
            notifSettings = notifSnap.exists ? notifSnap.data() : {};
            holidayDocs = holidaySnap.docs.map(d => d.data());
            tplData = templateSnap.exists ? templateSnap.data() : {};
            
            Cache.settings = { configData, notifSettings, holidayDocs, tplData };
            Cache.date = todayDateStr;
            Cache.lastFetchTime = currentTimeMs;
        }

        const activeAcademicYear = configData.activeAcademicYear || null;

        const warn1Min = parseInt(notifSettings.firstWarning) || 15;
        const warn2Min = parseInt(notifSettings.secondWarning) || 5;
        const holidayTime = notifSettings.holidayTime || '09:00';
        const morningBriefingTime = notifSettings.morningBriefingTime || '07:30';
        const weeklyPreviewTime = notifSettings.weeklyPreviewTime || '19:00';
        const autoBirthdays = notifSettings.autoBirthdays !== false;
        const autoAnniversaries = notifSettings.autoAnniversaries !== false;
        const autoHolidays = notifSettings.autoHolidays !== false;

        // 2.5 Template Engine
        const formatMsg = (key, defaultText, vars) => {
            let str = tplData[key] || defaultTemplates[key] || defaultText;
            for (const [vKey, vVal] of Object.entries(vars)) {
                str = str.replace(new RegExp(`\\{${vKey}\\}`, 'g'), vVal);
            }
            return str;
        };

        // 3. CHECK HOLIDAYS
        const holidayDoc = holidayDocs.find(d => d.type === 'holiday');

        if (holidayDoc && autoHolidays) {
            const h = holidayDoc;
            const [hHour, hMin] = holidayTime.split(':').map(Number);
            const holidayAlertTime = new Date(nowIST);
            holidayAlertTime.setUTCHours(hHour, hMin, 0, 0);

            const notifIdHoliday = `holiday_notif_${todayDateStr}`;
            const alreadySentHoliday = await db.collection('sent_notifications').doc(notifIdHoliday).get();

            if (!alreadySentHoliday.exists && nowIST >= holidayAlertTime) {
                    const title = formatMsg('holiday_push_title', '🎉 Holiday Alert', { holiday_name: h.name });
                    const body = formatMsg('holiday_push_body', 'Today is {holiday_name}. No classes today. Enjoy!', { holiday_name: h.name });
                    
                    const success = await sendFCM('ALL', title, body, { type: 'holiday', date: todayDateStr });

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
                        
                        const waMsg = formatMsg('holiday_wa', '🏝️ *HAPPY HOLIDAY!* 🏝️\n\nWishing everyone a wonderful *{holiday_name}*! 🎉\nHave a great time!\n\n~ *LAMS Admin*', { holiday_name: h.name });
                        
                        await Promise.all(waTargets.map(u => sendWhatsApp(u.mobile, waMsg)));
                    } catch (waErr) {
                        console.error("Holiday WhatsApp Error:", waErr);
                    }

                    // Always save the receipt to prevent catastrophic WhatsApp spam loops, 
                    // even if FCM fails (e.g. no tokens found).
                    await db.collection('sent_notifications').doc(notifIdHoliday).set({
                        sentAt: new Date(), type: 'holiday_alert', holidayName: h.name
                    });
                    return res.status(200).json({ message: `Holiday Broadcast Sent: ${h.name}`, count: 1 });
                }
            return res.status(200).json({ message: `Holiday: ${h.name}. Automation Active.`, count: 0 });
        }

        // 3. BIRTHDAY & ANNIVERSARY GREETINGS (8:00 AM IST) - Done first so they fire even on holidays
        const greetingAlertTime = new Date(nowIST);
        greetingAlertTime.setUTCHours(8, 0, 0, 0);

        if (nowIST >= greetingAlertTime) {
            const greetingSentId = `greetings_${todayDateStr}`;
            const alreadySentGreeting = await db.collection('sent_notifications').doc(greetingSentId).get();

            if (!alreadySentGreeting.exists) {
                try {
                    const [facultySnap, usersSnap] = await Promise.all([
                        db.collection('faculty').get(),
                        db.collection('users').get()
                    ]);

                    let observerNumbers = [];
                    if (notifSettings.observerGroupIds && notifSettings.observerGroupIds.length > 0) {
                        observerNumbers = usersSnap.docs
                            .filter(d => notifSettings.observerGroupIds.includes(d.id) && d.data().mobile && d.data().whatsappEnabled !== false)
                            .map(d => String(d.data().mobile).replace(/[^0-9]/g, ''))
                            .filter(n => n.length >= 10);
                    }
                    observerNumbers = [...new Set(observerNumbers)];

                    const greetingTasks = [];

                    for (const doc of facultySnap.docs) {
                        const fac = doc.data();
                        if (!fac.mobile && !fac.phone) continue;
                        if (fac.whatsappEnabled === false) continue;

                        const targetNumber = String(fac.mobile || fac.phone).replace(/[^0-9]/g, '');
                        if (targetNumber.length < 10) continue;

                        const [todayMonth, todayDay] = todayDateStr.split('-').slice(1).map(Number); // [MM, DD]

                        // BIRTHDAY CHECK
                        if (autoBirthdays && fac.dob) {
                            const [bYear, bMonth, bDay] = fac.dob.split('-').map(Number);
                            if (bMonth === todayMonth && bDay === todayDay) {
                                let bdayMsg = formatMsg('birthday_wa', `🎂 *HAPPY BIRTHDAY, {name}!* 🎂\n\nWishing you a fantastic day filled with joy, and a year ahead full of success and happiness! Keep inspiring! ✨🥂\n\n~ *LAMS Admin*`, { name: fac.name });
                                greetingTasks.push(sendWhatsApp(targetNumber, bdayMsg));
                                console.log(`Birthday greeting triggered for ${fac.name}`);

                                // OBSERVER NOTIFICATION
                                if (observerNumbers.length > 0) {
                                    let obsBday = formatMsg('obs_bday', `📢 *Admin Alert: Birthday Today!* 🎈\n\nToday is *{name}'s* birthday! Be sure to wish them! 🎂`, { name: fac.name });
                                    observerNumbers.forEach(num => greetingTasks.push(sendWhatsApp(num, obsBday)));
                                }
                            }
                        }

                        // ANNIVERSARY CHECK
                        if (autoAnniversaries && fac.joiningDate) {
                            const [jYear, jMonth, jDay] = fac.joiningDate.split('-').map(Number);
                            if (jMonth === todayMonth && jDay === todayDay) {
                                const yearsCompleted = nowIST.getFullYear() - jYear;
                                if (yearsCompleted > 0) {
                                    let annMsg = formatMsg('anniversary_wa', `🎊 *HAPPY WORK ANNIVERSARY!* 🎊\n\nCongratulations, *{name}*, on completing *{years}* with our institution! 🏫\n\nThank you for your incredible dedication and hard work. We are so proud to have you on our team! 🌟\n\n~ *College Management*`, { name: fac.name, years: `${yearsCompleted} ${yearsCompleted === 1 ? 'year' : 'years'}` });
                                    greetingTasks.push(sendWhatsApp(targetNumber, annMsg));
                                    console.log(`Anniversary greeting triggered for ${fac.name} (${yearsCompleted} years)`);

                                    // OBSERVER NOTIFICATION
                                    if (observerNumbers.length > 0) {
                                        let obsAnn = formatMsg('obs_anni', `📢 *Admin Alert: Work Anniversary!* 🎊\n\n*{name}* is celebrating *{years} years* with us today! 🏫`, { name: fac.name, years: yearsCompleted });
                                        observerNumbers.forEach(num => greetingTasks.push(sendWhatsApp(num, obsAnn)));
                                    }
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

        if (holidayDoc && autoHolidays) {
             return res.status(200).json({ status: "holiday", message: "Classes paused for holiday." });
        }

        // HELPER: Format Class String
        const formatClassLine = (templateKey, idx, cls, target, isSub = false) => {
            const time = cls.time ? cls.time.replace(/\s+/g, '') : "N/A";
            const group = [cls.dept, cls.section || cls.grp, cls.group && cls.group !== 'All' ? cls.group : null].filter(Boolean).join('-');
            const subject = cls.subject ? `${cls.subject.toUpperCase()}` : 'CLASS';
            
            let cofacStr = "";
            if (cls.faculty && cls.faculty2) {
                let primaryTarget = target.empId;
                let primaryTargetName = target.name;
                
                // If they are a substitute, figure out who they are replacing
                // We assume if they are substituting, they usually replace `faculty`.
                // For a more robust check, we'd need the substitute record, but `isSub` means they replace someone.
                // Usually substitutions are tracked per `faculty`.
                if (isSub) {
                    primaryTarget = cls.facultyEmpId;
                    primaryTargetName = cls.faculty;
                }

                const otherFac = (cls.facultyEmpId === primaryTarget || cls.faculty === primaryTargetName) ? cls.faculty2 : cls.faculty;
                if (otherFac) cofacStr = `\n 👥 *With:* ${otherFac.toUpperCase()}`;
            }
            const roomStr = cls.room ? `\n 🏫 *Room:* ${cls.room.toUpperCase()}` : '';
            const semStr = (cls.semester || cls.sem) ? `\n 🎓 *Sem:* ${cls.semester || cls.sem}` : '';
            const subStr = isSub && cls.faculty ? `\n ⚠️ *SUB FOR:* ${cls.faculty.toUpperCase()}` : '';

            const defaultTemplate = "🔹 *[{idx}]* ⏰ _{time}_\n 📌 *{subject}* ({group}){roomStr}{semStr}{cofacStr}{subStr}\n";
            
            const vars = {
                idx: String(idx + 1),
                time,
                group,
                subject,
                cofacStr,
                roomStr,
                semStr,
                subStr
            };
            
            return formatMsg(templateKey, defaultTemplate, vars) + "\n";
        };

        // 3. WEEKLY PREVIEW (Sunday Broadcast)
        const forceWeekly = req.query?.force_weekly === 'true';
        const weeklyAlertTime = new Date(nowIST);
        const [wHour, wMin] = weeklyPreviewTime.split(':').map(Number);
        weeklyAlertTime.setUTCHours(wHour, wMin, 0, 0);

        if (forceWeekly || (dayName === 'Sunday' && nowIST >= weeklyAlertTime)) {
            const weeklySentId = `weekly_preview_${todayDateStr}`;
            const alreadySentWeekly = await db.collection('sent_notifications').doc(weeklySentId).get();

            if (forceWeekly || !alreadySentWeekly.exists) {
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

                    for (const target of waTargets) {
                        const mySchedule = allSchedule.filter(cls => 
                            (target.empId && cls.facultyEmpId === target.empId) || 
                            (target.empId && cls.faculty2EmpId === target.empId)
                        );

                        if (mySchedule.length > 0) {
                            let previewMsg = formatMsg('weekly_header', `🗓️ *WEEKLY PREVIEW: {name}* 🗓️\n\n🎯 _Prep for the upcoming week!_\nYou have *{total_sessions} sessions* scheduled.\n\n`, { name: target.name, total_sessions: mySchedule.length });
                            
                            // Group by day
                            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            days.forEach(d => {
                                const dayClasses = mySchedule.filter(cls => cls.day === d);
                                if (dayClasses.length > 0) {
                                    // Sort dayClasses by time
                                    dayClasses.sort((a,b) => {
                                        if (!a.time || !b.time) return 0;
                                        return parseTimeStr(a.time.split(' - ')[0], nowIST) - parseTimeStr(b.time.split(' - ')[0], nowIST);
                                    });
                                    
                                    previewMsg += `\n*${d}* (${dayClasses.length} classes):\n`;
                                    dayClasses.forEach((cls, idx) => {
                                        previewMsg += formatClassLine('weekly_class_line', idx, cls, target, false);
                                    });
                                }
                            });

                            previewMsg += formatMsg('weekly_footer', `\n🌐 _Check the portal for full timetable._\nGood luck for the week! 💪`, {});
                            await sendWhatsApp(target.mobile, previewMsg);
                            await new Promise(r => setTimeout(r, 300));
                        }
                    }
                    await getDb().collection('sent_notifications').doc(weeklySentId).set({ sentAt: new Date(), type: 'weekly_preview' });
                } catch (wErr) { console.error("Weekly Preview Error:", wErr); }
            }
        }

        // 4. MORNING SCHEDULE SUMMARY (Broadcast)
        const forceMorning = req.query?.force_morning === 'true';
        const summaryAlertTime = new Date(nowIST);
        const [mHour, mMin] = morningBriefingTime.split(':').map(Number);
        summaryAlertTime.setUTCHours(mHour, mMin, 0, 0);

        if (forceMorning || nowIST >= summaryAlertTime) {
            const summarySentId = `morning_summary_${todayDateStr}`;
            const alreadySentSummary = await db.collection('sent_notifications').doc(summarySentId).get();

            if (forceMorning || !alreadySentSummary.exists) {
                try {
        
                    // 1. Fetch Today's Master Schedule for today
                    const dayScheduleSnap = await db.collection('schedule')
                        .where('academicYear', '==', activeAcademicYear)
                        .where('day', '==', dayName)
                        .get();

                    if (!dayScheduleSnap.empty) {
                        const allTodaysClasses = dayScheduleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                        
                        // Fetch substitution data to reflect changes in summary
                        const subSnap = await db.collection('adjustments')
                            .where('date', '==', todayDateStr)
                            .where('status', '==', 'active')
                            .get();
                        const subsMap = new Map();
                        subSnap.forEach(s => subsMap.set(s.data().originalScheduleId, s.data()));

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
                                mobile: user?.mobile || fac.mobile || fac.phone || null,
                                whatsappEnabled: (fac.whatsappEnabled !== false) && (user?.whatsappEnabled !== false)
                            };
                        }).filter(t => t.mobile && t.whatsappEnabled);
                        
                        debugLogs.push(`Total waTargets: ${waTargets.length}. Valid: ${waTargets.map(t => t.name).join(', ')}`);

                        for (const target of waTargets) {
                            // Find classes where they are the primary, co-faculty, or substitute
                            const targetClasses = allTodaysClasses.filter(cls => {
                                const sub = subsMap.get(cls.id);
                                if (sub) {
                                    // The substitute gets the class
                                    if (target.empId && sub.substituteEmpId === target.empId) return true;
                                    
                                    // The primary faculty (who is substituted) does not get the class
                                    if (target.empId && sub.originalFacultyEmpId === target.empId) return false;
                                    
                                    // But the co-faculty (faculty2) should still get it if they match.
                                    if (target.empId && (cls.facultyEmpId === target.empId || cls.faculty2EmpId === target.empId)) {
                                        return true;
                                    }
                                    
                                    return false;
                                }
                                return target.empId && (cls.facultyEmpId === target.empId || cls.faculty2EmpId === target.empId);
                            });

                            if (targetClasses.length > 0) {
                                debugLogs.push(`Sending morning briefing for ${target.name} (Mobile: ${target.mobile}), found ${targetClasses.length} classes`);
                                // Sort by time
                                targetClasses.sort((a,b) => {
                                    if (!a.time || !b.time) return 0;
                                    return parseTimeStr(a.time.split(' - ')[0], nowIST) - parseTimeStr(b.time.split(' - ')[0], nowIST);
                                });

                                let waMsg = formatMsg('morning_header', `✨ *GOOD MORNING, {name}!* ✨\n🗓️ _{day}_ | 📚 *{total_classes} Classes Today*\n\n`, { name: target.name, day: dayName, total_classes: targetClasses.length });
                                
                                targetClasses.forEach((cls, idx) => {
                                    const sub = subsMap.get(cls.id);
                                    const isSub = sub && target.empId && (sub.substituteEmpId === target.empId);
                                    
                                    waMsg += formatClassLine('morning_class_line', idx, cls, target, isSub);
                                });

                                waMsg += formatMsg('morning_footer', `\n💡 _Have a highly productive day!_\n~ *LAMS Admin*`, { name: target.name });
                                const ok = await sendWhatsApp(target.mobile, waMsg);
                                if (ok !== true) debugLogs.push(`WA FAILED for ${target.name} (${target.mobile}): ${ok}`);
                                else debugLogs.push(`WA SUCCESS for ${target.name} (${target.mobile})`);
                                
                                await new Promise(r => setTimeout(r, 300));
                            }
                        }
                        
                        await getDb().collection('sent_notifications').doc(summarySentId).set({ sentAt: new Date(), type: 'morning_summary' });
                    }
                } catch (summaryErr) {
                    console.error("Morning Summary Error:", summaryErr);
                }
            }
        }

        // 5. CACHE DATA FOR REMINDERS (Fetch once to save Firebase Reads/Costs)
        let allTodaysClasses = [];
        if (isCacheValid && Cache.schedule) {
            allTodaysClasses = Cache.schedule;
            console.log("Using cached Schedule");
        } else {
            const scheduleSnap = await getDb().collection('schedule')
                .where('academicYear', '==', activeAcademicYear)
                .where('day', '==', dayName)
                .get();
            allTodaysClasses = scheduleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            Cache.schedule = allTodaysClasses;
        }

        if (allTodaysClasses.length === 0) {
            return res.status(200).json({ success: true, checked: 0, message: 'No classes today.' });
        }

        let cachedUsers = null;
        let cachedFaculty = null;
        
        const upcomingClasses = [];
        const lookaheadMinutes = warn1Min + 15;

        // Filter Upcoming Classes
        for (const data of allTodaysClasses) {
            if (!data.time) continue;
            const [startStr] = data.time.split(' - ');
            if (!startStr) continue;

            const classTime = parseTimeStr(startStr, nowIST);
            const diffMinutes = (classTime.getTime() - nowIST.getTime()) / 60000;

            if (diffMinutes > 0 && diffMinutes <= lookaheadMinutes) {
                upcomingClasses.push({ ...data, startTime: classTime });
            }
        }

        if (upcomingClasses.length > 0) {
            if (isCacheValid && Cache.users && Cache.faculty) {
                cachedUsers = Cache.users;
                cachedFaculty = Cache.faculty;
                console.log("Using cached Directory");
            } else {
                const [uSnap, fSnap] = await Promise.all([
                    getDb().collection('users').get(),
                    getDb().collection('faculty').get()
                ]);
                cachedUsers = uSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
                cachedFaculty = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                Cache.users = cachedUsers;
                Cache.faculty = cachedFaculty;
            }
        }

        // 6. Send Notifications
        const notifDateKey = todayDateStr;
        let sentCount = 0;

        for (const cls of upcomingClasses) {
            try {
                const minutesLeft = Math.round((cls.startTime - nowIST) / 60000);
                let groupStr = [cls.dept, cls.section || cls.grp, cls.group && cls.group !== 'All' ? cls.group : null].filter(Boolean).join('-').toUpperCase();
                
                // Get Full User Objects using CACHED data
                const users = await getFacultyData([
                    { id: cls.facultyEmpId, name: cls.faculty },
                    { id: cls.faculty2EmpId, name: cls.faculty2 }
                ], cachedUsers, cachedFaculty);

                // Substitution Logic
                const subSnap = await db.collection('adjustments')
                    .where('originalScheduleId', '==', cls.id)
                    .where('date', '==', todayDateStr)
                    .where('status', '==', 'active')
                    .get();

                let finalUsers = users;
                if (!subSnap.empty) {
                    const subData = subSnap.docs[0].data();
                    const subs = await getFacultyData([{ id: subData.substituteEmpId, name: subData.substituteName }], cachedUsers, cachedFaculty);
                    
                    // Remove ONLY the original faculty from recipients, keep the other faculty, and add the substitute
                    finalUsers = finalUsers.filter(u => {
                        const isEmpIdMatch = u.empId && subData.originalFacultyEmpId && String(u.empId) === String(subData.originalFacultyEmpId);
                        return !isEmpIdMatch;
                    });
                    if (subs.length > 0) finalUsers.push(subs[0]);
                }

                if (finalUsers.length === 0) continue;

                // 🔴 USER REQUEST: Filter out unsubscribed users so they receive NO MESSAGES OF ANY KIND
                finalUsers = finalUsers.filter(u => u.whatsappEnabled !== false);

                if (finalUsers.length === 0) continue;

                const targetPayload = finalUsers.map(u => u.uid).filter(Boolean);
                if (targetPayload.length === 0) continue;

                // 1st Warning Window: 6 mins left to 25 mins left (Very wide window to guarantee it fires)
                if (minutesLeft > warn2Min && minutesLeft <= (warn1Min + 10)) {
                    const notifId = `notif_${cls.id}_${notifDateKey}_warn_first`;
                    const alreadySent = (await db.collection('sent_notifications').doc(notifId).get()).exists;
                    if (!alreadySent) {
                        const vars = { subject: cls.subject, group: groupStr, room: cls.room, mins: minutesLeft };
                        const pushTitle = formatMsg('warn1_push_title', 'Upcoming Class', vars);
                        const pushBody = formatMsg('warn1_push_body', '🔔 Heads Up: {subject} ({group}) starts in {mins} mins at Room {room}.', vars);
                        const waMsg = formatMsg('warn1_wa', '🔔 *UPCOMING CLASS* 🔔\n\n📌 *{subject}* ({group})\n⏰ _Starts in:_ *{mins} mins*\n🏫 _Room:_ *{room}*', vars);

                        await sendFCM(targetPayload, pushTitle, pushBody, { type: 'class_reminder', id: cls.id }, 'external_id');
                        
                        for (const u of finalUsers) {
                            if (u.mobile && u.whatsappEnabled !== false) {
                                await sendWhatsApp(u.mobile, waMsg);
                                await new Promise(r => setTimeout(r, 300));
                            }
                        }
                        
                        await getDb().collection('sent_notifications').doc(notifId).set({ sentAt: new Date(), type: 'first_warning' });
                        sentCount++;
                    }
                }

                // 2nd Warning Window: -10 mins left (already started) to warn2Min + 2 mins left (Widened for Vercel Cron Jitter)
                if (minutesLeft >= -10 && minutesLeft <= (warn2Min + 2)) {
                    const notifId = `notif_${cls.id}_${notifDateKey}_warn_second`;
                    const alreadySent = (await db.collection('sent_notifications').doc(notifId).get()).exists;
                    if (!alreadySent) {
                        const vars = { subject: cls.subject, group: groupStr, room: cls.room, mins: minutesLeft < 0 ? 0 : minutesLeft };
                        const pushTitle = formatMsg('warn2_push_title', 'Class Starting!', vars);
                        const pushBody = formatMsg('warn2_push_body', '🚀 ACTION: Run to Room {room}! {subject} ({group}) is starting NOW!', vars);
                        const waMsg = formatMsg('warn2_wa', '🚀 *CLASS STARTING NOW!* 🚀\n\n🚨 _ACTION REQUIRED:_ Run to *Room {room}!*\n\n📌 *{subject}* ({group}) is starting *NOW!*', vars);

                        await sendFCM(targetPayload, pushTitle, pushBody, { type: 'class_reminder', id: cls.id }, 'external_id');
                        
                        for (const u of finalUsers) {
                            if (u.mobile && u.whatsappEnabled !== false) {
                                await sendWhatsApp(u.mobile, waMsg);
                                await new Promise(r => setTimeout(r, 300));
                            }
                        }
                        
                        await getDb().collection('sent_notifications').doc(notifId).set({ sentAt: new Date(), type: 'second_warning' });
                        sentCount++;
                    }
                }
            } catch (err) { console.error("Reminder Error for", cls.subject, err); }
        }

        return res.status(200).json({
            success: true,
            checked: allTodaysClasses.length,
            upcoming: upcomingClasses.length,
            sent: sentCount,
            academicYear: activeAcademicYear,
            serverTimeIST: `${todayDateStr} ${nowUTC.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' })} IST`,
            debug: debugLogs.concat(upcomingClasses.map(c => ({ id: c.id, time: c.startTime, name: c.subject })))
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
        const db = getDb();
        // Use provided cache OR fetch fresh if necessary
        let allUsers = existingUsers;
        let allFaculty = existingFaculty;

        if (!allUsers || !allFaculty) {
            if (Cache.users && Cache.faculty && Cache.date) {
                allUsers = Cache.users;
                allFaculty = Cache.faculty;
            } else {
                const [uSnap, fSnap] = await Promise.all([
                    getDb().collection('users').get(),
                    getDb().collection('faculty').get()
                ]);
                allUsers = uSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
                allFaculty = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                Cache.users = allUsers;
                Cache.faculty = allFaculty;
            }
        }

        targets.forEach(target => {
            if (!target || (!target.id && !target.name)) return;

            const targetId = target.id ? target.id.toString().trim().toLowerCase() : null;
            const targetName = target.name ? target.name.toString().trim().toLowerCase() : null;

            // 1. SEARCH BY ID (STRICT PRIMARY)
            let foundById = false;
            if (targetId) {
                const userMatch = allUsers.find(u => 
                    u.empId && u.empId.toString().trim().toLowerCase() === targetId
                );
                
                const facMatch = allFaculty.find(f => 
                    f.empId && f.empId.toString().trim().toLowerCase() === targetId
                );

                if (userMatch || facMatch) {
                    discoveredUsers.push({
                        uid: userMatch?.uid || facMatch?.uid || facMatch?.id,
                        fcmTokens: userMatch?.fcmTokens || null,
                        name: userMatch?.name || facMatch?.name,
                        empId: userMatch?.empId || facMatch?.empId,
                        mobile: userMatch?.mobile || facMatch?.mobile || facMatch?.phone || null,
                        whatsappEnabled: (userMatch?.whatsappEnabled !== false) && (facMatch?.whatsappEnabled !== false),
                        isExactMatch: true
                    });
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
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
}
