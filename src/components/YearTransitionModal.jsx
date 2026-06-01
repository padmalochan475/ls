import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, writeBatch, updateDoc } from 'firebase/firestore';
import { ArrowRight, ShieldAlert, GraduationCap, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import QuantumLoader from './QuantumLoader';

const processGlobalStudent = (student, batch, oldAcademicYear) => {
    const studentRef = doc(db, 'students', student.id);
    
    // 1. Vault current state
    const historyRecord = {
        academicYear: oldAcademicYear || 'Unknown',
        semester: student.semester,
        section: student.section,
        rollNo: student.rollNo || student.rollno || null,
        timestamp: new Date().toISOString()
    };

    const newHistory = Array.isArray(student.academicHistory)
        ? [...student.academicHistory, historyRecord]
        : [historyRecord];

    // 2. Apply rules
    const currentSem = parseInt(student.semester) || 1;
    
    if (currentSem >= 8) {
        // Graduate them
        batch.update(studentRef, {
            status: 'alumni',
            academicHistory: newHistory,
            graduatedAt: new Date().toISOString()
        });
    } else {
        // Promote them +1
        batch.update(studentRef, {
            semester: (currentSem + 1).toString(),
            academicHistory: newHistory,
            updatedAt: new Date().toISOString()
        });
    }
};

const YearTransitionModal = ({ isOpen, onClose, fromYear, toYear, onComplete }) => {
    const [processing, setProcessing] = useState(false);

    if (!isOpen) return null;

    const handlePromote = async () => {
        setProcessing(true);
        try {
            // Fetch all active students
            const q = query(collection(db, 'students'), where('status', '==', 'active'));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                toast.success('No active students found to promote.');
            } else {
                const allStudents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                
                // Process in chunks of 400 (Firestore limit is 500)
                for (let i = 0; i < allStudents.length; i += 400) {
                    const chunk = allStudents.slice(i, i + 400);
                    const batch = writeBatch(db);

                    for (const student of chunk) {
                        processGlobalStudent(student, batch, fromYear);
                    }

                    await batch.commit();
                }
                toast.success(`Successfully promoted ${allStudents.length} students!`);
            }

            // Finally, update the active year
            await updateDoc(doc(db, 'settings', 'config'), { activeAcademicYear: toYear });
            toast.success(`Academic Year changed to ${toYear}`);
            onComplete();
        } catch (err) {
            console.error(err);
            toast.error('Global Promotion failed!');
        } finally {
            setProcessing(false);
        }
    };

    const handleSkip = async () => {
        setProcessing(true);
        try {
            // Just update the active year, don't touch students
            await updateDoc(doc(db, 'settings', 'config'), { activeAcademicYear: toYear });
            toast.success(`Academic Year changed to ${toYear}`);
            onComplete();
        } catch (err) {
            console.error(err);
            toast.error('Failed to change Academic Year');
        } finally {
            setProcessing(false);
        }
    };

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(2,6,23,0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000
        }}>
            <div className="glass-panel animate-scale-up" style={{
                background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '2.5rem', borderRadius: '24px', width: '500px', maxWidth: '90%',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', gap: '1.5rem'
            }}>
                
                <div style={{ textAlign: 'center' }}>
                    <div style={{ background: 'rgba(59,130,246,0.1)', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                        <GraduationCap size={32} color="#3b82f6" />
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'white', fontWeight: 800 }}>Academic Year Transition</h2>
                    <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                        You are changing the active system year.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '1rem 1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>From</div>
                        <div style={{ color: '#94a3b8', fontWeight: 600 }}>{fromYear || 'None'}</div>
                    </div>
                    <ArrowRight color="#3b82f6" />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>To</div>
                        <div style={{ color: '#10b981', fontWeight: 800 }}>{toYear}</div>
                    </div>
                </div>

                <div style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05))', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1.25rem', borderRadius: '16px', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <ShieldAlert color="#f59e0b" size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.85rem', color: '#fbbf24', lineHeight: 1.5 }}>
                        <strong>Global Promotion:</strong> You can automatically promote ALL active students by 1 semester (and graduate 8th semester students). Their current state will be vaulted into their academic history. 
                        <br/><br/>
                        <em>(Students who failed/repeat will need to be manually adjusted later).</em>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                    <button
                        onClick={handlePromote}
                        disabled={processing}
                        style={{
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            border: 'none', padding: '1rem', borderRadius: '12px', color: 'white',
                            fontWeight: 700, fontSize: '1rem', cursor: processing ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            opacity: processing ? 0.7 : 1
                        }}
                    >
                        {processing ? <QuantumLoader size={20} /> : <><Users size={20} /> Yes, Promote Everyone</>}
                    </button>
                    
                    <button
                        onClick={handleSkip}
                        disabled={processing}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '12px', color: '#94a3b8',
                            fontWeight: 600, fontSize: '0.95rem', cursor: processing ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: processing ? 0.7 : 1
                        }}
                    >
                        No, Just Change the Year
                    </button>

                    <button
                        onClick={onClose}
                        disabled={processing}
                        style={{
                            background: 'transparent', border: 'none', padding: '0.5rem', color: '#64748b',
                            fontSize: '0.85rem', cursor: processing ? 'not-allowed' : 'pointer', marginTop: '0.5rem',
                            textDecoration: 'underline'
                        }}
                    >
                        Cancel Transition
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default YearTransitionModal;
