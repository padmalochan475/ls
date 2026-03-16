
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export const useWritePermission = () => {
    const { activeAcademicYear, systemAcademicYear } = useAuth();

    const checkWritePermission = (quiet = false) => {
        if (!activeAcademicYear || !systemAcademicYear) return false;

        // Normalize strings (trim)
        const active = activeAcademicYear.trim();
        const system = systemAcademicYear.trim();

        if (active !== system) {
            if (!quiet) {
                toast.error(`Read-Only Mode: You are viewing an archived or future year (${active}). Switch to ${system} to edit.`, {
                    duration: 5000,
                    icon: '🔒'
                });
            }
            return false;
        }
        return true;
    };

    return { checkWritePermission };
};
