import { normalizeStr, parseTimeSlot } from './timeUtils';

export const checkTimeOverlap = (t1, t2) => {
    if (!t1 || !t2) return false;
    if (normalizeStr(t1) === normalizeStr(t2)) return true; // Exact match check normalized

    const t1Slot = parseTimeSlot(t1);
    const t2Slot = parseTimeSlot(t2);

    if (!t1Slot || !t2Slot) return normalizeStr(t1) === normalizeStr(t2);

    // Strict overlap: start < end AND end > start
    return t1Slot.start < t2Slot.end && t1Slot.end > t2Slot.start;
};

/**
 * Checks for scheduling conflicts.
 * 
 * @param {Object} newBooking - The booking to check { day, time, room, faculty, faculty2, dept, sem, section, group, facultyEmpId, faculty2EmpId }
 * @param {Array} schedule - The existing schedule array
 * @param {Object} options - { ignoreId: string (to exclude current editing item), facultyList: Array (for name lookup if needed) }
 * @returns {String|null} - Error message if conflict found, or null if safe.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export const validateBooking = (newBooking, schedule, options = {}) => {
    if (!schedule || !Array.isArray(schedule)) return null;

    const {
        day, time, room,
        faculty, faculty2, facultyEmpId, faculty2EmpId,
        dept, sem, section, group
    } = newBooking;

    const { ignoreId } = options;

    if (!day || !time) return null;

    // 1. Self Validations
    if (faculty && faculty2) {
        if (normalizeStr(faculty) === normalizeStr(faculty2)) return "Invalid: Cannot select the same faculty twice.";
        if (facultyEmpId && faculty2EmpId && facultyEmpId === faculty2EmpId) {
            return "Invalid: Selected faculty members have the same Employee ID.";
        }
    }

    // Filter relevant bookings (same day, overlapping time)
    const potentiallyConflicting = schedule.filter(item => {
        if (ignoreId && item.id === ignoreId) return false;
        if (normalizeStr(item.day) !== normalizeStr(day)) return false;
        return checkTimeOverlap(item.time, time);
    });

    if (potentiallyConflicting.length === 0) return null;

    for (const item of potentiallyConflicting) {
        // 2. Room Conflict
        if (room && normalizeStr(item.room) === normalizeStr(room)) {
            const groupStr = (item.group && item.group !== 'All') ? `-${item.group}` : '';
            const semStr = item.sem ? `, ${item.sem} Sem` : '';
            return `Conflict! Room "${room}" is already booked for "${item.subject}" (${item.dept}-${item.section}${groupStr}${semStr}).`;  
        }

        // 3. Faculty Conflict
        // Helper: Check if two records represent the same person
        const isSamePerson = (name1, id1, name2, id2) => {  
            if (!name1 || !name2) return false;
            const n1 = normalizeStr(name1);
            const n2 = normalizeStr(name2);

            // If names differ, they are different people
            if (n1 !== n2) return false;

            // If names are identical, check IDs if BOTH exist
            if (id1 && id2) {
                // Different IDs = Different People (even if same name)
                return id1 === id2;
            }

            // If IDs are missing, assume same person (Cautionary Conflict)
            return true;
        };

        // Check if Input Faculty 1 collides with Schedule Item's Faculty 1 or 2
        if (isSamePerson(faculty, facultyEmpId, item.faculty, item.facultyEmpId) ||
            isSamePerson(faculty, facultyEmpId, item.faculty2, item.faculty2EmpId)) {
            return `Conflict! Faculty "${faculty}" is already teaching "${item.subject}" in ${item.room}.`;
        }

        // Check if Input Faculty 2 collides with Schedule Item's Faculty 1 or 2
        if (faculty2) {
            if (isSamePerson(faculty2, faculty2EmpId, item.faculty, item.facultyEmpId) ||
                isSamePerson(faculty2, faculty2EmpId, item.faculty2, item.faculty2EmpId)) {
                return `Conflict! Faculty "${faculty2}" is already teaching "${item.subject}" in ${item.room}.`;
            }
        }

        // 4. Student Group Conflict
        // Check Dept & Sem first (Normalized)
        if (dept && sem && normalizeStr(item.dept) === normalizeStr(dept) && normalizeStr(item.sem) === normalizeStr(sem)) {
            // Check Section/Group overlap
            const itemSection = normalizeStr(item.section) || 'all';
            const newSection = normalizeStr(section) || 'all';
            const itemGroup = normalizeStr(item.group) || 'all';
            const newGroup = normalizeStr(group) || 'all';

            // Section Overlap: A overlaps with A, All overlaps with A
            const sectionOverlap = (itemSection === 'all' || newSection === 'all' || itemSection === newSection);

            if (sectionOverlap) {
                // Group Overlap: 1 overlaps with 1, All overlaps with 1
                const groupOverlap = (itemGroup === 'all' || newGroup === 'all' || itemGroup === newGroup);

                if (groupOverlap) {
                    const groupStr = (item.group && item.group !== 'All') ? `-${item.group}` : '';
                    return `Conflict! Student Group "${dept}-${item.section}${groupStr} (${sem})" is already booked for "${item.subject}".`;
                }
            }
        }
    }

    return null;
};

/**
 * Advanced Schedule Analysis with "Smart" Logic
 * Returns structured insights instead of just blocking errors.
 */
