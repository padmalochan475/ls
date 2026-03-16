import { useScheduleContext } from '../contexts/ScheduleContext';

/**
 * Custom hook to consume the global schedule data.
 * NOTE: This now ignores the 'academicYear' argument and strictly uses the 
 * globally selected academic year from AuthContext (via ScheduleContext).
 * This optimization ensures data is cached and "snappy".
 */
export const useScheduleData = () => {
    // We could check if academicYear !== context.year and warn, 
    // but for this app's "Active Year" architecture, this is the intended behavior.
    return useScheduleContext();
};
