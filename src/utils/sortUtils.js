/**
 * sortUtils.js — Semester sorting utilities
 * Used by pdfGenerator, excelGenerator, and Scheduler
 */

/**
 * Extract a numeric value from a semester string for sorting purposes.
 * Handles ordinal formats like "1st", "2nd", "3rd", "4th" and
 * Roman numeral / keyword formats like "I", "II", "III", "IV".
 *
 * @param {string} semStr
 * @returns {number}
 */
export const getSemesterNumber = (semStr) => {
    if (!semStr) return 999;
    const s = String(semStr).trim();

    // Match leading ordinal number: "1st", "2nd", "3rd", "4th Semester"
    const ordinalMatch = s.match(/^(\d+)/);
    if (ordinalMatch) return parseInt(ordinalMatch[1], 10);

    // Roman numerals (I–VIII)
    const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
    const upperS = s.toUpperCase();
    for (const [roman, val] of Object.entries(romanMap).sort((a, b) => b[0].length - a[0].length)) {
        if (upperS.startsWith(roman)) return val;
    }

    // "Semester N" or "Sem N"
    const wordMatch = s.match(/(?:semester|sem)\s*(\d+)/i);
    if (wordMatch) return parseInt(wordMatch[1], 10);

    return 999;
};

/**
 * Comparator function for sorting by semester.
 * Accepts either two semester strings OR two assignment objects (with a .sem property).
 * This dual-mode signature matches how pdfGenerator, excelGenerator, and Scheduler use it
 * as a direct Array.sort() comparator on assignment objects.
 *
 * @param {string|object} a - semester string, or assignment object with .sem
 * @param {string|object} b - semester string, or assignment object with .sem
 * @returns {number}
 */
export const sortSemesters = (a, b) => {
    const semA = (a && typeof a === 'object') ? (a.sem || '') : (a || '');
    const semB = (b && typeof b === 'object') ? (b.sem || '') : (b || '');
    return getSemesterNumber(semA) - getSemesterNumber(semB);
};