export const analyzeSchedule = (booking, schedule, metadata = {}) => {
    const { roomsCount = 10 } = metadata; // Default metadata if missing

    // 1. Hard Conflicts
    const hardConflict = validateBooking(booking, schedule, { ignoreId: metadata.ignoreId });
    if (hardConflict) {
        return {
            status: 'error',
            message: hardConflict,
            details: { type: 'hard_conflict' }
        };
    }

    // 2. Soft Conflicts / Warnings
    const warnings = [];

    // Filter schedule for this day
    const dailySchedule = schedule.filter(s => normalizeStr(s.day) === normalizeStr(booking.day) && (!metadata.ignoreId || s.id !== metadata.ignoreId));

    // 2.1 Utilization Check
    const activeSlots = dailySchedule.filter(s => normalizeStr(s.time) === normalizeStr(booking.time));
    const effectiveRoomsCount = roomsCount > 0 ? roomsCount : 1;
    const utilization = Math.round(((activeSlots.length + 1) / effectiveRoomsCount) * 100);

    // 2.2 Subject Repetition for Group
    if (booking.subject && booking.section) {
        const normSubject = normalizeStr(booking.subject);
        const normDept = normalizeStr(booking.dept);
        const normSem = normalizeStr(booking.sem);
        const normSection = normalizeStr(booking.section);
        const normGroup = normalizeStr(booking.group || 'All');

        const sameSubject = dailySchedule.filter(s => {
            const sSubject = normalizeStr(s.subject);
            const sDept = normalizeStr(s.dept);
            const sSem = normalizeStr(s.sem);
            const sSection = normalizeStr(s.section);
            const sGroup = normalizeStr(s.group || 'All');

            return sSubject === normSubject &&
                sDept === normDept &&
                sSem === normSem &&
                (sSection === 'all' || normSection === 'all' || sSection === normSection) &&
                (sGroup === 'all' || normGroup === 'all' || sGroup === normGroup);
        });

        if (sameSubject.length > 0) {
            warnings.push(`Note: ${booking.subject} is already scheduled for this group today.`);
        }
    }

    // 2.3 Faculty Daily Load
    const checkFacultyLoad = (facName, facEmpId) => {  
        if (!facName) return;
        const normSearch = normalizeStr(facName);
        const count = dailySchedule.filter(s => {
            const f1 = normalizeStr(s.faculty);
            const f2 = normalizeStr(s.faculty2);
            const matchesId = facEmpId && (s.facultyEmpId === facEmpId || s.faculty2EmpId === facEmpId);
            return f1 === normSearch || f2 === normSearch || matchesId;
        }).length;

        if (count >= 4) {
            warnings.push(`Faculty ${facName} already has ${count} classes today.`);
        }
    };
    checkFacultyLoad(booking.faculty, booking.facultyEmpId);
    checkFacultyLoad(booking.faculty2, booking.faculty2EmpId);

    if (warnings.length > 0) {
        return {
            status: 'warning',
            message: warnings[0], // Primary warning
            messages: warnings,
            details: { utilization, type: 'soft_conflict' }
        };
    }

    return {
        status: 'success',
        message: 'Slot is optimal.',
        details: { utilization }
    };
};
