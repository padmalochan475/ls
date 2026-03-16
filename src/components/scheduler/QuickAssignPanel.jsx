import React from 'react';
import { Zap, X } from 'lucide-react';
import { Select } from './SchedulerControls';

const QuickAssignPanel = ({
    isVisible,
    onClose,
    data,
    setData,
    onSave, // handleSave callback
    departments = [],
    semesters = [],
    subjectDetails = [],
    rooms = [],
    faculty = [],
    groups = [],
    days = [],
    timeSlots = []
}) => {
    if (!isVisible) return null;

    return (
        <div className="animate-fade-in" style={{
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            background: 'linear-gradient(to right, rgba(245, 158, 11, 0.05), rgba(30, 41, 59, 0.9))',
            backdropFilter: 'blur(12px)',
            marginTop: '8px',
            boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '10px' }}>
                        <Zap size={20} color="#f59e0b" fill="#f59e0b" />
                    </div>
                    <div>
                        <span style={{ fontWeight: 800, color: '#f59e0b', fontSize: '1rem', letterSpacing: '0.05em', display: 'block' }}>QUICK ASSIGN</span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Configure class details to quickly add to schedule</span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '8px',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = 'white'; }}
                    onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = '#94a3b8'; }}
                >
                    <X size={18} />
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <Select
                    options={departments}
                    value={data.dept}
                    onChange={val => setData({ ...data, dept: val })}
                    placeholder="Select Dept"
                />
                <Select
                    options={semesters.map(s => ({ value: s.name, label: s.name }))}
                    value={data.sem}
                    onChange={val => setData({ ...data, sem: val })}
                    placeholder="Select Sem"
                />
                <Select
                    options={subjectDetails.map(s => ({ value: s.name, label: `${s.name} ${s.shortCode ? `[${s.shortCode}]` : ''}` }))} // eslint-disable-line sonarjs/no-nested-template-literals
                    value={data.subject}
                    onChange={val => setData({ ...data, subject: val })}
                    placeholder="Select Subject"
                />
                <Select
                    options={rooms}
                    value={data.room}
                    onChange={val => setData({ ...data, room: val })}
                    placeholder="Select Room"
                />
                <Select
                    options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))} // eslint-disable-line sonarjs/no-nested-template-literals
                    value={data.faculty}
                    onChange={val => setData({ ...data, faculty: val })}
                    placeholder="Faculty 1"
                />
                <Select
                    options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))} // eslint-disable-line sonarjs/no-nested-template-literals
                    value={data.faculty2}
                    onChange={val => setData({ ...data, faculty2: val })}
                    placeholder="Faculty 2"
                />
                <Select
                    options={groups.map(g => ({ value: g.name, label: g.name }))}
                    value={data.section}
                    onChange={val => setData({ ...data, section: val, group: '' })}
                    placeholder="Group"
                />

                {data.section && groups.find(g => g.name === data.section)?.subGroups?.length > 0 ? (
                    <Select
                        options={groups.find(g => g.name === data.section)?.subGroups || []}
                        value={data.group}
                        onChange={val => setData({ ...data, group: val })}
                        placeholder="Sub-Group"
                    />
                ) : (
                    <div style={{ padding: '10px 12px', fontSize: '0.85rem', width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: '#64748b', display: 'flex', alignItems: 'center', height: '42px' }}>
                        No Sub-Groups
                    </div>
                )}

                <Select
                    options={days}
                    value={data.day}
                    onChange={val => setData({ ...data, day: val })}
                    placeholder="Select Day"
                />
                <Select
                    options={timeSlots}
                    value={data.time}
                    onChange={val => setData({ ...data, time: val })}
                    placeholder="Select Time"
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                <button
                    className="btn"
                    onClick={onClose}
                    style={{
                        padding: '10px 20px',
                        fontSize: '0.85rem',
                        background: 'rgba(255,255,255,0.05)',
                        color: '#94a3b8',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Cancel
                </button>
                <button
                    className="btn"
                    onClick={(e) => {
                        if (data.day && data.time) {
                            // Direct Add
                            if (!data.subject || !data.room || !data.faculty) {
                                alert("Please select Subject, Room, and Faculty.");
                                return;
                            }
                            onSave(null, data);
                            const btn = e.target;
                            const originalText = btn.innerText;
                            btn.innerText = "✓ Added";
                            btn.style.background = "#10b981";
                            btn.style.color = "white";
                            setTimeout(() => {
                                btn.innerText = originalText;
                                btn.style.background = "#f59e0b";
                                btn.style.color = "black";
                            }, 2000);
                        } else {
                            // Toggle Active Mode
                            const btn = e.target;
                            const originalText = btn.innerText;
                            btn.innerText = "Active!";
                            btn.style.background = "#10b981";
                            btn.style.color = "white";
                            setTimeout(() => {
                                btn.innerText = originalText;
                                btn.style.background = "#f59e0b";
                                btn.style.color = "black";
                            }, 2000);
                        }
                    }}
                    style={{
                        padding: '10px 24px',
                        fontSize: '0.85rem',
                        background: '#f59e0b',
                        color: 'black',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
                    }}
                >
                    {data.day && data.time ? "Add Class" : "Save Settings"}
                </button>
            </div>
        </div>
    );
};

export default QuickAssignPanel;
