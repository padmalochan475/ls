import React from 'react';
import { createPortal } from 'react-dom';
import { Select } from './SchedulerControls';

const BookingModal = ({
    isOpen,
    onClose,
    editingId,
    formData,
    setFormData,
    onSave,
    error,
    departments = [],
    semesters = [],
    subjectDetails = [],
    rooms = [],
    faculty = [],
    groups = []
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
        }}>
            <div className="glass-panel" style={{ width: '500px', maxWidth: '95vw', padding: '2rem', overflow: 'visible' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>{editingId ? 'Edit Class' : 'Add Class'}</h3>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>{formData.day} @ {formData.time}</p>

                {error && (
                    <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                        ⚠️ {error}
                    </div>
                )}

                <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Select
                                ariaLabel="Department"
                                options={departments}
                                value={formData.dept}
                                onChange={val => setFormData({ ...formData, dept: val })}
                                placeholder="Select Dept"
                            />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Select
                                ariaLabel="Semester"
                                options={semesters.map(s => ({ value: s.name, label: s.name }))}
                                value={formData.sem}
                                onChange={val => setFormData({ ...formData, sem: val })}
                                placeholder="Select Sem"
                            />
                        </div>
                    </div>
                    <Select
                        ariaLabel="Subject"
                        options={subjectDetails.map(s => ({ value: s.name, label: `${s.name} ${s.shortCode ? `[${s.shortCode}]` : ''}` }))} // eslint-disable-line sonarjs/no-nested-template-literals
                        value={formData.subject}
                        onChange={val => setFormData({ ...formData, subject: val })}
                        placeholder="Select Subject"
                    />

                    <Select
                        ariaLabel="Room"
                        options={rooms}
                        value={formData.room}
                        onChange={val => setFormData({ ...formData, room: val })}
                        placeholder="Select Room"
                    />

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Select
                                ariaLabel="Faculty 1"
                                options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))} // eslint-disable-line sonarjs/no-nested-template-literals
                                value={formData.faculty}
                                onChange={val => setFormData({ ...formData, faculty: val })}
                                placeholder="Faculty 1"
                            />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Select
                                ariaLabel="Faculty 2"
                                options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))} // eslint-disable-line sonarjs/no-nested-template-literals
                                value={formData.faculty2}
                                onChange={val => setFormData({ ...formData, faculty2: val })}
                                placeholder="Faculty 2"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                            <Select
                                ariaLabel="Main Group"
                                options={groups.map(g => ({ value: g.name, label: g.name }))}
                                value={formData.section}
                                onChange={val => setFormData({ ...formData, section: val, group: '' })}
                                placeholder="Select Group"
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <Select
                                ariaLabel="Sub Group"
                                options={formData.section && groups.find(g => g.name === formData.section)?.subGroups || []}
                                value={formData.group}
                                onChange={val => setFormData({ ...formData, group: val })}
                                placeholder={
                                    formData.section && (!groups.find(g => g.name === formData.section)?.subGroups?.length)
                                        ? "No Sub-Groups"
                                        : "Select Sub-Group"
                                }
                                disabled={!formData.section || !groups.find(g => g.name === formData.section)?.subGroups?.length}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
                        <button type="submit" className="btn" style={{ flex: 1, background: 'var(--color-accent)' }}>Save</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default BookingModal;
