import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../lib/firebase';
import {
  collection, query, where, orderBy, onSnapshot, getDoc, setDoc,
  updateDoc, deleteDoc, doc, writeBatch, getCountFromServer, getDocs
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useMasterData } from '../../contexts/MasterDataContext';
import { useDynamicListener } from '../../hooks/useDynamicListener';
import { 
  Users, Search, Filter, Download, Upload, Plus, Edit, Trash2, 
  MapPin, Phone, Mail, BookOpen, GraduationCap, Calendar, Save, X 
} from 'lucide-react';
import { formatSemester } from '../../utils/sortUtils';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const CHUNK_SIZE = 400;

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

const GRADIENT_PALETTES = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
];

function avatarGradient(name = '') {
  const idx = name.charCodeAt(0) % GRADIENT_PALETTES.length || 0;
  return GRADIENT_PALETTES[idx];
}

const STATUS_CONFIG = {
  active:  { label: 'Active',    color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.3)'  },
  alumni:  { label: 'Alumni',    color: '#a855f7', bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)' },
  tc:      { label: 'TC',        color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)'  },
};

// ─────────────────────────────────────────────
// Dynamic Roll & Group Auto-Rebalancing (Option B)
// ─────────────────────────────────────────────
async function rebalanceCohort(db, semester, section, branch) {
  if (!semester) return;
  const studentsRef = collection(db, 'students');
  let q;
  if (section) {
    q = query(studentsRef, where('semester', '==', semester), where('section', '==', section), where('status', '==', 'active'));
  } else if (branch) {
    q = query(studentsRef, where('semester', '==', semester), where('branch', '==', branch), where('status', '==', 'active'));
  } else {
    return;
  }
  
  const snap = await getDocs(q);
  if (snap.empty) return;
  
  const activeStudents = [];
  snap.forEach(doc => activeStudents.push({ _id: doc.id, ...doc.data() }));

  // Option A: Sort exactly by Registration Number to put returning students in original spots
  activeStudents.sort((a, b) => {
    const regA = String(a.regNo || '').toLowerCase();
    const regB = String(b.regNo || '').toLowerCase();
    return regA.localeCompare(regB, undefined, { numeric: true });
  });

  // Unique existing groups
  const uniqueGroups = Array.from(new Set(activeStudents.map(s => String(s.group || '1').trim().toUpperCase())))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (uniqueGroups.length === 0) uniqueGroups.push('1');

  // Distribute Mathematically
  const totalStudents = activeStudents.length;
  const numGroups = uniqueGroups.length;
  const capacities = [];
  let remainingStudents = totalStudents;
  let remainingGroups = numGroups;
  
  for (let i = 0; i < numGroups; i++) {
    const capacity = Math.ceil(remainingStudents / remainingGroups);
    capacities.push(capacity);
    remainingStudents -= capacity;
    remainingGroups--;
  }

  // Batch Update in chunks of 450 to avoid Firestore limits
  let updates = [];
  let currentIndex = 0;
  
  for (let gIndex = 0; gIndex < numGroups; gIndex++) {
    const groupName = uniqueGroups[gIndex];
    const capacity = capacities[gIndex];
    
    for (let i = 0; i < capacity; i++) {
      if (currentIndex >= activeStudents.length) break;
      const student = activeStudents[currentIndex];
      const newRollNo = String(currentIndex + 1);
      const curGroup = String(student.group || '').toUpperCase();
      
      if (String(student.rollNo) !== newRollNo || curGroup !== groupName) {
        updates.push({
          ref: doc(db, 'students', student._id),
          data: { rollNo: newRollNo, group: groupName, updatedAt: new Date().toISOString() }
        });
      }
      currentIndex++;
    }
  }
  
  if (updates.length > 0) {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(u => batch.update(u.ref, u.data));
      await batch.commit();
    }
    console.log(`Auto-rebalanced ${updates.length} students in cohort ${section || branch}.`);
  }
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

