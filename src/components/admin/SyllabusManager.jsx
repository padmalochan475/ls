import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Plus, Trash2, Edit2, Save, X, GripVertical, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const DEFAULT_DATA = [
    {
        id: 'CSE',
        departmentName: 'CSE',
        order: 1,
        sections: [
            { title: "B.Tech First Year", items: [{ name: "1st Year Syllabus (All Branches)", link: "https://tat.ac.in/wp-content/uploads/2024/05/Course-Structure-and-Detailed-Syllabus-for-1st-Year-B.Tech-Admission-Batch-2023-24.pdf" }] },
            { title: "B.Tech Second Year", items: [{ name: "3rd Semester Syllabus", link: "https://drive.google.com/file/d/1b7pTzhkUwzI4QDGJhWf27AYi78BAgBvK/view?usp=sharing" }, { name: "4th Semester Syllabus", link: "https://drive.google.com/file/d/1pdGs3qTX7fWgt00nAi2i89uFUVl8tMGJ/view?usp=sharing" }] },
            { title: "B.Tech Third Year", items: [{ name: "5th Semester Syllabus", link: "https://drive.google.com/file/d/1Y1zmChGWs2-F0Ed22BsaLPV5KUMb9zPQ/view?usp=sharing" }, { name: "6th Semester Syllabus", link: "https://drive.google.com/file/d/1n0qoTt45DeRzKpPswrOdlG1M5rAnhT20/view?usp=sharing" }] },
            { title: "B.Tech Fourth Year", items: [{ name: "4th Year Syllabus", link: "https://tat.ac.in/wp-content/uploads/2023/05/Syllabus-B.Tech-4TH-year-CSE-CST-2018-19-Admission-Batch.pdf" }] },
            { title: "M.Tech", items: [{ name: "M.Tech Syllabus", link: "https://drive.google.com/file/d/1ekG7MrlIt2Ldon2CBeaG30dZ1mDBvSiS/view?usp=sharing" }] }
        ]
    },
    {
        id: 'CSAIML',
        departmentName: 'CSAIML',
        order: 2,
        sections: [
            { title: "B.Tech First Year", items: [{ name: "1st Year Syllabus (All Branches)", link: "https://tat.ac.in/wp-content/uploads/2024/05/Course-Structure-and-Detailed-Syllabus-for-1st-Year-B.Tech-Admission-Batch-2023-24.pdf" }] },
            { title: "B.Tech Second Year", items: [{ name: "3rd Semester Syllabus", link: "https://drive.google.com/file/d/1oxAkDXsFK31cYUrgV6XxhFXng_nDOO7p/view?usp=sharing" }, { name: "4th Semester Syllabus", link: "https://drive.google.com/file/d/14600goH8pZT3cXNCfFuEZm6aKUT0YH_0/view?usp=sharing" }] },
            { title: "B.Tech Third Year", items: [{ name: "5th Semester Syllabus", link: "https://drive.google.com/file/d/1cGJNa6c53AVltdjSPurO_9iK5OTWEUYx/view?usp=sharing" }, { name: "6th Semester Syllabus", link: "https://drive.google.com/file/d/1CATgGuw4i81ETjmOUmgoI_FEq664sF8w/view?usp=sharing" }] },
            { title: "B.Tech Fourth Year", items: [{ name: "4th Year Syllabus", link: "https://tat.ac.in/wp-content/uploads/2023/05/Syllabus-B.Tech-4TH-year-CSE-CST-2018-19-Admission-Batch.pdf" }] },
            { title: "M.Tech", items: [{ name: "M.Tech Syllabus", link: "https://drive.google.com/file/d/135k3EwY3glj8WI9677K74xUzCH7augsM/view?usp=sharing" }] }
        ]
    },
    {
        id: 'CSDS',
        departmentName: 'CSDS',
        order: 3,
        sections: [
            { title: "B.Tech First Year", items: [{ name: "1st Year Syllabus (All Branches)", link: "https://tat.ac.in/wp-content/uploads/2024/05/Course-Structure-and-Detailed-Syllabus-for-1st-Year-B.Tech-Admission-Batch-2023-24.pdf" }] },
            { title: "B.Tech Second Year", items: [{ name: "3rd Semester Syllabus", link: "https://drive.google.com/file/d/1nwVhGARTim7sYuyDbsM41H1xe2Loy51z/view?usp=sharing" }, { name: "4th Semester Syllabus", link: "https://drive.google.com/file/d/1gRqVgMrYtwnHifdU01B4lDm9vSXmT-sE/view?usp=sharing" }] },
            { title: "B.Tech Third Year", items: [{ name: "5th Semester Syllabus", link: "https://drive.google.com/file/d/1cGZnQ-FaNvR7V6wkneaisssn2t6p5YUS/view?usp=sharing" }, { name: "6th Semester Syllabus", link: "https://drive.google.com/file/d/1Xp5gGByuVxJjMic9TS1PvVjr6OXZvEiS/view?usp=sharing" }] },
            { title: "M.Tech", items: [{ name: "M.Tech Syllabus", link: "https://drive.google.com/file/d/16Hw2Hfbkut2eOLO_mTbZOTX6FbaFgBDE/view?usp=sharing" }] }
        ]
    }
];

