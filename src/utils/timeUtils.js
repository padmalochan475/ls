/**
 * Centralized Time and Utility functions for LAMS.
 * Use these to ensure consistency across Dashboard, Analytics, and Scheduling.
 */

/**
 * Robust Normalizer for strings: handles case and whitespace.
 * @param {string} val 
 * @returns {string} normalized string
 */
export const normalizeStr = (val) => val ? val.toString().toLowerCase().trim() : '';

/**
 * Robust Normalizer for time strings: handles "9:00" vs "09:00", dots vs colons, spaces, and case.
 * @param {string} val 
 * @returns {string} normalized time (e.g. "9:00am" -> "9:00")
 */
export const normalizeTime = (val) => {
    if (!val) return '';
    return val.toString()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[ap]m/g, '')
        .replace(/\./g, ':')
        .replace(/\b0(\d):/g, '$1:');
};

/**
 * Robust Local Date Formatter (YYYY-MM-DD).
 * Prevents UTC-induced date shifting.
 * @param {Date|string} date 
 * @returns {string} YYYY-MM-DD
 */
export const formatDateLocal = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Robust Day Name helper.
 * Correctly identifies weekday from local Date or "YYYY-MM-DD" string.
 * @param {Date|string} date 
 * @returns {string} Monday, Tuesday, etc.
 */
export const getDayName = (date) => {
    if (!date) return '';
    if (date instanceof Date) return date.toLocaleDateString('en-US', { weekday: 'long' });
    const parts = date.toString().split('-');
    if (parts.length === 3) {
        // Construct date manually to avoid UTC shift
        return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', { weekday: 'long' });
    }
    return new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
};

/**
 * Parse a time slot string like "10:00 AM - 11:00 AM" or "10.00-11.00" into start/end timestamps.
 * @param {string} timeStr - The time slot string.
 * @returns {object|null} - { start: number, end: number, duration: number } or null if invalid.
 */
export const parseTimeSlot = (timeStr) => {
    if (!timeStr) return null;
    try {
        const parts = timeStr.split('-').map(p => p.trim());
        if (parts.length < 2) return null;

        const cleanStart = parts[0].replace('.', ':');
        const cleanEnd = parts[1].replace('.', ':');

        const base = '2000/01/01 '; // Arbitrary date for time comparison
        const start = new Date(base + cleanStart);
        const end = new Date(base + cleanEnd);

        let startTime = start.getTime();
        let endTime = end.getTime();

        if (isNaN(startTime) || isNaN(endTime)) return null;

        // Handle cross-midnight (e.g., 11 PM - 1 AM)
        if (endTime < startTime) {
            endTime += 24 * 60 * 60 * 1000;
        }

        const durationHours = (endTime - startTime) / (1000 * 60 * 60);

        return { start: startTime, end: endTime, duration: durationHours };
    } catch {
        return null;
    }
};

/**
 * Convert a time string (e.g. "9:00 AM") to a Date object on a specific base date.
 * Useful for timeline logic.
 * @param {string} tStr 
 * @param {Date} baseDate 
 * @returns {Date}
 */
export const parseTimeToDate = (tStr, baseDate = new Date()) => {
    if (!tStr) return new Date(baseDate);
    const cleanTime = tStr.trim().replace('.', ':');
    const parts = cleanTime.split(' ');
    const timeParts = parts[0].split(':');
    let h = parseInt(timeParts[0], 10);
    let m = parseInt(timeParts[1], 10) || 0;

    const modifier = parts.length > 1 ? parts[1].toUpperCase() : null;
    if (modifier === 'PM' && h < 12) h += 12;
    if (modifier === 'AM' && h === 12) h = 0;
    // Heuristic for missing AM/PM
    if (!modifier && h < 7 && h !== 0) h += 12;

    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
};
