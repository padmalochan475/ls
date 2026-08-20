/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';


// Singleton Initialization
if (!getApps().length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (serviceAccountStr.startsWith('"') && serviceAccountStr.endsWith('"')) {
                serviceAccountStr = serviceAccountStr.slice(1, -1);
            }
            serviceAccountStr = serviceAccountStr.replace(/\n/g, '\\n').replace(/\\\\n/g, '\\n');
            const serviceAccount = JSON.parse(serviceAccountStr);
            initializeApp({
                credential: cert(serviceAccount)
            });
            console.log("Firebase Admin Initialized Successfully from ENV");
        } else {
            // Fallback to Application Default Credentials
            initializeApp();
            console.log("Firebase Admin Initialized Successfully with Default Credentials");
        }
    } catch (error) {
        console.error("Firebase Admin Init Failed:", error);
    }
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        if (!getApps().length) throw new Error("Firebase Admin not initialized.");

        const db = getFirestore();

        // 1. Get Config
        const configSnap = await db.collection('settings').doc('config').get();
        if (!configSnap.exists) throw new Error("Config not found");
        const activeYear = configSnap.data().activeAcademicYear || null;

        // 2. Parallel Fetch
        const [daysSnap, timeSnap, scheduleSnap, subjectsSnap, deptsSnap, roomsSnap, semsSnap, facultySnap] = await Promise.all([
            db.collection('days').get(),
            db.collection('timeslots').get(),
            db.collection('schedule').where('academicYear', '==', activeYear).get(),
            db.collection('subjects').get(),
            db.collection('departments').get(),
            db.collection('rooms').get(),
            db.collection('semesters').get(),
            db.collection('faculty').get()
        ]);

        // 3. Process & SANITIZE
        const days = daysSnap.docs
            .map(d => d.data())
            .filter(d => d.isVisible !== false)
            .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
            .map(d => d.name);

        const timeSlots = timeSnap.docs
            .map(d => d.data())
            .sort((a, b) => {
                // Robust Time Sorting
                const parse = t => {
                    if (!t) return 0;
                    const [h, m] = t.split(':').map(Number);
                    return (h * 60) + (m || 0);
                };
                return parse(a.startTime) - parse(b.startTime);
            })
            .map(t => {
                // Formatting logic on server (Robust)
                const format = (time) => {
                    if (!time) return '';
                    try {
                        const [h, m] = time.split(':');
                        const paddedTime = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
                        return new Date(`2000-01-01T${paddedTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    } catch {
                        return time;
                    }
                };
                return `${format(t.startTime)} - ${format(t.endTime)}`;
            });

        // --- MAPS FOR SHORT CODES (NORMALIZED KEYS) ---
        // Normalization ensures "Rashmi Ranjan Palei" matches "RASHMIRANJAN PALEI"
        const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const subjectMap = {};
        const subjectTypeMap = {};
        subjectsSnap.docs.forEach(doc => {
            const d = doc.data();
            if (d.name && d.shortCode) subjectMap[normalize(d.name)] = d.shortCode.trim();
            if (d.name && d.type) subjectTypeMap[normalize(d.name)] = d.type.toLowerCase().trim();
        });

        const deptMap = {};
        deptsSnap.docs.forEach(doc => {
            const d = doc.data();
            if (d.name && d.code) deptMap[normalize(d.name)] = d.code.trim();
        });

        const roomMap = {};
        roomsSnap.docs.forEach(doc => {
            const d = doc.data();
            if (d.name && d.shortCode) roomMap[normalize(d.name)] = d.shortCode.trim();
        });

        const semMap = {};
        semsSnap.docs.forEach(doc => {
            const d = doc.data();
            const val = d.code || d.number;
            if (d.name && val) semMap[normalize(d.name)] = String(val).trim();
        });

        const facultyMap = {};
        facultySnap.docs.forEach(doc => {
            const d = doc.data();
            if (d.name && d.shortCode) facultyMap[normalize(d.name)] = d.shortCode.trim();
        });


        // CRITICAL SECURITY STEP: Data Scrubbing
        const schedule = scheduleSnap.docs.map(doc => {
            const d = doc.data();
            const subjectNorm = normalize(d.subject || '');
            const roomNorm = normalize(d.room || '');
            
            let isLab = false;
            if (subjectTypeMap[subjectNorm] === 'lab') {
                isLab = true;
            } else if (subjectNorm.includes('lab') || roomNorm.includes('lab')) {
                isLab = true;
            }

            // Combine fields to create a clean 'batch' string like "CSE A 1"
            const deptStr = d.dept || '';
            const secStr = d.section && d.section !== 'All' ? d.section : '';
            const grpStr = d.group && d.group !== 'All' && d.group !== d.section ? d.group : '';
            const batchStr = [deptStr, secStr, grpStr].filter(Boolean).join(' ');

            return {
                // Public Fields ONLY
                day: d.day || '',
                time: d.time || '',
                subject: d.subject || '',
                room: d.room || '',
                faculty: d.faculty || '', // Name only
                faculty2: d.faculty2 || '', // Name only
                dept: d.dept || '',
                sem: d.sem || '',
                section: d.section || '',
                group: d.group || '',
                batch: batchStr,
                isLab: isLab,
                isTheory: !isLab
            };
        });

        return res.status(200).json({
            days,
            timeSlots,
            schedule,
            subjectMap,
            deptMap,
            roomMap,
            semMap,
            facultyMap,
            activeAcademicYear: activeYear
        });

    } catch (error) {
        console.error('Public API Error:', error);
        return res.status(500).json({ error: 'Failed to fetch schedule' });
    }
}
