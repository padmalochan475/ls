import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, query, where, orderBy, onSnapshot, getDoc, setDoc,
  updateDoc, deleteDoc, doc, writeBatch, getCountFromServer
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useMasterData } from '../../contexts/MasterDataContext';
import {
  Plus, Search, Edit2, Trash2, Users, Upload, Download, Eye,
  CheckCircle, X, Clock, BookOpen, Filter, UserCheck, UserX,
  GraduationCap, AlertCircle
} from 'lucide-react';
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
      flex: '1 1 200px',
      background: 'rgba(15, 23, 42, 0.4)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: '24px',
      padding: '24px',
      display: 'flex', alignItems: 'center', gap: 20,
      position: 'relative', overflow: 'hidden',
      boxShadow: `0 10px 30px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
      backdropFilter: 'blur(20px)',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'default',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = `0 20px 40px -10px ${glow}44, inset 0 1px 0 rgba(255,255,255,0.1)`;
        e.currentTarget.style.border = `1px solid ${glow}44`;
        e.currentTarget.style.background = 'rgba(15, 23, 42, 0.6)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = `0 10px 30px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`;
        e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        e.currentTarget.style.background = 'rgba(15, 23, 42, 0.4)';
      }}
    >
      {/* Animated bg glow blob */}
      <div style={{
        position: 'absolute', top: -30, right: -30, width: 140, height: 140,
        borderRadius: '50%', background: glow, opacity: 0.15, filter: 'blur(40px)',
        pointerEvents: 'none', animation: 'pulse 3s ease-in-out infinite alternate'
      }} />
      <div style={{
        width: 54, height: 54, borderRadius: '18px',
        background: gradient, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
        boxShadow: `0 8px 24px ${glow}66, inset 0 2px 4px rgba(255,255,255,0.3)`,
      }}>
        <IconComponent size={26} color="#fff" strokeWidth={2.2} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
          {loading ? <span style={{ fontSize: 16, color: '#64748b', animation: 'pulse 1.5s infinite' }}>Loading...</span> : value}
        </div>
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
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
  return (
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
    </div>
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
                      {h.semester && <span style={{ fontSize: 12, color: '#94a3b8' }}>Sem {h.semester}</span>}
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
function AddEditModal({ student, groups, semesters, onClose, onSaved }) {
  const isEdit = !!student;
  const [form, setForm] = useState({
    regNo: student?.regNo || '',
    name: student?.name || '',
    branch: student?.branch || '',
    semester: student?.semester || '',
    section: student?.section || '',
    rollNo: student?.rollNo || '',
    status: student?.status || 'active',
    isLateral: student?.isLateral || false,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

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
      const data = {
        regNo: form.regNo.trim(),
        name: form.name.trim(),
        branch: form.branch.trim(),
        semester: form.semester,
        section: form.section,
        rollNo: form.rollNo,
        status: form.status,
        isLateral: form.isLateral,
        updatedAt: new Date().toISOString(),
      };
      const docId = form.regNo.trim().toLowerCase().replace(/\s+/g, '_');

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
                <option key={s.id || s.value || s} value={s.value || s.id || s}>{s.label || s.name || `Semester ${s.value || s}`}</option>
              ))}
            </select>
          </div>
          {/* Section/Batch */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>Section / Batch</label>
            <select style={{ ...fieldStyle(false), appearance: 'none' }} value={form.section} onChange={e => set('section', e.target.value)}>
              <option value="">Select Batch</option>
              {(groups || []).map(g => (
                <option key={g.id || g.value || g} value={g.value || g.id || g.name || g}>{g.name || g.label || g.value || g}</option>
              ))}
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
  return (
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
    </div>
  );
}

// ─────────────────────────────────────────────
// Import Modal
// ─────────────────────────────────────────────
const IMPORT_FIELDS = ['regNo', 'name', 'branch', 'semester', 'section', 'rollNo'];
const FIELD_LABELS = { regNo: 'Reg No', name: 'Name', branch: 'Branch', semester: 'Semester', section: 'Section/Batch', rollNo: 'Roll No' };

function ImportModal({ onClose, onImported }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [mapping, setMapping] = useState({});
  const [conflict, setConflict] = useState('skip');
  const [step, setStep] = useState('upload'); // upload | map | confirm
  const [progress, setProgress] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const parseFile = useCallback((f) => {
    setFile(f);
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      Papa.parse(f, {
        header: true, skipEmptyLines: true,
        complete: (res) => {
          setHeaders(res.meta.fields || []);
          setRows(res.data);
          setPreview(res.data.slice(0, 5));
          autoMap(res.meta.fields || []);
          setStep('map');
        },
        error: () => toast.error('Failed to parse CSV'),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const hdrs = data.length ? Object.keys(data[0]) : [];
        setHeaders(hdrs); setRows(data); setPreview(data.slice(0, 5));
        autoMap(hdrs);
        setStep('map');
      };
      reader.readAsArrayBuffer(f);
    }
  }, []);

  const autoMap = (hdrs) => {
    const m = {};
    IMPORT_FIELDS.forEach(field => {
      const match = hdrs.find(h => h.toLowerCase().replace(/[\s_-]/g, '') === field.toLowerCase());
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
    setImporting(true);
    try {
      const mapped = rows.map(r => ({
        regNo: String(r[mapping.regNo] || '').trim(),
        name: String(r[mapping.name] || '').trim(),
        branch: String(r[mapping.branch] || '').trim(),
        semester: String(r[mapping.semester] || '').trim(),
        section: String(r[mapping.section] || '').trim(),
        rollNo: String(r[mapping.rollNo] || '').trim(),
        status: 'active',
        isLateral: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })).filter(r => r.regNo && r.name);

      const chunks = chunkArray(mapped, CHUNK_SIZE);
      let done = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const student of chunk) {
          const docId = student.regNo.toLowerCase().replace(/\s+/g, '_');
          const ref = doc(db, 'students', docId);
          if (conflict === 'overwrite') {
            batch.set(ref, student);
          } else {
            const existing = await getDoc(ref);
            if (!existing.exists()) batch.set(ref, student);
          }
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
        {step === 'upload' && (
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
            <div style={{ fontSize: 13, color: '#64748b' }}>or click to browse — CSV or Excel (.xlsx) supported</div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={e => e.target.files[0] && parseFile(e.target.files[0])} />
          </div>
        )}

        {step === 'map' && (
          <>
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10 }}>
              <span style={{ fontSize: 13, color: '#93c5fd' }}>
                <strong>{rows.length}</strong> rows detected from <strong>{file?.name}</strong>. Map the columns below.
              </span>
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
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>Preview (first 5 rows)</div>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {IMPORT_FIELDS.filter(f => mapping[f]).map(f => (
                        <th key={f} style={{ padding: '8px 12px', color: '#64748b', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{FIELD_LABELS[f]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
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
              <Btn variant="ghost" onClick={() => setStep('upload')}>← Back</Btn>
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
                <Btn variant="primary" onClick={handleImport} disabled={importing} icon={Upload}>
                  {importing ? 'Importing…' : `Import ${rows.length} Students`}
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
  const { userProfile } = useAuth();
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

  // ── Fetch stats on mount ──
  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const col = collection(db, 'students');
        const [activeSnap, alumniSnap, tcSnap] = await Promise.all([
          getCountFromServer(query(col, where('status', '==', 'active'))),
          getCountFromServer(query(col, where('status', '==', 'alumni'))),
          getCountFromServer(query(col, where('status', '==', 'tc'))),
        ]);
        setStats({
          active: activeSnap.data().count,
          groups: groups.length,
          alumni: alumniSnap.data().count,
          tc: tcSnap.data().count,
        });
      } catch (err) {
        console.error('Stats fetch error:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [groups.length]);

  // ── Real-time query ──
  useEffect(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (!filterBatch && !filterSemester) {
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSelected(new Set());
    const col = collection(db, 'students');
    let constraints = [];
    if (filterBatch) constraints.push(where('section', '==', filterBatch));
    if (filterSemester) constraints.push(where('semester', '==', filterSemester));
    constraints.push(orderBy('name'));
    const q = query(col, ...constraints);
    unsubRef.current = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      setStudents(data);
      setLoading(false);
    }, (err) => {
      console.error('Student query error:', err);
      toast.error('Failed to load students');
      setLoading(false);
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [filterBatch, filterSemester]);

  // ── Filtered list ──
  const filteredStudents = useMemo(() => {
    let list = students;
    if (filterStatus !== 'all') list = list.filter(s => s.status === filterStatus);
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

  // ── Bulk Status Change ──
  const handleBulkStatus = async (newStatus) => {
    try {
      const ids = [...selected];
      const chunks = chunkArray(ids, CHUNK_SIZE);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(id => batch.update(doc(db, 'students', id), { status: newStatus, updatedAt: new Date().toISOString() }));
        await batch.commit();
      }
      toast.success(`${selected.size} students set to ${STATUS_CONFIG[newStatus]?.label}`);
      setSelected(new Set());
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
    <div style={{ minHeight: '100vh', color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif" }}>
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
      <div style={{ marginBottom: 28 }}>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
        <StatCard icon={UserCheck} value={stats.active} label="Active Students" glow="#3b82f6" gradient="linear-gradient(135deg,#3b82f6,#2563eb)" loading={statsLoading} />
        <StatCard icon={BookOpen} value={stats.groups} label="Total Batches" glow="#8b5cf6" gradient="linear-gradient(135deg,#8b5cf6,#6d28d9)" loading={statsLoading} />
        <StatCard icon={GraduationCap} value={stats.alumni} label="Alumni" glow="#22c55e" gradient="linear-gradient(135deg,#22c55e,#16a34a)" loading={statsLoading} />
        <StatCard icon={UserX} value={stats.tc} label="Transferred (TC)" glow="#ef4444" gradient="linear-gradient(135deg,#ef4444,#dc2626)" loading={statsLoading} />
      </div>

      {/* Control Bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 24, padding: '16px 20px',
        background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '20px', backdropFilter: 'blur(16px)',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
      }}>
        <ControlInput icon={Search} placeholder="Search name or reg no…" value={search} onChange={setSearch} style={{ flex: '1 1 240px', minWidth: 200 }} />
        <ControlSelect value={filterBatch} onChange={setFilterBatch} style={{ flex: '1 1 160px', minWidth: 140 }}>
          <option value="">All Batches</option>
          {groups.map(g => <option key={g.id || g.name || g} value={g.value || g.name || g.id || g}>{g.name || g.label || g}</option>)}
        </ControlSelect>
        <ControlSelect value={filterSemester} onChange={setFilterSemester} style={{ flex: '1 1 160px', minWidth: 140 }}>
          <option value="">All Semesters</option>
          {semesters.map(s => <option key={s.id || s.value || s} value={s.value || s.id || s}>{s.label || s.name || `Semester ${s.value || s}`}</option>)}
        </ControlSelect>
        <ControlSelect value={filterStatus} onChange={setFilterStatus} style={{ flex: '0 0 140px' }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="alumni">Alumni</option>
          <option value="tc">TC</option>
        </ControlSelect>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
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
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <ControlSelect value={bulkStatus} onChange={setBulkStatus} style={{ minWidth: 160, background: 'rgba(0,0,0,0.3)' }}>
                <option value="active">Set to Active</option>
                <option value="alumni">Set to Alumni</option>
                <option value="tc">Set to TC</option>
              </ControlSelect>
              <Btn variant="success" size="sm" icon={CheckCircle} onClick={() => handleBulkStatus(bulkStatus)}>Apply</Btn>
            </div>
            <Btn variant="danger" size="sm" icon={Trash2} onClick={handleBulkDelete}>Delete</Btn>
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
            <div style={{ fontSize: 18, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Select a Batch or Semester</div>
            <div style={{ fontSize: 14, color: '#334155' }}>Choose a batch or semester filter above to load students and avoid unnecessary reads.</div>
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
                  <th style={{ padding: '16px', textAlign: 'center', width: 40 }}>
                    <input type="checkbox"
                      checked={selected.size === filteredStudents.length && filteredStudents.length > 0}
                      onChange={toggleAll}
                      style={{ accentColor: '#3b82f6', width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </th>
                  {['#', 'Student', 'Reg No', 'Branch', 'Sem', 'Batch', 'Status', 'Actions'].map(h => (
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
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <input type="checkbox"
                        checked={selected.has(student._id)}
                        onChange={() => toggleSelect(student._id)}
                        style={{ accentColor: '#3b82f6', width: 15, height: 15, cursor: 'pointer' }}
                      />
                    </td>
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
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{student.section || '—'}</td>
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
          semesters={semesters}
          onClose={() => { setShowAddModal(false); setEditStudent(null); }}
          onSaved={() => { setShowAddModal(false); setEditStudent(null); }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