const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#f8fafc',
    fontSize: '0.9rem',
    outline: 'none'
};

const SyllabusManager = () => {
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [editingDeptId, setEditingDeptId] = useState(null);
    const [editForm, setEditForm] = useState(null);

    useEffect(() => {
        fetchDepartments();
    }, []);

    const fetchDepartments = async () => {
        try {
            const snap = await getDocs(collection(db, 'syllabi'));
            if (snap.empty) {
                setDepartments([]);
            } else {
                const depts = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order);
                setDepartments(depts);
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch syllabi");
        } finally {
            setLoading(false);
        }
    };

    const seedDatabase = async () => {
        setSeeding(true);
        try {
            const batch = writeBatch(db);
            DEFAULT_DATA.forEach(dept => {
                const { id, ...data } = dept;
                const docRef = doc(db, 'syllabi', id);
                batch.set(docRef, data);
            });
            await batch.commit();
            toast.success("Database seeded successfully!");
            fetchDepartments();
        } catch (error) {
            console.error(error);
            toast.error("Failed to seed database");
        } finally {
            setSeeding(false);
        }
    };

    const handleSaveDepartment = async () => {
        if (!editForm.departmentName.trim()) return toast.error("Department Name is required");
        
        try {
            const docId = editingDeptId === 'NEW' ? editForm.departmentName.toUpperCase().replace(/\s+/g, '_') : editingDeptId;
            const docRef = doc(db, 'syllabi', docId);
            await setDoc(docRef, {
                departmentName: editForm.departmentName,
                order: editForm.order,
                sections: editForm.sections
            });
            toast.success("Department saved!");
            setEditingDeptId(null);
            fetchDepartments();
        } catch (error) {
            console.error(error);
            toast.error("Failed to save department");
        }
    };

    const handleDeleteDepartment = async (id) => {
        if (!window.confirm("Are you sure you want to delete this department?")) return;
        try {
            await deleteDoc(doc(db, 'syllabi', id));
            toast.success("Department deleted");
            fetchDepartments();
        } catch (error) {
            console.error(error);
            toast.error("Failed to delete department");
        }
    };

    const openEditor = (dept) => {
        if (dept === 'NEW') {
            setEditingDeptId('NEW');
            setEditForm({ departmentName: '', order: departments.length + 1, sections: [] });
        } else {
            setEditingDeptId(dept.id);
            setEditForm(JSON.parse(JSON.stringify(dept))); // deep clone
        }
    };

    const addSection = () => {
        setEditForm({ ...editForm, sections: [...editForm.sections, { title: 'New Section', items: [] }] });
    };

    const updateSectionTitle = (sIdx, title) => {
        const newSections = [...editForm.sections];
        newSections[sIdx].title = title;
        setEditForm({ ...editForm, sections: newSections });
    };

    const deleteSection = (sIdx) => {
        const newSections = [...editForm.sections];
        newSections.splice(sIdx, 1);
        setEditForm({ ...editForm, sections: newSections });
    };

    const addItem = (sIdx) => {
        const newSections = [...editForm.sections];
        newSections[sIdx].items.push({ name: 'New Document', link: '' });
        setEditForm({ ...editForm, sections: newSections });
    };

    const updateItem = (sIdx, iIdx, field, value) => {
        const newSections = [...editForm.sections];
        newSections[sIdx].items[iIdx][field] = value;
        setEditForm({ ...editForm, sections: newSections });
    };

    const deleteItem = (sIdx, iIdx) => {
        const newSections = [...editForm.sections];
        newSections[sIdx].items.splice(iIdx, 1);
        setEditForm({ ...editForm, sections: newSections });
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="animate-spin" style={{ margin: '0 auto' }} /></div>;
    }

    if (editingDeptId) {
        return (
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{editingDeptId === 'NEW' ? 'Add Department' : 'Edit Department'}</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setEditingDeptId(null)} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px' }}>Cancel</button>
                        <button onClick={handleSaveDepartment} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Save size={16} /> Save
                        </button>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '1rem', marginBottom: '2rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>Department Name</label>
                        <input style={inputStyle} value={editForm.departmentName} onChange={e => setEditForm({...editForm, departmentName: e.target.value})} placeholder="e.g. CSE" />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>Order</label>
                        <input type="number" style={inputStyle} value={editForm.order} onChange={e => setEditForm({...editForm, order: Number(e.target.value)})} />
                    </div>
                </div>

                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0, color: '#e2e8f0' }}>Sections</h4>
                        <button onClick={addSection} style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)', padding: '4px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <Plus size={14} /> Add Section
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {editForm.sections.map((section, sIdx) => (
                            <div key={sIdx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem' }}>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                                    <input style={{...inputStyle, fontWeight: 600, background: 'rgba(15,23,42,0.8)'}} value={section.title} onChange={e => updateSectionTitle(sIdx, e.target.value)} placeholder="Section Title (e.g. B.Tech First Year)" />
                                    <button onClick={() => deleteSection(sIdx)} style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', borderRadius: '6px', width: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '1rem', borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                                    {section.items.map((item, iIdx) => (
                                        <div key={iIdx} style={{ display: 'flex', gap: '10px' }}>
                                            <div style={{ flex: 1, display: 'flex', gap: '10px' }}>
                                                <input style={{...inputStyle, flex: 1}} value={item.name} onChange={e => updateItem(sIdx, iIdx, 'name', e.target.value)} placeholder="Link Name" />
                                                <input style={{...inputStyle, flex: 2}} value={item.link} onChange={e => updateItem(sIdx, iIdx, 'link', e.target.value)} placeholder="URL (https://...)" />
                                            </div>
                                            <button onClick={() => deleteItem(sIdx, iIdx)} style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={() => addItem(sIdx)} style={{ alignSelf: 'flex-start', background: 'transparent', color: '#a855f7', border: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', marginTop: '4px' }}>
                                        <Plus size={14} /> Add Link
                                    </button>
                                </div>
                            </div>
                        ))}
                        {editForm.sections.length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '10px' }}>
                                No sections added yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#f8fafc' }}>Syllabus Links Management</h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '4px 0 0 0' }}>Manage departments, sections, and PDF links for the Syllabus viewer.</p>
                </div>
                <button onClick={() => openEditor('NEW')} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={16} /> Add Department
                </button>
            </div>

            {departments.length === 0 && !loading ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                    <AlertCircle size={48} color="#94a3b8" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                    <h3 style={{ fontSize: '1.1rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>No Syllabus Data Found</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
                        Your database is empty. You can seed it with the default CSE, CSAIML, and CSDS data.
                    </p>
                    <button onClick={seedDatabase} disabled={seeding} className="btn-primary" style={{ padding: '10px 20px', borderRadius: '8px' }}>
                        {seeding ? <><Loader2 size={16} className="animate-spin" /> Seeding Database...</> : 'Seed Default Data'}
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {departments.map((dept) => (
                        <div key={dept.id} className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>{dept.departmentName}</h3>
                                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                                    {dept.sections?.length || 0} sections • Order: {dept.order}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => openEditor(dept)} style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDeleteDepartment(dept.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SyllabusManager;
