import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { db } from '../lib/firebase';
import { doc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { User, Mail, Phone, BadgeCheck, Shield, Key, Edit2, Camera, X, Check, Eye, EyeOff, Bell, Calendar, Zap, Activity, Gift, Briefcase } from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import { useScheduleData } from '../hooks/useScheduleData';
import { sendNotification } from '../utils/notificationUtils';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import toast from 'react-hot-toast';
import '../styles/design-system.css';
import { useWritePermission } from '../hooks/useWritePermission';
import { normalizeStr } from '../utils/timeUtils';

// eslint-disable-next-line sonarjs/cognitive-complexity
const Profile = () => {
    const { userProfile, currentUser, activeAcademicYear } = useAuth();
    const { registerForPush, permission, oneSignalId } = useNotifications();
    const { checkWritePermission } = useWritePermission();
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Crop State
    const [imageSrc, setImageSrc] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [isCropping, setIsCropping] = useState(false);

    // Profile Form State
    const [formData, setFormData] = useState({
        name: '',
        mobile: '',
        dob: '',
        joiningDate: ''
    });

    // Password Change State
    const [passData, setPassData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [showPassword, setShowPassword] = useState({
        current: false,
        new: false,
        confirm: false
    });

    // Stats Computation
    const { schedule: assignments } = useScheduleData(activeAcademicYear);
    const stats = useMemo(() => {
        if (!userProfile || !assignments) return { weeklyLoad: 0, chartData: [], subjects: 0 };

        const myNameNorm = normalizeStr(userProfile.name);
        const myAssignments = assignments.filter(a => {
            const f1 = normalizeStr(a.faculty);
            const f2 = normalizeStr(a.faculty2);
            const matchesId = userProfile.empId && (a.facultyEmpId === userProfile.empId || a.faculty2EmpId === userProfile.empId);
            return f1 === myNameNorm || f2 === myNameNorm || matchesId;
        });

        const dayCounts = { 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0 };
        myAssignments.forEach(a => {
            if (dayCounts[a.day] !== undefined) dayCounts[a.day]++;
        });

        const chartData = Object.keys(dayCounts).map(d => ({
            day: d.substring(0, 3), // Mon, Tue...
            classes: dayCounts[d]
        }));

        const uniqueSubjects = new Set(myAssignments.map(a => a.subject)).size;

        return {
            weeklyLoad: myAssignments.length,
            chartData,
            subjects: uniqueSubjects
        };
    }, [userProfile, assignments]);

    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return 'Click to set date';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-GB');
    };

    useEffect(() => {
        if (userProfile) {
            setFormData({
                name: userProfile.name || '',
                mobile: userProfile.mobile || '',
                dob: userProfile.dob || '',
                joiningDate: userProfile.joiningDate || ''
            });
        }
    }, [userProfile]);

    const onCropComplete = (croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'Please select an image file.' });
            return;
        }

        const reader = new FileReader();
        reader.addEventListener('load', () => {
            setImageSrc(reader.result);
            setIsCropping(true);
        });
        reader.readAsDataURL(file);
        e.target.value = null; // Reset input
    };


    const handleSaveCrop = async () => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!imageSrc || !croppedAreaPixels) {
            console.error("Missing image source or crop data");
            return;
        }

        setUploading(true);
        setMessage({ type: 'info', text: 'Processing image...' });

        try {
            // 1. Get the cropped image as a Canvas
            const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);

            // 2. Convert Blob to Base64 String
            const reader = new FileReader();
            reader.readAsDataURL(croppedImageBlob);

            reader.onloadend = async () => {
                const base64String = reader.result;

                // 3. Save directly to Firestore (Bypassing Storage CORS issues)
                // 3. Save directly to Firestore (Bypassing Storage CORS issues)
                const userRef = doc(db, 'users', currentUser.uid);
                await updateDoc(userRef, { photoURL: base64String });

                // 4. SYNC TO FACULTY MASTER DATA
                // If this user is linked to a faculty member, update their master data image too.
                if (userProfile?.empId) {
                    try {
                        const q = query(collection(db, 'faculty'), where('empId', '==', userProfile.empId));
                        const snapshot = await getDocs(q);
                        if (!snapshot.empty) {
                            const facultyDoc = snapshot.docs[0];
                            await updateDoc(facultyDoc.ref, { photoURL: base64String });
                            // console.log("Synced profile image to Faculty Master Data");
                        }
                    } catch (syncErr) {
                        console.error("Failed to sync image to faculty:", syncErr);
                        // Don't block the UI success, just log it.
                    }
                }

                setMessage({ type: 'success', text: 'Profile picture updated!' });
                setIsCropping(false);
                setImageSrc(null);
            };

        } catch (error) {
            console.error("Error saving image:", error);
            setMessage({ type: 'error', text: 'Failed to save image. ' + error.message });
        } finally {
            setUploading(false);
        }
    };

    const handleCancelCrop = () => {
        setIsCropping(false);
        setImageSrc(null);
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();

        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const userRef = doc(db, 'users', currentUser.uid);

            // Prepare update data
            // LOCK NAME: If linked to Faculty (has empId), do NOT allow name change here.
            // It must be done via Master Data to trigger cascade.
            let updateData = {
                mobile: formData.mobile,
                dob: formData.dob,
                joiningDate: formData.joiningDate
            };

            if (!userProfile.empId) {
                // Only allow name update if NOT linked
                updateData.name = formData.name;
            } else if (formData.name !== userProfile.name) {
                // Warn if they tried to hack/change it
                toast.error("Name change restricted for Faculty accounts. Contact Admin.");
                // We proceed but ignore the name change
            }

            await updateDoc(userRef, updateData);

            // SYNC TO FACULTY MASTER DATA
            if (userProfile?.empId) {
                try {
                    const q = query(collection(db, 'faculty'), where('empId', '==', userProfile.empId));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        const facultyDoc = snapshot.docs[0];
                        await updateDoc(facultyDoc.ref, {
                            // name: formData.name, // DO NOT SYNC NAME from here. unsafe.
                            mobile: formData.mobile
                        });
                    }
                } catch (syncErr) {
                    console.error("Failed to sync profile to faculty:", syncErr);
                }
            }

            setMessage({ type: 'success', text: 'Profile updated successfully!' });
            setIsEditing(false);
        } catch (error) {
            console.error(error);
            setMessage({ type: 'error', text: 'Failed to update profile.' });
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        if (passData.newPassword !== passData.confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match.' });
            setLoading(false);
            return;
        }

        if (passData.newPassword.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
            setLoading(false);
            return;
        }

        try {
            // Re-authenticate user
            const credential = EmailAuthProvider.credential(currentUser.email, passData.currentPassword);
            await reauthenticateWithCredential(currentUser, credential);

            // Update password
            await updatePassword(currentUser, passData.newPassword);

            setMessage({ type: 'success', text: 'Password changed successfully!' });
            setPassData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                setMessage({ type: 'error', text: 'Incorrect current password.' });
            } else {
                setMessage({ type: 'error', text: 'Failed to change password. Try again.' });
            }
        } finally {
            setLoading(false);
        }
    };

    if (!userProfile) return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading Profile...</div>;

    return (
        <div style={{ paddingBottom: '4rem', maxWidth: '1200px', margin: '0 auto' }}>

            {/* 1. Hero Banner */}
            <div className="profile-hero">
                {/* Float Avatar */}
                <div className="profile-avatar-container" onClick={() => document.getElementById('profile-upload').click()}>
                    <div style={{
                        width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', position: 'relative',
                        background: 'var(--color-bg-secondary)'
                    }}>
                        {userProfile.photoURL ? (
                            <img src={userProfile.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <User size={48} color="var(--color-text-muted)" />
                            </div>
                        )}
                        {/* Overlay */}
                        <div className="avatar-overlay" style={{
                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: 0, transition: 'opacity 0.2s'
                        }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                            <Camera color="white" size={24} />
                        </div>
                    </div>
                </div>

                <div className="profile-hero-content">
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.3)', margin: 0 }}>{userProfile.name}</h1>
                    <div className="profile-badges" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)',
                            padding: '0.35rem 1rem', borderRadius: '99px', fontSize: '0.9rem', fontWeight: 600, color: 'white',
                            display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid rgba(255,255,255,0.3)'
                        }}>
                            <Shield size={14} /> {userProfile.role ? userProfile.role.toUpperCase() : 'USER'}
                        </span>
                        <span style={{
                            background: 'rgba(16, 185, 129, 0.2)', backdropFilter: 'blur(4px)',
                            padding: '0.35rem 1rem', borderRadius: '99px', fontSize: '0.9rem', fontWeight: 600, color: '#34d399',
                            display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid rgba(16, 185, 129, 0.3)'
                        }}>
                            <BadgeCheck size={14} /> {userProfile.status ? userProfile.status.toUpperCase() : 'ACTIVE'}
                        </span>
                    </div>
                </div>

                {/* Hidden Input */}
                <input
                    id="profile-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                />
            </div>

            {message.text && (
                <div style={{
                    marginBottom: '2rem', padding: '1rem', borderRadius: '12px',
                    background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: message.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                    color: message.type === 'success' ? '#34d399' : '#f87171',
                    display: 'flex', alignItems: 'center', gap: '1rem', animation: 'fadeIn 0.3s ease'
                }}>
                    {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
                    {message.text}
                </div>
            )}

            <div className="profile-grid">

                {/* Left Col: Personal & Settings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* 2. Personal Info Card */}
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <User size={20} />
                                </div>
                                Personal Details
                            </h3>
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className="btn form-btn"
                                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                            >
                                {isEditing ? <X size={14} /> : <Edit2 size={14} />}
                                {isEditing ? 'Cancel' : 'Edit Profile'}
                            </button>
                        </div>

                        <form onSubmit={handleProfileUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Full Name</label>
                                <div style={{ position: 'relative' }}>
                                    <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                                    <input
                                        type="text"
                                        className="glass-input"
                                        style={{ paddingLeft: '3rem', opacity: userProfile.empId ? 0.7 : 1 }}
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        disabled={!isEditing || !!userProfile.empId}
                                        title={userProfile.empId ? "Contact Admin to change your official name." : "Edit Name"}
                                    />
                                </div>
                                {userProfile.empId && isEditing && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', paddingLeft: '0.5rem' }}>
                                        * Name change disabled for linked accounts. Contact Admin.
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Email Address</label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                                    <input
                                        type="email"
                                        className="glass-input"
                                        style={{ paddingLeft: '3rem', opacity: 0.7 }}
                                        value={userProfile.email}
                                        disabled={true}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Mobile Number</label>
                                <div style={{ position: 'relative' }}>
                                    <Phone size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                                    <input
                                        type="text"
                                        className="glass-input"
                                        style={{ paddingLeft: '3rem' }}
                                        value={formData.mobile}
                                        onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                                        disabled={!isEditing}
                                        placeholder="+91..."
                                    />
                                </div>
                            </div>

                            <div className="responsive-two-col">
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Birthday</label>
                                    <div style={{ position: 'relative' }}>
                                        <Gift size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                                        {isEditing ? (
                                            <>
                                                <input
                                                    type="text"
                                                    className="glass-input"
                                                    style={{ paddingLeft: '3rem', cursor: 'pointer' }}
                                                    value={formData.dob ? formatDateDisplay(formData.dob) : ''}
                                                    placeholder="DD/MM/YYYY"
                                                    readOnly
                                                />
                                                <input
                                                    type="date"
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        width: '100%',
                                                        height: '100%',
                                                        opacity: 0,
                                                        cursor: 'pointer',
                                                        zIndex: 10
                                                    }}
                                                    value={formData.dob}
                                                    onChange={e => setFormData({ ...formData, dob: e.target.value })}
                                                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                                                />
                                            </>
                                        ) : (
                                            <div onClick={() => setIsEditing(true)} className="glass-input" style={{ paddingLeft: '3rem', display: 'flex', alignItems: 'center', color: formData.dob ? 'inherit' : 'var(--color-text-muted)', opacity: 0.8, cursor: 'pointer' }} title="Click to edit">
                                                {formatDateDisplay(formData.dob)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Joining Date</label>
                                    <div style={{ position: 'relative' }}>
                                        <Briefcase size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                                        {isEditing ? (
                                            <>
                                                <input
                                                    type="text"
                                                    className="glass-input"
                                                    style={{ paddingLeft: '3rem', cursor: 'pointer' }}
                                                    value={formData.joiningDate ? formatDateDisplay(formData.joiningDate) : ''}
                                                    placeholder="DD/MM/YYYY"
                                                    readOnly
                                                />
                                                <input
                                                    type="date"
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        width: '100%',
                                                        height: '100%',
                                                        opacity: 0,
                                                        cursor: 'pointer',
                                                        zIndex: 10
                                                    }}
                                                    value={formData.joiningDate}
                                                    onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                                                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                                                />
                                            </>
                                        ) : (
                                            <div onClick={() => setIsEditing(true)} className="glass-input" style={{ paddingLeft: '3rem', display: 'flex', alignItems: 'center', color: formData.joiningDate ? 'inherit' : 'var(--color-text-muted)', opacity: 0.8, cursor: 'pointer' }} title="Click to edit">
                                                {formatDateDisplay(formData.joiningDate)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Employee ID:</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '1px' }}>{userProfile.empId || 'N/A'}</div>
                            </div>

                            {isEditing && (
                                <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center' }}>
                                    {loading ? 'Saving...' : 'Save Changes'}
                                </button>
                            )}
                        </form>
                    </div>

                    {/* 3. Security Card */}
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Shield size={20} />
                            </div>
                            Security & Login
                        </h3>
                        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Password Fields with Toggle */}
                            {['current', 'new', 'confirm'].map((type) => (
                                <div key={type}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                                        {type === 'confirm' ? 'Confirm Password' : type + ' Password'}
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <Key size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                                        <input
                                            type={showPassword[type] ? 'text' : 'password'}
                                            className="glass-input"
                                            style={{ paddingLeft: '3rem', paddingRight: '3rem' }}
                                            value={type === 'current' ? passData.currentPassword : type === 'new' ? passData.newPassword : passData.confirmPassword} // eslint-disable-line sonarjs/no-nested-conditional
                                            onChange={e => setPassData({ ...passData, [`${type}Password`]: e.target.value })}
                                            placeholder={type === 'current' ? '••••••••' : 'New secure password'}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword({ ...showPassword, [type]: !showPassword[type] })}
                                            style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                                        >
                                            {showPassword[type] ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <button type="submit" className="btn" style={{ justifyContent: 'center', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginTop: '0.5rem' }}>
                                {loading ? 'Processing...' : 'Change Password'}
                            </button>
                        </form>

                        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{
                                background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.05) 0%, rgba(127, 29, 29, 0.1) 100%)',
                                borderRadius: '16px',
                                padding: '1.5rem',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                {/* Decorative Background Elements */}
                                <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.05 }}>
                                    <Shield size={100} />
                                </div>

                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', position: 'relative', zIndex: 1 }}>
                                    <div style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        padding: '10px',
                                        borderRadius: '12px',
                                        color: '#f87171',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Zap size={24} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ margin: '0 0 0.5rem 0', color: '#fca5a5', fontSize: '1.1rem' }}>Active Sessions Control</h4>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                                            Prevent unauthorized access by logging out of all other devices immediately.
                                            <span style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.8rem', opacity: 0.7 }}>
                                                Useful if you logged in on a public computer.
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        className="btn"
                                        onClick={async () => {
                                            if (!window.confirm("Are you sure? This will disconnect all other devices.")) return;
                                            setLoading(true);
                                            try {
                                                // Get ID Token
                                                const token = await currentUser.getIdToken();

                                                // Call Vercel API
                                                const response = await fetch('/api/revoke-session', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${token}`
                                                    }
                                                });

                                                const text = await response.text();
                                                let data;
                                                try {
                                                    data = JSON.parse(text);
                                                } catch {
                                                    // Start of HTML or generic error
                                                    throw new Error(`Server Error (${response.status}): ${text.substring(0, 50)}...`);
                                                }

                                                if (!response.ok) {
                                                    throw new Error(data.details || data.error || `Request failed with status ${response.status}`);
                                                }

                                                toast.success("Security sweep complete. Other sessions revoked.");
                                            } catch (e) {
                                                console.error(e);
                                                toast.error(`Process failed: ${e.message}`);
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                        disabled={loading}
                                        style={{
                                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                            border: 'none',
                                            color: 'white',
                                            padding: '0.6rem 1.2rem',
                                            borderRadius: '8px',
                                            fontWeight: '600',
                                            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                            cursor: loading ? 'not-allowed' : 'pointer'
                                        }}
                                        onMouseEnter={e => !loading && (e.currentTarget.style.transform = 'translateY(-2px)')}
                                        onMouseLeave={e => !loading && (e.currentTarget.style.transform = 'translateY(0)')}
                                    >
                                        {loading ? (
                                            <>
                                                <Activity className="spin" size={18} /> Processing...
                                            </>
                                        ) : (
                                            <>
                                                <EyeOff size={18} /> Log Out Other Devices
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Col: Activity & Context */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* 4. Stats Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05))' }}>
                            <Activity size={24} color="#3b82f6" style={{ marginBottom: '0.5rem', opacity: 0.8 }} />
                            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{stats.weeklyLoad}</div>
                            <div style={{ fontSize: '0.8rem', color: '#93c5fd' }}>Classes/Week</div>
                        </div>
                        <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05))' }}>
                            <Calendar size={24} color="#10b981" style={{ marginBottom: '0.5rem', opacity: 0.8 }} />
                            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{stats.subjects}</div>
                            <div style={{ fontSize: '0.8rem', color: '#6ee7b7' }}>Subjects</div>
                        </div>
                    </div>

                    {/* 5. Weekly Activity Chart */}
                    <div className="glass-panel" style={{ padding: '2rem', minHeight: '300px' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Activity size={20} />
                            </div>
                            Weekly Workload
                        </h3>
                        <div style={{ height: '200px' }}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <BarChart data={stats.chartData} barSize={20}>
                                    <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }}
                                    />
                                    <Bar dataKey="classes" radius={[4, 4, 0, 0]}>
                                        {stats.chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171'][index % 6]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            Based on your currently assigned schedule.
                        </p>
                    </div>

                    {/* 6. Notification Settings (Simplified) */}
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Bell size={20} />
                            </div>
                            Push Notifications
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
                            Enable push notifications for real-time updates.
                        </p>
                        {permission === 'granted' ? (
                            <div className="flex flex-col gap-2">
                                <button
                                    className="btn btn-secondary w-full"
                                    onClick={async () => {
                                        const actualId = oneSignalId || window.OneSignal?.User?.PushSubscription?.id;
                                        if (!actualId) return toast.error("No ID found. Click Enable again or Refresh.");

                                        toast.promise(
                                            sendNotification({
                                                userIds: [currentUser.uid],
                                                title: 'Self Test',
                                                body: 'If you see this, your device is reachable!',
                                                data: { type: 'test' }
                                            }).then(res => {
                                                if (!res.success) throw new Error(res.message);
                                                return res;
                                            }),
                                            {
                                                loading: 'Sending Test...',
                                                success: 'Sent! Check In-App & Device.',
                                                error: (err) => `Failed: ${err.message}`
                                            }
                                        );
                                    }}
                                >
                                    <Bell size={18} /> Test Notification
                                </button>
                                {/* Automatic Connection Management Active */}
                            </div>
                        ) : (
                            <button
                                className="btn"
                                onClick={registerForPush}
                                style={{
                                    width: '100%', justifyContent: 'center',
                                    background: 'var(--color-accent)',
                                    color: 'white'
                                }}
                            >
                                <Bell size={18} /> Enable Notifications
                            </button>
                        )}


                    </div>








                </div>


            </div>


            {/* Crop Modal */}
            {
                isCropping && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)', zIndex: 9999,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div className="glass-panel" style={{ width: '90%', maxWidth: '500px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 style={{ textAlign: 'center', margin: 0 }}>Adjust Profile Picture</h3>
                            <div style={{ position: 'relative', width: '100%', height: '300px', background: '#333', borderRadius: '12px', overflow: 'hidden' }}>
                                <Cropper
                                    image={imageSrc}
                                    crop={crop}
                                    zoom={zoom}
                                    aspect={1}
                                    onCropChange={setCrop}
                                    onCropComplete={onCropComplete}
                                    onZoomChange={setZoom}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ fontSize: '0.9rem' }}>Zoom</span>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    onChange={(e) => setZoom(e.target.value)}
                                    style={{ flex: 1, accentColor: 'var(--color-accent)' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button onClick={handleCancelCrop} className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
                                <button onClick={handleSaveCrop} className="btn btn-primary" style={{ flex: 1 }}>
                                    {uploading ? 'Saving...' : 'Save Picture'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};



const profileStyles = `
    .profile-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 2rem;
    }
    .profile-hero {
        height: 220px;
        border-radius: 24px;
        background: linear-gradient(120deg, #ec4899, #8b5cf6, #3b82f6);
        position: relative;
        margin-bottom: 5rem;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        display: flex;
        align-items: flex-end;
        padding: 2rem;
    }
    .profile-avatar-container {
        position: absolute;
        bottom: -60px;
        left: 3rem;
        width: 140px;
        height: 140px;
        border-radius: 50%;
        border: 6px solid var(--color-bg-main);
        background: var(--color-bg-main);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10;
    }
    .profile-hero-content {
        margin-left: 160px;
        margin-bottom: -10px;
    }

    @media (max-width: 768px) {
        .profile-grid {
            grid-template-columns: 1fr;
        }
        .profile-hero {
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding-bottom: 5rem;
            height: auto;
            min-height: 220px;
        }
        .profile-avatar-container {
            left: 50%;
            transform: translateX(-50%);
            bottom: -50px;
        }
        .profile-hero-content {
            margin-left: 0;
            margin-bottom: 0;
            width: 100%;
        }
        .profile-badges {
            justify-content: center;
        }
    }
`;

export default function ProfileWithStyles() {
    return (
        <>
            <style>{profileStyles}</style>
            <Profile />
        </>
    );
}