// Avatar circle
function AvatarCircle({ name, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarGradient(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff',
      flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {getInitials(name)}
    </div>
  );
}

// Premium Stat card
function StatCard({ icon, value, label, glow, gradient, loading }) {
  const IconComponent = icon;
  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: '16px',
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 10px 30px -10px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.1)',
      backdropFilter: 'blur(20px)',
      transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      cursor: 'pointer',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
        e.currentTarget.style.boxShadow = `0 20px 40px -10px ${glow}40, inset 0 1px 1px rgba(255,255,255,0.2)`;
        e.currentTarget.style.border = `1px solid ${glow}88`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = '0 10px 30px -10px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.1)';
        e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.05)';
      }}
    >
      {/* Subtle edge highlight */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: `radial-gradient(circle at top right, ${glow}15, transparent 60%)`,
        pointerEvents: 'none'
      }} />
      
      {/* Icon Box */}
      <div style={{
        width: 40, height: 40, borderRadius: '12px',
        background: `linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))`,
        border: `1px solid ${glow}44`,
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
        boxShadow: `0 8px 32px ${glow}33, inset 0 2px 4px rgba(255,255,255,0.2)`,
        position: 'relative', zIndex: 1
      }}>
        <IconComponent size={20} color={glow} strokeWidth={2.5} style={{ filter: `drop-shadow(0 2px 8px ${glow}aa)` }} />
      </div>
      
      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        <div style={{ 
          fontSize: '1.5rem', fontWeight: 900, 
          background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          lineHeight: 1, letterSpacing: '-0.02em', filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.5))`
        }}>
          {loading ? <span style={{ fontSize: 16, color: '#64748b', animation: 'pulse 1.5s infinite' }}>...</span> : value}
        </div>
      </div>
    </div>
  );
}

// Status badge
function StatusBadge({ status, onClick, isAdmin }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.active;
  return (
    <span
      onClick={isAdmin && onClick ? onClick : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 20,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        color: cfg.color, fontSize: 11.5, fontWeight: 600,
        cursor: isAdmin && onClick ? 'pointer' : 'default',
        userSelect: 'none', transition: 'filter 0.15s',
      }}
      onMouseEnter={e => isAdmin && onClick && (e.currentTarget.style.filter = 'brightness(1.2)')}
      onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
      title={isAdmin && onClick ? 'Click to change status' : undefined}
    >
      {cfg.label}
    </span>
  );
}

// Input component
function ControlInput({ icon: Icon, placeholder, value, onChange, style }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}>
      {Icon && <Icon size={15} color="#64748b" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          paddingLeft: Icon ? 32 : 12,
          paddingRight: 12, paddingTop: 8, paddingBottom: 8,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, color: '#f1f5f9', fontSize: 13,
          outline: 'none', transition: 'border-color 0.2s',
        }}
        onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.6)')}
        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
      />
    </div>
  );
}

function ControlSelect({ value, onChange, children, style }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '8px 32px 8px 12px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, color: '#f1f5f9', fontSize: 13,
        outline: 'none', cursor: 'pointer', appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
        ...style,
      }}
    >
      {children}
    </select>
  );
}

function Btn({ children, onClick, variant = 'primary', disabled, style, icon: Icon, size = 'md' }) {
  const variants = {
    primary:  { background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', border: 'none' },
    danger:   { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', border: 'none' },
    success:  { background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', border: 'none' },
    ghost:    { background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' },
    ghostRed: { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' },
  };
  const sizes = {
    sm: { padding: '5px 10px', fontSize: 12, borderRadius: 8 },
    md: { padding: '8px 16px', fontSize: 13, borderRadius: 10 },
    lg: { padding: '10px 22px', fontSize: 14, borderRadius: 12 },
  };
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.md;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...v, ...s,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'all 0.18s',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.transform = 'translateY(-1px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
    >
      {Icon && <Icon size={14} strokeWidth={2.5} />}
      {children}
    </button>
  );
}

// Loading skeleton row
function SkeletonRow() {
  return (
    <tr>
      {[...Array(10)].map((_, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 14, borderRadius: 6, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.4s ease infinite' }} />
        </td>
      ))}
    </tr>
  );
}

// Modal wrapper
function Modal({ onClose, children, width = 640 }) {
  useEffect(() => {
    const handler = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return createPortal(
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        width: '100%', maxWidth: width, maxHeight: '90vh',
        overflowY: 'auto',
        background: 'rgba(15,23,42,0.97)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{title}</h2>
      <button
        onClick={onClose}
        style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}
      >
        <X size={18} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Profile Modal
// ─────────────────────────────────────────────
function ProfileModal({ student, onClose }) {
  if (!student) return null;
  const history = student.academicHistory || [];
  return (
    <Modal onClose={onClose} width={560}>
      <ModalHeader title="Student Profile" onClose={onClose} />
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 }}>
          <AvatarCircle name={student.name} size={72} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{student.name}</div>
            <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>{student.regNo}</div>
            <div style={{ marginTop: 8 }}><StatusBadge status={student.status} /></div>
          </div>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24,
          background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {[
            ['Branch', student.branch],
            ['Semester', student.semester ? `Semester ${student.semester}` : '—'],
            ['Section/Batch', student.section || '—'],
            ['Roll No', student.rollNo || '—'],
            ['Lateral Entry', student.isLateral ? 'Yes' : 'No'],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{k}</div>
              <div style={{ fontSize: 14, color: '#cbd5e1', marginTop: 3, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Clock size={16} color="#3b82f6" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Academic History</span>
          </div>
          {history.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No academic history recorded.</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'linear-gradient(to bottom,#3b82f6,rgba(59,130,246,0.1))' }} />
              {history.map((h, i) => (
                <div key={i} style={{ position: 'relative', marginBottom: 16, paddingLeft: 20 }}>
                  <div style={{
                    position: 'absolute', left: -6, top: 3, width: 12, height: 12,
                    borderRadius: '50%', background: '#3b82f6',
                    boxShadow: '0 0 8px #3b82f633',
                  }} />
                  <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, marginBottom: 4 }}>{h.academicYear || h.year || `Entry ${i + 1}`}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {h.semester && <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatSemester(h.semester)}</span>}
                      {h.section && <span style={{ fontSize: 12, color: '#94a3b8' }}>Batch {h.section}</span>}
                      {h.rollNo && <span style={{ fontSize: 12, color: '#94a3b8' }}>Roll {h.rollNo}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Add / Edit Modal
// ─────────────────────────────────────────────
function AddEditModal({ student, groups, availableBatches, semesters, students, activeAcademicYear, onClose, onSaved }) {
  const isEdit = !!student;
  const [form, setForm] = useState({
    regNo: student?.regNo || '',
    name: student?.name || '',
    branch: student?.branch || '',
    semester: student?.semester || '',
    section: student?.section || '',
    group: String(student?.group || '1'),
    rollNo: student?.rollNo || student?.rollno || '',
    status: student?.status || 'active',
    isLateral: student?.isLateral || false,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  
  const [dbSections, setDbSections] = useState([]);
  const [dbGroups, setDbGroups] = useState(['1', '2']);
  const [loadingBatches, setLoadingBatches] = useState(false);

  useEffect(() => {
    if (!form.semester) {
      setDbSections([]);
      setDbGroups(['1', '2']);
      return;
    }

    const semStr = String(form.semester);
    const existingStudentsForSem = students?.filter(s => String(s.semester) === semStr) || [];

    if (existingStudentsForSem.length > 0) {
      const secSet = new Set();
      const grpSet = new Set(['1', '2']);
      existingStudentsForSem.forEach(s => {
        const sSection = (s.section || '').trim();
        const sGroup = String(s.group || '1').trim();
        const subStr = sSection ? sSection : (s.branch || '').trim();
        if (subStr) secSet.add(subStr.toUpperCase());
        if (sGroup) grpSet.add(sGroup);
      });
      setDbSections(Array.from(secSet).sort());
      setDbGroups(Array.from(grpSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      return;
    }

    let isActive = true;

    const fetchBatches = async () => {
      setLoadingBatches(true);
      try {
        const q = query(collection(db, 'students'), where('semester', '==', form.semester));
        const snap = await getDocs(q);
        if (!isActive) return;
        const secSet = new Set();
        const grpSet = new Set(['1', '2']);
        snap.forEach(doc => {
          const s = doc.data();
          const sSection = (s.section || '').trim();
          const sGroup = String(s.group || '1').trim();
          const subStr = sSection ? sSection : (s.branch || '').trim();
          if (subStr) secSet.add(subStr.toUpperCase());
          if (sGroup) grpSet.add(sGroup);
        });
        setDbSections(Array.from(secSet).sort());
        setDbGroups(Array.from(grpSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      } catch (err) {
        console.error("Error fetching sections/groups:", err);
      } finally {
        if (isActive) setLoadingBatches(false);
      }
    };

    fetchBatches();
    return () => { isActive = false; };
  }, [form.semester, students]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.regNo.trim()) e.regNo = true;
    if (!form.name.trim()) e.name = true;
    if (!form.branch.trim()) e.branch = true;
    if (!form.semester) e.semester = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) { toast.error('Fill all required fields'); return; }
    setSaving(true);
    try {
      const finalSection = form.section.trim();
      const finalGroup = String(form.group || '1').trim();

      const data = {
        regNo: form.regNo.trim(),
        name: form.name.trim(),
        branch: form.branch.trim(),
        semester: form.semester,
        section: finalSection,
        group: finalGroup,
        rollNo: form.rollNo.trim(),
        status: form.status,
        isLateral: form.isLateral,
        academicYear: activeAcademicYear,
        updatedAt: new Date().toISOString(),
      };
      const docId = form.regNo.trim().toLowerCase().replace(/\s+/g, '_');

      // Check for duplicate Roll No in the same Section (Cohort)
      if (form.rollNo.trim()) {
        const strRoll = form.rollNo.trim();
        const numRoll = !isNaN(strRoll) ? Number(strRoll) : null;
        
        const baseConstraints = [
          where('semester', '==', form.semester),
          where('section', '==', finalSection)
        ];

        // 1. Check if it exists as a string
        const rollQStr = query(collection(db, 'students'), ...baseConstraints, where('rollNo', '==', strRoll));
        const strSnap = await getDocs(rollQStr);
        let duplicateRoll = strSnap.docs.find(d => !isEdit || d.id !== student._id);

        // 2. Check if it exists as a number (legacy imports)
        if (!duplicateRoll && numRoll !== null) {
          const rollQNum = query(collection(db, 'students'), ...baseConstraints, where('rollNo', '==', numRoll));
          const numSnap = await getDocs(rollQNum);
          duplicateRoll = numSnap.docs.find(d => !isEdit || d.id !== student._id);
        }

        if (duplicateRoll) {
          const dupData = duplicateRoll.data();
          const dupBatch = `${dupData.section || ''}-${dupData.group || '1'}`;
          toast.error(`Roll No ${strRoll} is already taken in ${dupBatch} by ${dupData.name || 'another student'}`);
          setSaving(false);
          return;
        }
      }

      if (isEdit) {
        const ref = doc(db, 'students', student._id);
        await updateDoc(ref, data);
        toast.success('Student updated');
      } else {
        const existing = await getDoc(doc(db, 'students', docId));
        if (existing.exists()) { toast.error('Registration number already exists'); setSaving(false); return; }
        await setDoc(doc(db, 'students', docId), { ...data, createdAt: new Date().toISOString() });
        toast.success('Student added');
      }

      // Auto-rebalance cohort if status or section/semester/branch changed
      const oldCohortKey = isEdit ? `${student.semester}-${student.section}-${student.branch}` : '';
      const newCohortKey = `${form.semester}-${finalSection}-${form.branch}`;
      
      const needsOldRebalance = isEdit && student.status === 'active' && oldCohortKey !== newCohortKey;
      const needsNewRebalance = form.status === 'active' && (!isEdit || student.status !== 'active' || oldCohortKey !== newCohortKey);

      if (needsOldRebalance) {
        rebalanceCohort(db, student.semester, student.section, student.branch).catch(err => console.error('Rebalance failed:', err));
      }
      if (needsNewRebalance) {
        rebalanceCohort(db, form.semester, finalSection, form.branch).catch(err => console.error('Rebalance failed:', err));
      }
      
      // If simply marking as TC without changing cohort keys
      if (isEdit && student.status === 'active' && form.status !== 'active' && oldCohortKey === newCohortKey) {
        rebalanceCohort(db, form.semester, finalSection, form.branch).catch(err => console.error('Rebalance failed:', err));
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save student');
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = (err) => ({
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 10,
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${err ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
    color: '#f1f5f9', fontSize: 13, outline: 'none',
  });

  return (
    <Modal onClose={onClose} width={680}>
      <ModalHeader title={isEdit ? 'Edit Student' : 'Add Student'} onClose={onClose} />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Reg No */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>Reg No *</label>
            <input style={fieldStyle(errors.regNo)} value={form.regNo} onChange={e => set('regNo', e.target.value)} disabled={isEdit} placeholder="e.g. 22CS001" />
          </div>
          {/* Name */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>Full Name *</label>
            <input style={fieldStyle(errors.name)} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Student full name" />
          </div>
          {/* Branch */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>Branch *</label>
            <input style={fieldStyle(errors.branch)} value={form.branch} onChange={e => set('branch', e.target.value)} placeholder="e.g. CSE, ECE" />
          </div>
          {/* Semester */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>Semester *</label>
            <select style={{ ...fieldStyle(errors.semester), appearance: 'none' }} value={form.semester} onChange={e => set('semester', e.target.value)}>
              <option value="">Select Semester</option>
              {(semesters || []).map(s => (
                <option key={s.id || s.number || s} value={s.number || s.name || s.value || s.id || s}>{formatSemester(s.number || s.value || s)}</option>
              ))}
            </select>
          </div>
          {/* Section */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Section {loadingBatches && <span style={{fontSize: 10, color: '#3b82f6', marginLeft: 4}}>(loading...)</span>}
            </label>
            <input 
              style={fieldStyle(false)} 
              list="sectionList" 
              value={form.section} 
              onChange={e => set('section', e.target.value)} 
              placeholder={dbSections.length > 0 ? "Select or type Section" : "e.g. CSE-A"}
            />
            <datalist id="sectionList">
              {dbSections.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          {/* Group */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Group
            </label>
            <select style={{ ...fieldStyle(false), appearance: 'none' }} value={form.group} onChange={e => set('group', e.target.value)}>
              {dbGroups.map(g => (
                <option key={g} value={g}>Group {g}</option>
              ))}
              {!dbGroups.includes('1') && <option value="1">Group 1</option>}
            </select>
          </div>
          {/* Roll No */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>Roll No</label>
            <input style={fieldStyle(false)} value={form.rollNo} onChange={e => set('rollNo', e.target.value)} placeholder="e.g. 01" />
          </div>
          {/* Status */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>Status</label>
            <select style={{ ...fieldStyle(false), appearance: 'none' }} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="alumni">Alumni</option>
              <option value="tc">TC</option>
            </select>
          </div>
          {/* Lateral Entry */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
            <input
              type="checkbox" id="lateralCheck"
              checked={form.isLateral}
              onChange={e => set('isLateral', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#3b82f6', cursor: 'pointer' }}
            />
            <label htmlFor="lateralCheck" style={{ fontSize: 13, color: '#cbd5e1', cursor: 'pointer', fontWeight: 500 }}>
              Lateral Entry Student
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving} icon={CheckCircle}>
            {saving ? 'Saving…' : ''}
            {!saving && isEdit ? 'Update Student' : ''}
            {!saving && !isEdit ? 'Add Student' : ''}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Status Quick-Change Popover
// ─────────────────────────────────────────────
function StatusPopover({ student, onClose, onChanged }) {
  const [saving, setSaving] = useState(false);
  const change = async (newStatus) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'students', student._id), { status: newStatus, updatedAt: new Date().toISOString() });
      toast.success(`Status changed to ${STATUS_CONFIG[newStatus]?.label}`);
      onChanged();
      onClose();
    } catch {
      toast.error('Failed to update status');
    } finally { setSaving(false); }
  };
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: 12, minWidth: 180, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 4 }}>
          Change Status
        </div>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key}
            onClick={() => change(key)}
            disabled={saving || student.status === key}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 8, border: 'none',
              background: student.status === key ? cfg.bg : 'transparent',
              color: student.status === key ? cfg.color : '#94a3b8',
              fontSize: 13, fontWeight: 600, cursor: student.status === key ? 'default' : 'pointer',
              marginBottom: 2, transition: 'background 0.15s',
            }}
            onMouseEnter={e => student.status !== key && (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={e => student.status !== key && (e.currentTarget.style.background = 'transparent')}
          >
            {cfg.label} {student.status === key ? '✓' : ''}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────
// Import Modal
const IMPORT_FIELDS = ['regNo', 'name', 'branch', 'semester', 'section', 'group', 'rollNo'];
const FIELD_LABELS = { regNo: 'Reg No', name: 'Name', branch: 'Branch', semester: 'Semester', section: 'Section', group: 'Lab Group', rollNo: 'Roll No' };

function ImportModal({ semesters, activeAcademicYear, onClose, onImported }) {
  const [importMethod, setImportMethod] = useState('upload'); // upload | paste
  const [pasteData, setPasteData] = useState('');
  const [globalSemester, setGlobalSemester] = useState('');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [mapping, setMapping] = useState({});
  const [conflict, setConflict] = useState('skip');
  const [step, setStep] = useState('input'); // input | map | confirm
  const [progress, setProgress] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const downloadSampleExcel = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'Reg No': '2501289180', 'Name': 'AMAN PRADHAN', 'Roll No': '1', 'Branch': 'CSIT', 'Semester': '3', 'Section': 'CS-IT & CS(DS)', 'Lab Group': '1' },
      { 'Reg No': '2501289181', 'Name': 'ASHUTOSH GHOSH', 'Roll No': '2', 'Branch': 'CSIT', 'Semester': '3', 'Section': 'CS-IT & CS(DS)', 'Lab Group': '1' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sample_Format');
    XLSX.writeFile(wb, 'student_import_sample.xlsx');
  };

  const validRows = useMemo(() => {
    if (!mapping.regNo || !mapping.name) return rows;
    return rows.filter(r => {
      const reg = String(r[mapping.regNo] || '').trim();
      const name = String(r[mapping.name] || '').trim();
      if (!reg || !name) return false;
      
      // Filter out sub-header rows that leaked through
      const lowerReg = reg.toLowerCase();
      if (lowerReg === 'classes attended' || lowerReg === 'classes held' || lowerReg === 'percentile' || lowerReg === 'fine') return false;
      
      return true;
    });
  }, [rows, mapping]);

  const validCount = validRows.length;

  const handleDataParsed = (hdrs, data, fileName) => {
    setHeaders(hdrs); setRows(data);
    autoMap(hdrs);
    setStep('map');
  };

  const parseFile = useCallback(async (f) => {
    setFile(f);
    const ext = f.name.split('.').pop().toLowerCase();
    
    if (ext === 'csv') {
      Papa.parse(f, {
        header: true, skipEmptyLines: true,
        complete: (res) => handleDataParsed(res.meta.fields || [], res.data, f.name),
        error: () => toast.error('Failed to parse CSV'),
      });
    } else {
      // Fallback for HTML-based XLS exports
      const text = await f.text();
      if (text.toLowerCase().includes('<table')) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');
          const table = doc.querySelector('table');
          if (table) {
            const wb = XLSX.utils.table_to_book(table);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
            const hdrs = data.length ? Object.keys(data[0]) : [];
            handleDataParsed(hdrs, data, f.name);
            return;
          }
        } catch (e) {
          console.error("HTML Table parse error:", e);
        }
      }

      // Standard Excel fallback
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = new Uint8Array(e.target.result);
          const wb = XLSX.read(buffer, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          const hdrs = data.length ? Object.keys(data[0]) : [];
          handleDataParsed(hdrs, data, f.name);
        } catch (err) {
          console.error("Excel parse error:", err);
          toast.error("Failed to read Excel file.");
        }
      };
      reader.readAsArrayBuffer(f);
    }
  }, []);

  const handlePasteParse = () => {
    if (!pasteData.trim()) return toast.error('Please paste some data first');
    setFile({ name: 'Pasted Data' });
    
    // Preprocess: Copying from SIS/ERP websites often includes garbage text before the table.
    // Find the first line that looks like a student table header.
    const lines = pasteData.split(/\r?\n/);
    let headerIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        if ((lower.includes('regd') || lower.includes('reg no')) && lower.includes('name')) {
            headerIdx = i;
            break;
        }
    }
    
    let dataLines = lines.slice(headerIdx);
    
    // Check if the row immediately after the header is a sub-header row (common in ERPs)
    if (dataLines.length > 1) {
        const nextLineLower = dataLines[1].toLowerCase();
        if (nextLineLower.includes('classes attended') || nextLineLower.includes('percentile')) {
            // Remove the sub-header row so it doesn't get parsed as a student
            dataLines.splice(1, 1);
        }
    }
    
    const cleanedData = dataLines.join('\n');

    Papa.parse(cleanedData, {
      delimiter: '\t', // Usually pasted data from excel is tab-separated
      header: true, skipEmptyLines: true,
      complete: (res) => {
        if (!res.meta.fields || res.meta.fields.length < 2) {
           // Fallback to comma if tab fails
           Papa.parse(cleanedData, {
             header: true, skipEmptyLines: true,
             complete: (res2) => handleDataParsed(res2.meta.fields || [], res2.data, 'Pasted Data')
           });
           return;
        }
        handleDataParsed(res.meta.fields || [], res.data, 'Pasted Data');
      },
      error: () => toast.error('Failed to parse pasted data'),
    });
  };

  const autoMap = (hdrs) => {
    const m = {};
    IMPORT_FIELDS.forEach(field => {
      // Create flexible matchers (e.g. "Regd.No", "Lab Group")
      let match = hdrs.find(h => h.toLowerCase().replace(/[\s_\-\.]/g, '') === field.toLowerCase());
      if (!match && field === 'group') match = hdrs.find(h => h.toLowerCase().includes('lab group'));
      if (!match && field === 'regNo') match = hdrs.find(h => h.toLowerCase().includes('regd'));
      if (match) m[field] = match;
    });
    setMapping(m);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  };

  const handleImport = async () => {
    if (!mapping.regNo || !mapping.name) { toast.error('Map at least Reg No and Name'); return; }
    if (!mapping.semester && !globalSemester) { 
      toast.error('Please map the Semester column or select a Target Semester'); 
      return; 
    }
    setImporting(true);
    try {
      const mapped = validRows.map(r => ({
        regNo: String(r[mapping.regNo] || '').trim(),
        name: String(r[mapping.name] || '').trim(),
        branch: mapping.branch ? String(r[mapping.branch] || '').trim() : '',
        semester: mapping.semester ? String(r[mapping.semester] || '').trim() : globalSemester,
        section: mapping.section ? String(r[mapping.section] || '').trim() : '',
        group: mapping.group ? String(r[mapping.group] || '1').trim() : '1',
        rollNo: mapping.rollNo ? String(r[mapping.rollNo] || '').trim() : '',
        academicYear: activeAcademicYear,
        status: 'active',
        updatedAt: new Date().toISOString(),
      })).filter(r => r.regNo && r.name);

      const chunks = chunkArray(mapped, CHUNK_SIZE);
      let done = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        if (conflict === 'overwrite') {
          for (const student of chunk) {
            const docId = student.regNo.toLowerCase().replace(/\s+/g, '_');
            const ref = doc(db, 'students', docId);
            batch.set(ref, student, { merge: true });
          }
        } else {
          // Fetch concurrently to avoid UI freeze on large imports
          await Promise.all(chunk.map(async (student) => {
            const docId = student.regNo.toLowerCase().replace(/\s+/g, '_');
            const ref = doc(db, 'students', docId);
            const existing = await getDoc(ref);
            if (!existing.exists()) {
              batch.set(ref, { ...student, isLateral: false, createdAt: new Date().toISOString() });
            }
          }));
        }

        await batch.commit();
        done += chunk.length;
        setProgress(Math.round((done / mapped.length) * 100));
      }
      toast.success(`Imported ${mapped.length} students`);
      onImported();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Import failed');
    } finally { setImporting(false); setProgress(null); }
  };

  return (
    <Modal onClose={onClose} width={700}>
      <ModalHeader title="Import Students" onClose={onClose} />
      <div style={{ padding: 24 }}>
        {step === 'input' && (
          <>
            {/* Tabs for Upload vs Paste */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  onClick={() => setImportMethod('upload')}
                  style={{ padding: '10px 20px', background: 'none', border: 'none', color: importMethod === 'upload' ? '#3b82f6' : '#94a3b8', borderBottom: importMethod === 'upload' ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}>
                  Upload File
                </button>
                <button 
                  onClick={() => setImportMethod('paste')}
                  style={{ padding: '10px 20px', background: 'none', border: 'none', color: importMethod === 'paste' ? '#3b82f6' : '#94a3b8', borderBottom: importMethod === 'paste' ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: 600, cursor: 'pointer' }}>
                  Copy & Paste
                </button>
              </div>
              <button 
                onClick={downloadSampleExcel}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>
                <Download size={14} /> Sample Excel
              </button>
            </div>

            {importMethod === 'upload' && (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? '#3b82f6' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 16, padding: '48px 24px', textAlign: 'center',
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: dragging ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                  boxShadow: dragging ? '0 0 30px rgba(59,130,246,0.2)' : 'none',
                }}
              >
                <Upload size={40} color={dragging ? '#3b82f6' : '#475569'} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {dragging ? 'Drop to upload' : 'Drag & drop your file here'}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>CSV or Excel (.xlsx, .xls, HTML tables) supported</div>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.html" hidden onChange={e => e.target.files[0] && parseFile(e.target.files[0])} />
              </div>
            )}

            {importMethod === 'paste' && (
              <div>
                <textarea 
                  value={pasteData}
                  onChange={e => setPasteData(e.target.value)}
                  placeholder="Paste your Excel or CSV data here (must include headers)..."
                  style={{ width: '100%', height: 200, padding: 16, borderRadius: 12, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <Btn variant="primary" onClick={handlePasteParse}>Parse Data</Btn>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'map' && (
          <>
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10 }}>
              <span style={{ fontSize: 13, color: '#93c5fd' }}>
                <strong>{rows.length}</strong> raw rows detected from <strong>{file?.name || 'Pasted Data'}</strong>. 
                {validCount > 0 && <span style={{ marginLeft: 6, color: '#10b981', fontWeight: 600 }}>✓ {validCount} valid students found based on mapping.</span>}
              </span>
            </div>

            <div style={{ marginBottom: 20, padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}>
              <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                Target Semester (Fallback)
              </label>
              <select
                value={globalSemester}
                onChange={e => setGlobalSemester(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(15,23,42,0.6)', border: '1px solid #3b82f6', color: '#f8fafc', fontSize: 14, outline: 'none' }}
              >
                <option value="">-- No Default Semester --</option>
                {semesters.map(s => (
                  <option key={s.id || s.number || s} value={s.number || s.name || s.value || s.id || s}>
                    {formatSemester(s.number || s.value || s)}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                If your file doesn't have a semester column, all students will be assigned to this semester.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {IMPORT_FIELDS.map(field => (
                <div key={field}>
                  <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                    {FIELD_LABELS[field]}{field === 'regNo' || field === 'name' ? ' *' : ''}
                  </label>
                  <select
                    value={mapping[field] || ''}
                    onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: 13 }}
                  >
                    <option value="">-- Skip --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
                Preview (All Valid Rows)
              </div>
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '350px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0f172a' }}>
                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <th style={{ padding: '8px 12px', color: '#64748b', fontWeight: 600, textAlign: 'left', width: '40px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>S.No</th>
                      {IMPORT_FIELDS.filter(f => mapping[f]).map(f => (
                        <th key={f} style={{ padding: '8px 12px', color: '#64748b', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{FIELD_LABELS[f]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((row, i) => (
                      <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '7px 12px', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                        {IMPORT_FIELDS.filter(f => mapping[f]).map(f => (
                          <td key={f} style={{ padding: '7px 12px', color: '#cbd5e1' }}>{String(row[mapping[f]] || '').slice(0, 40)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Conflict */}
            <div style={{ marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Duplicate handling:</span>
              {['skip', 'overwrite'].map(opt => (
                <button key={opt}
                  onClick={() => setConflict(opt)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${conflict === opt ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                    background: conflict === opt ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: conflict === opt ? '#60a5fa' : '#64748b',
                  }}
                >
                  {opt === 'skip' ? 'Skip Duplicates' : 'Overwrite Duplicates'}
                </button>
              ))}
            </div>

            {progress !== null && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Importing… {progress}%</div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setStep('input')}>← Back</Btn>
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
                <Btn variant="primary" onClick={handleImport} disabled={importing} icon={Upload}>
                  {importing ? 'Importing…' : `Import ${validCount > 0 ? validCount : rows.length} Students`}
                </Btn>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function StudentDirectory() {
  const { userProfile, activeAcademicYear } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const { groups = [], semesters = [] } = useMasterData();

  // Stats
  const [stats, setStats] = useState({ active: 0, groups: 0, alumni: 0, tc: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Data
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const unsubRef = useRef(null);

  // Selection
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('active');

  // Modals
  const [profileStudent, setProfileStudent] = useState(null);
  const [editStudent, setEditStudent] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [statusPopover, setStatusPopover] = useState(null);

  // ── Derive Batches dynamically from loaded students (Exact match with Attendance) ──
  const availableBatches = useMemo(() => {
    if (!students || students.length === 0) return [];
    const groupSet = new Set();
    students.forEach(s => {
        const sSection = (s.section || '').trim();
        const sGroup = String(s.group || '1').trim();
        const subStr = sSection ? sSection : (s.branch || '').trim();
        const badge = `${subStr}-${sGroup}`.toUpperCase();
        groupSet.add(badge);
    });
    return Array.from(groupSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  // ── Fetch stats on mount ──
  useEffect(() => {
    let isActive = true;
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const col = collection(db, 'students');
        const [activeSnap, alumniSnap, tcSnap] = await Promise.all([
          getCountFromServer(query(col, where('status', '==', 'active'))),
          getCountFromServer(query(col, where('status', '==', 'alumni'))),
          getCountFromServer(query(col, where('status', '==', 'tc'))),
        ]);
        if (!isActive) return;
        setStats({
          active: activeSnap.data().count,
          groups: groups.length,
          alumni: alumniSnap.data().count,
          tc: tcSnap.data().count,
        });
      } catch (err) {
        console.error('Stats fetch error:', err);
      } finally {
        if (isActive) setStatsLoading(false);
      }
    };
    fetchStats();
    return () => { isActive = false; };
  }, [groups.length]);

  // ── Real-time query ──
  useDynamicListener((isActiveRef) => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (!filterBatch && !filterSemester) {
      setStudents([]);
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    setSelected(new Set());
    const col = collection(db, 'students');
    let constraints = [];
    if (filterSemester) constraints.push(where('semester', '==', filterSemester));
    const q = query(col, ...constraints);
    return onSnapshot(q, (snap) => {
      if (!isActiveRef.current) return;
      const data = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStudents(data);
      setLoading(false);
    }, (err) => {
      if (!isActiveRef.current) return;
      console.error('Student query error:', err);
      toast.error('Failed to load students');
      setLoading(false);
    });
  }, [filterBatch, filterSemester]);

  // ── Filtered list ──
  const filteredStudents = useMemo(() => {
    let list = students || [];
    if (filterStatus !== 'all') list = list.filter(s => s.status === filterStatus);
    
    if (filterBatch) {
      const fb = filterBatch.toUpperCase();
      list = list.filter(s => {
        const sSection = (s.section || '').trim().toUpperCase();
        const sGroup = String(s.group || '1').trim().toUpperCase();
        const subStr = sSection ? sSection : (s.branch || '').trim().toUpperCase();
        const badge = `${subStr}-${sGroup}`;
        return sSection === fb || badge === fb;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.regNo || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [students, filterStatus, search]);

  // ── Selection helpers ──
  const toggleSelect = (id) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleAll = () => {
    if (selected.size === filteredStudents.length) setSelected(new Set());
    else setSelected(new Set(filteredStudents.map(s => s._id)));
  };

  // ── Delete ──
  const handleDelete = async (student) => {
    if (!window.confirm(`Delete ${student.name}? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'students', student._id));
      toast.success('Student deleted');
    } catch { toast.error('Delete failed'); }
  };

  // ── Bulk Delete ──
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} students? This cannot be undone.`)) return;
    try {
      const ids = [...selected];
      const chunks = chunkArray(ids, CHUNK_SIZE);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(id => batch.delete(doc(db, 'students', id)));
        await batch.commit();
      }
      toast.success(`${selected.size} students deleted`);
      setSelected(new Set());
    } catch { toast.error('Bulk delete failed'); }
  };

  // ── Delete Batch ──
  const handleDeleteBatch = async () => {
    if (!filterBatch) return;
    
    // Get ALL students in this batch regardless of search or status
    const batchStudents = (students || []).filter(s => {
      const fb = filterBatch.toUpperCase();
      const sSection = (s.section || '').trim().toUpperCase();
      const sGroup = String(s.group || '1').trim().toUpperCase();
      const subStr = sSection ? sSection : (s.branch || '').trim().toUpperCase();
      const badge = `${subStr}-${sGroup}`;
      return sSection === fb || badge === fb;
    });

    if (batchStudents.length === 0) {
      toast.error('No students found in this batch');
      return;
    }

    if (!window.confirm(`Are you sure you want to completely delete the ENTIRE "${filterBatch}" lab batch?\n\nThis will permanently delete ${batchStudents.length} students and cannot be undone.`)) return;
    
    if (window.prompt(`Type "DELETE" to confirm the deletion of ${filterBatch}`) !== 'DELETE') {
      toast.error('Deletion cancelled.');
      return;
    }

    try {
      const ids = batchStudents.map(s => s._id);
      const chunks = chunkArray(ids, CHUNK_SIZE);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(id => batch.delete(doc(db, 'students', id)));
        await batch.commit();
      }
      toast.success(`${ids.length} students deleted from ${filterBatch}`);
      setFilterBatch('');
      setSelected(new Set());
    } catch { toast.error('Failed to delete batch'); }
  };

  // ── Bulk Status Change ──
  const handleBulkStatus = async (newStatus) => {
    try {
      const ids = [...selected];
      
      const affectedCohorts = new Map();
      ids.forEach(id => {
        const student = students.find(s => s._id === id);
        if (student && student.status !== newStatus) {
            const key = `${student.semester}|${student.section}|${student.branch}`;
            affectedCohorts.set(key, { semester: student.semester, section: student.section, branch: student.branch });
        }
      });
      
      const chunks = chunkArray(ids, CHUNK_SIZE);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(id => batch.update(doc(db, 'students', id), { status: newStatus, updatedAt: new Date().toISOString() }));
        await batch.commit();
      }
      toast.success(`${selected.size} students set to ${STATUS_CONFIG[newStatus]?.label}`);
      setSelected(new Set());
      
      for (const cohort of affectedCohorts.values()) {
         rebalanceCohort(db, cohort.semester, cohort.section, cohort.branch).catch(err => console.error('Bulk rebalance failed:', err));
      }
    } catch { toast.error('Bulk status update failed'); }
  };

  // ── Export ──
  const handleExport = () => {
    if (filteredStudents.length === 0) { toast.error('No students to export'); return; }
    const data = filteredStudents.map(s => ({
      'Reg No': s.regNo, Name: s.name, Branch: s.branch,
      Semester: s.semester, 'Section/Batch': s.section,
      'Roll No': s.rollNo, Status: s.status, 'Lateral Entry': s.isLateral ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, `students_export_${Date.now()}.xlsx`);
    toast.success('Exported successfully');
  };

  const noFilter = !filterBatch && !filterSemester;

  return (
    <div style={{ minHeight: '100vh', color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif", padding: '16px 24px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input::placeholder { color: #475569; }
        select option { background: #0f172a; color: #f1f5f9; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, marginLeft: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(59,130,246,0.4)' }}>
            <Users size={20} color="#fff" />
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, background: 'linear-gradient(135deg,#f1f5f9,#94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Student Directory
          </h1>
        </div>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Manage, search and track all students in real-time</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 32 }}>
        <StatCard icon={UserCheck} value={stats.active} label="Active Students" glow="#3b82f6" gradient="linear-gradient(135deg,#3b82f6,#1d4ed8)" loading={statsLoading} />
        <StatCard icon={BookOpen} value={stats.groups} label="Total Lab Batches" glow="#8b5cf6" gradient="linear-gradient(135deg,#8b5cf6,#6d28d9)" loading={statsLoading} />
        <StatCard icon={GraduationCap} value={stats.alumni} label="Alumni" glow="#10b981" gradient="linear-gradient(135deg,#10b981,#047857)" loading={statsLoading} />
        <StatCard icon={UserX} value={stats.tc} label="Transferred (TC)" glow="#ef4444" gradient="linear-gradient(135deg,#ef4444,#b91c1c)" loading={statsLoading} />
      </div>

      {/* Control Bar (Attendance Style) */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '1.5rem',
        marginBottom: 24, padding: '2rem',
        background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '20px', backdropFilter: 'blur(16px)',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
      }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              {/* Semester */}
              <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      <span style={{ color: '#a855f7', fontSize: '1.2rem' }}>•</span> SEMESTER
                  </label>
                  <select style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none' }} value={filterSemester} onChange={e => { setFilterSemester(e.target.value); setFilterBatch(''); }}>
                      <option value="" style={{ background: '#0f172a' }}>— All Semesters —</option>
                      {semesters.map(s => <option key={s.id || s.number || s} value={s.number || s.name || s.value || s.id || s} style={{ background: '#0f172a' }}>{formatSemester(s.number || s.value || s)}</option>)}
                  </select>
              </div>

              {/* Lab Batch */}
              <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span> LAB BATCH / SUB-GROUP
                  </label>
                  <select 
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: filterSemester && !filterBatch ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none' }} 
                      value={filterBatch} 
                      onChange={e => setFilterBatch(e.target.value)}
                      disabled={!filterSemester}
                  >
                      <option value="" style={{ background: '#0f172a' }}>{!filterSemester ? '— Select Semester First —' : '— All Lab Batches —'}</option>
                      {availableBatches.map(b => <option key={b} value={b} style={{ background: '#0f172a' }}>{b}</option>)}
                  </select>
              </div>

              {/* Status */}
              <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      <span style={{ color: '#ef4444', fontSize: '1.2rem' }}>•</span> STATUS
                  </label>
                  <select style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                      <option value="all" style={{ background: '#0f172a' }}>All Status</option>
                      <option value="active" style={{ background: '#0f172a' }}>Active</option>
                      <option value="alumni" style={{ background: '#0f172a' }}>Alumni</option>
                      <option value="tc" style={{ background: '#0f172a' }}>TC</option>
                  </select>
              </div>

              {/* Search */}
              <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      <span style={{ color: '#3b82f6', fontSize: '1.2rem' }}>•</span> SEARCH
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={18} color="#64748b" style={{ position: 'absolute', left: 14, pointerEvents: 'none' }} />
                      <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search name or reg no…"
                          style={{
                              width: '100%', boxSizing: 'border-box', padding: '11px 14px 11px 40px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none'
                          }}
                      />
                  </div>
              </div>
          </div>
          
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
            {isAdmin && filterBatch && (
              <Btn variant="danger" icon={Trash2} onClick={handleDeleteBatch} style={{ borderRadius: '12px', padding: '10px 18px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>Delete Batch</Btn>
            )}
            {isAdmin && <Btn variant="primary" icon={Plus} onClick={() => setShowAddModal(true)} style={{ borderRadius: '12px', padding: '10px 18px', background: 'linear-gradient(135deg, #3b82f6, #0ea5e9)' }}>Add Student</Btn>}
            {isAdmin && <Btn variant="ghost" icon={Upload} onClick={() => setShowImport(true)} style={{ borderRadius: '12px', padding: '10px 18px' }}>Import</Btn>}
            <Btn variant="ghost" icon={Download} onClick={handleExport} style={{ borderRadius: '12px', padding: '10px 18px' }}>Export</Btn>
          </div>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          padding: '14px 20px', marginBottom: 20,
          background: 'linear-gradient(90deg, rgba(59,130,246,0.1), rgba(6,182,212,0.05))',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: '16px', boxShadow: '0 8px 24px rgba(59,130,246,0.15)',
        }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#60a5fa' }}>
            {selected.size} student{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <ControlSelect value={bulkStatus} onChange={setBulkStatus} style={{ minWidth: 160, background: 'rgba(0,0,0,0.3)' }}>
                  <option value="active">Set to Active</option>
                  <option value="alumni">Set to Alumni</option>
                  <option value="tc">Set to TC</option>
                </ControlSelect>
                <Btn variant="success" size="sm" icon={CheckCircle} onClick={() => handleBulkStatus(bulkStatus)}>Apply</Btn>
              </div>
            )}
            {isAdmin && (
              <Btn variant="danger" size="sm" icon={Trash2} onClick={handleBulkDelete}>Delete</Btn>
            )}
            <Btn variant="ghost" size="sm" icon={X} onClick={() => setSelected(new Set())}>Deselect All</Btn>
          </div>
        </div>
      )}

      {/* Table Area */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '24px', overflow: 'hidden', backdropFilter: 'blur(16px)',
        boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)',
      }}>
        {/* Empty: no filter */}
        {noFilter && !loading && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <Filter size={48} color="#334155" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Select a Lab Batch or Semester</div>
            <div style={{ fontSize: 14, color: '#334155' }}>Choose a lab batch or semester filter above to load students and avoid unnecessary reads.</div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{[...Array(8)].map((_, i) => <SkeletonRow key={i} />)}</tbody>
          </table>
        )}

        {/* Empty results */}
        {!noFilter && !loading && filteredStudents.length === 0 && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <AlertCircle size={48} color="#334155" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: '#475569', marginBottom: 8 }}>No Students Found</div>
            <div style={{ fontSize: 14, color: '#334155' }}>
              {search ? `No results for "${search}"` : 'No students match the current filters.'}
            </div>
          </div>
        )}

        {/* Table */}
        {!noFilter && !loading && filteredStudents.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {isAdmin && (
                    <th style={{ padding: '16px', textAlign: 'center', width: 40 }}>
                      <input type="checkbox"
                        checked={selected.size === filteredStudents.length && filteredStudents.length > 0}
                        onChange={toggleAll}
                        style={{ accentColor: '#3b82f6', width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </th>
                  )}
                  {['#', 'Student', 'Reg No', 'Branch', 'Sem', 'Lab Batch', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, idx) => (
                  <tr key={student._id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'all 0.2s',
                      background: selected.has(student._id) ? 'rgba(59,130,246,0.08)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!selected.has(student._id)) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                    onMouseLeave={e => { if (!selected.has(student._id)) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'none'; } }}
                  >
                    {/* Checkbox */}
                    {isAdmin && (
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={selected.has(student._id)}
                          onChange={() => toggleSelect(student._id)}
                          style={{ accentColor: '#3b82f6', width: 15, height: 15, cursor: 'pointer' }}
                        />
                      </td>
                    )}
                    {/* # */}
                    <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 600 }}>{idx + 1}</td>
                    {/* Student */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AvatarCircle name={student.name} size={34} />
                        <div>
                          <div style={{ fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {student.name}
                            {student.isLateral && (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308', fontWeight: 700 }}>L</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Reg No */}
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#94a3b8', fontSize: 12 }}>{student.regNo}</td>
                    {/* Branch */}
                    <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{student.branch || '—'}</td>
                    {/* Semester */}
                    <td style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'center' }}>{student.semester || '—'}</td>
                    {/* Section */}
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                      {(() => {
                        const sSection = (student.section || '').trim();
                        const sGroup = String(student.group || '1').trim();
                        const subStr = sSection ? sSection : (student.branch || '').trim();
                        return subStr ? `${subStr}-${sGroup}`.toUpperCase() : '—';
                      })()}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge
                        status={student.status || 'active'}
                        isAdmin={isAdmin}
                        onClick={() => setStatusPopover(student)}
                      />
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setProfileStudent(student)}
                          title="View History"
                          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 7, padding: '5px 7px', cursor: 'pointer', color: '#60a5fa', display: 'flex', transition: 'all 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.25)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.12)')}
                        >
                          <Eye size={14} />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditStudent(student)}
                              title="Edit"
                              style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 7, padding: '5px 7px', cursor: 'pointer', color: '#eab308', display: 'flex', transition: 'all 0.15s' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(234,179,8,0.25)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(234,179,8,0.12)')}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(student)}
                              title="Delete"
                              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '5px 7px', cursor: 'pointer', color: '#ef4444', display: 'flex', transition: 'all 0.15s' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.25)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer */}
        {!noFilter && !loading && filteredStudents.length > 0 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <span style={{ fontSize: 12.5, color: '#475569' }}>
              Showing <strong style={{ color: '#94a3b8' }}>{filteredStudents.length}</strong> of <strong style={{ color: '#94a3b8' }}>{students.length}</strong> students
            </span>
            <span style={{ fontSize: 12, color: '#334155' }}>
              {filterBatch && `Batch: ${filterBatch}`}{filterBatch && filterSemester && ' · '}{filterSemester && `Sem: ${filterSemester}`}
            </span>
          </div>
        )}
      </div>

      {/* Modals */}
      {profileStudent && <ProfileModal student={profileStudent} onClose={() => setProfileStudent(null)} />}

      {statusPopover && (
        <StatusPopover
          student={statusPopover}
          onClose={() => setStatusPopover(null)}
          onChanged={() => setStatusPopover(null)}
        />
      )}

      {(showAddModal || editStudent) && (
        <AddEditModal
          student={editStudent}
          groups={groups}
          availableBatches={availableBatches}
          semesters={semesters}
          students={students}
          activeAcademicYear={activeAcademicYear}
          onClose={() => { setShowAddModal(false); setEditStudent(null); }}
          onSaved={() => { setShowAddModal(false); setEditStudent(null); }}
        />
      )}

      {showImport && (
        <ImportModal
          semesters={semesters}
          activeAcademicYear={activeAcademicYear}
          onClose={() => setShowImport(false)}
          onImported={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
