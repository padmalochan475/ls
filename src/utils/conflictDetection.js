
/**
 * Utility functions for conflict detection in the schedule.
 */

export const parseTimeSlot = (timeStr) => {
    if (!timeStr) return null;
    try {
        const parts = timeStr.replace(/\s+/g, ' ').split(' - ');
        if (parts.length !== 2) return null;

        const base = '2000/01/01 '; // Arbitrary base date
        const start = new Date(base + parts[0]);
        const end = new Date(base + parts[1]);

        let startTime = start.getTime();
        let endTime = end.getTime();

        if (isNaN(startTime) || isNaN(endTime)) return null;

        // Handle cross-midnight (e.g., 11 PM - 1 AM)
        if (endTime < startTime) {
            endTime += 24 * 60 * 60 * 1000;
        }

        return { start: startTime, end: endTime };
    } catch (e) {
        console.error("Error parsing time slot:", timeStr, e);
        return null;
    }
};

export const checkTimeOverlap = (t1, t2) => {
    if (!t1 || !t2) return false;
    if (t1 === t2) return true;

    const t1Slot = parseTimeSlot(t1);
    const t2Slot = parseTimeSlot(t2);

    if (!t1Slot || !t2Slot) return t1 === t2; // Fallback to exact string match if parsing fails

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
        if (faculty === faculty2) return "Invalid: Cannot select the same faculty twice.";
        if (facultyEmpId && faculty2EmpId && facultyEmpId === faculty2EmpId) {
            return "Invalid: Selected faculty members have the same Employee ID.";
        }
    }

    // Filter relevant bookings (same day, overlapping time)
    const potentiallyConflicting = schedule.filter(item => {
        if (ignoreId && item.id === ignoreId) return false;
        if (item.day !== day) return false;
        return checkTimeOverlap(item.time, time);
    });

    if (potentiallyConflicting.length === 0) return null;

    for (const item of potentiallyConflicting) {
        // 2. Room Conflict
        if (room && item.room === room) {
            return `Conflict! Room "${room}" is already booked for "${item.subject}" (${item.dept}-${item.section}).`;
        }

        // 3. Faculty Conflict
        const isFacultyBusy = (facName, facEmpId) => {
            if (!facName) return false;

            // Check EmpID (Stronger check)
            if (facEmpId) {
                if (item.facultyEmpId === facEmpId) return true;
                if (item.faculty2EmpId === facEmpId) return true;
            }

            // Check Name (Fallback)
            if (item.faculty === facName) return true;
            if (item.faculty2 === facName) return true;

            return false;
        };

        if (isFacultyBusy(faculty, facultyEmpId)) {
            return `Conflict! Faculty "${faculty}" is already teaching "${item.subject}" in ${item.room}.`;
        }
        if (isFacultyBusy(faculty2, faculty2EmpId)) {
            return `Conflict! Faculty "${faculty2}" is already teaching "${item.subject}" in ${item.room}.`;
        }

        // 4. Student Group Conflict
        // Check Dept & Sem first
        if (dept && sem && item.dept === dept && item.sem === sem) {
            // Check Section/Group overlap
            const itemSection = item.section || 'All';
            const newSection = section || 'All';
            const itemGroup = item.group || 'All';
            const newGroup = group || 'All';

            const sectionOverlap = (itemSection === 'All' || newSection === 'All' || itemSection === newSection);

            if (sectionOverlap) {
                const groupOverlap = (itemGroup === 'All' || newGroup === 'All' || itemGroup === newGroup);

                if (groupOverlap) {
                    return `Conflict! Student Group "${dept} ${sem} ${newSection}${newGroup !== 'All' ? '-' + newGroup : ''}" is already booked for "${item.subject}".`;
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
    const suggestions = [];

    // Filter schedule for this day
    const dailySchedule = schedule.filter(s => s.day === booking.day && (!metadata.ignoreId || s.id !== metadata.ignoreId));

    // 2.1 Utilization Check
    const activeSlots = dailySchedule.filter(s => s.time === booking.time);
    const utilization = Math.round(((activeSlots.length + 1) / roomsCount) * 100);

    if (utilization > 90) {
        warnings.push(`High traffic! ${utilization}% of rooms will be booked.`);
    }

    // 2.2 Subject Repetition for Group
    if (booking.subject && booking.section) {
        const sameSubject = dailySchedule.filter(s =>
            s.subject === booking.subject &&
            s.dept === booking.dept &&
            s.sem === booking.sem &&
            (s.section === 'All' || booking.section === 'All' || s.section === booking.section)
        );

        if (sameSubject.length > 0) {
            warnings.push(`Note: ${booking.subject} is already scheduled for this group today.`);
        }
    }

    // 2.3 Faculty Daily Load
    const checkFacultyLoad = (facName, facEmpId) => {
        if (!facName) return;
        const count = dailySchedule.filter(s =>
            (s.faculty === facName || s.faculty2 === facName) ||
            (facEmpId && (s.facultyEmpId === facEmpId || s.faculty2EmpId === facEmpId))
        ).length;

        if (count >= 4) {
            warnings.push(`Faculty ${facName} already has ${count} classes today.`);
        }
    };
    checkFacultyLoad(booking.faculty, booking.facultyEmpId);
    checkFacultyLoad(booking.faculty2, booking.faculty2EmpId);

    // 2.4 Consecutive Classes (Simple Check)
    // We can infer consecutive if times are adjacent. 
    // This requires parsing times for all daily schedule items, which might be expensive if many items.
    // Optimization: Skip for now to keep UI snappy, or implement if needed.

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
