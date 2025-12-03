import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, auth, storage } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { User, Mail, Phone, BadgeCheck, Shield, Key, Save, Edit2, Camera, X, Check } from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import '../styles/design-system.css';

const Profile = () => {
    const { userProfile, currentUser } = useAuth();
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
        mobile: ''
    });

    // Password Change State
    const [passData, setPassData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    useEffect(() => {
        if (userProfile) {
            setFormData({
                name: userProfile.name || '',
                mobile: userProfile.mobile || ''
            });
        }
    }, [userProfile]);

    const onCropComplete = (croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
        const handleCancelCrop = () => {
            setIsCropping(false);
            setImageSrc(null);
        };

        const handleProfileUpdate = async (e) => {
            e.preventDefault();
            setLoading(true);
            setMessage({ type: '', text: '' });

            try {
                const userRef = doc(db, 'users', currentUser.uid);
                await updateDoc(userRef, {
                    name: formData.name,
                    mobile: formData.mobile
                });
                setMessage({ type: 'success', text: 'Profile updated successfully!' });
                setIsEditing(false);
                setTimeout(() => window.location.reload(), 1000); // Reload to refresh context
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

        if (!userProfile) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Profile...</div>;

        return (
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <User size={32} /> My Profile
                </h2>

                {message.text && (
                    <div style={{
                        padding: '1rem',
                        borderRadius: '8px',
                        background: message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : message.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                        color: message.type === 'success' ? '#6ee7b7' : message.type === 'error' ? '#fca5a5' : '#93c5fd',
                        border: `1px solid ${message.type === 'success' ? '#10b981' : message.type === 'error' ? '#ef4444' : '#3b82f6'}`
                    }}>
                        {message.text}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

                    {/* Profile Details Card */}
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-accent)' }}>Personal Details</h3>
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className="btn"
                                style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                {isEditing ? 'Cancel' : <><Edit2 size={16} /> Edit</>}
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
                            <div style={{ position: 'relative', width: '100px', height: '100px' }}>
                                <div style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    border: '2px solid var(--color-accent)',
                                    background: 'var(--color-bg-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {userProfile.photoURL ? (
                                        <img src={userProfile.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <User size={48} color="var(--color-text-muted)" />
                                    )}
                                </div>
                                <label
                                    htmlFor="profile-upload"
                                    style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        right: 0,
                                        background: 'var(--color-accent)',
                                        borderRadius: '50%',
                                        width: '32px',
                                        height: '32px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                                    }}
                                >
                                    {uploading ? (
                                        <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                    ) : (
                                        <Camera size={16} color="white" />
                                    )}
                                </label>
                                <input
                                    id="profile-upload"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    style={{ display: 'none' }}
                                    disabled={uploading}
                                />
                            </div>
                        </div>

                        {/* Crop Modal */}
                        {isCropping && (
                            <div style={{
                                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(0,0,0,0.85)', zIndex: 9999,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <div style={{ position: 'relative', width: '90%', maxWidth: '500px', height: '400px', background: '#333', borderRadius: '8px', overflow: 'hidden' }}>
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
                                <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', width: '90%', maxWidth: '500px' }}>
                                    <input
                                        type="range"
                                        value={zoom}
                                        min={1}
                                        max={3}
                                        step={0.1}
                                        aria-labelledby="Zoom"
                                        onChange={(e) => setZoom(e.target.value)}
                                        className="zoom-range"
                                        style={{ flex: 1 }}
                                    />
                                </div>
                                <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                                    <button onClick={handleCancelCrop} className="btn" style={{ background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <X size={18} /> Cancel
                                    </button>
                                    <button onClick={handleSaveCrop} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Check size={18} /> Save & Upload
                                    </button>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleProfileUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Full Name</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <User size={20} color="var(--color-text-muted)" />
                                    {isEditing ? (
                                        <input
                                            className="glass-input"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                        />
                                    ) : (
                                        <span style={{ fontSize: '1.1rem' }}>{userProfile.name}</span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Employee ID</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <BadgeCheck size={20} color="var(--color-text-muted)" />
                                    <span style={{ fontSize: '1.1rem', fontFamily: 'monospace' }}>{userProfile.empId}</span>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Email Address</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Mail size={20} color="var(--color-text-muted)" />
                                    <span style={{ fontSize: '1.1rem' }}>{userProfile.email}</span>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Mobile Number</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Phone size={20} color="var(--color-text-muted)" />
                                    {isEditing ? (
                                        <input
                                            className="glass-input"
                                            value={formData.mobile}
                                            onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                                            placeholder="Add mobile number"
                                        />
                                    ) : (
                                        <span style={{ fontSize: '1.1rem' }}>{userProfile.mobile || 'Not set'}</span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Role</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Shield size={20} color="var(--color-text-muted)" />
                                    <span style={{
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '12px',
                                        background: userProfile.role === 'admin' ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)',
                                        fontSize: '0.875rem',
                                        textTransform: 'capitalize'
                                    }}>
                                        {userProfile.role}
                                    </span>
                                </div>
                            </div>

                            {isEditing && (
                                <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                    <Save size={18} /> Save Changes
                                </button>
                            )}
                        </form>
                    </div>

                    {/* Change Password Card */}
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Key size={20} /> Change Password
                        </h3>

                        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Current Password</label>
                                <input
                                    type="password"
                                    className="glass-input"
                                    value={passData.currentPassword}
                                    onChange={(e) => setPassData({ ...passData, currentPassword: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>New Password</label>
                                <input
                                    type="password"
                                    className="glass-input"
                                    value={passData.newPassword}
                                    onChange={(e) => setPassData({ ...passData, newPassword: e.target.value })}
                                    required
                                    minLength={6}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Confirm New Password</label>
                                <input
                                    type="password"
                                    className="glass-input"
                                    value={passData.confirmPassword}
                                    onChange={(e) => setPassData({ ...passData, confirmPassword: e.target.value })}
                                    required
                                    minLength={6}
                                />
                            </div>

                            <button type="submit" className="btn" disabled={loading} style={{ background: 'var(--color-accent)', marginTop: '1rem' }}>
                                {loading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    };

    export default Profile;
