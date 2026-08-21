import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Printer, Download, Calendar, Type, Maximize2, FileText, SlidersHorizontal } from 'lucide-react';
import { formatSemester } from '../../utils/sortUtils';
import { useMasterData } from '../../contexts/MasterDataContext';
import QuantumLoader from '../../components/QuantumLoader';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const StudentAttendance = () => {
    const { semesters, subjects } = useMasterData();

    const [config, setConfig] = useState({
        semester: '',
        group: '',
        subject: '',
        labNo: '',
        date: ''
    });

    const [semesterStudents, setSemesterStudents] = useState([]);
    const [loadingSem, setLoadingSem] = useState(false);
    
    // Default to sensible sizes so HMR doesn't blow up the table
    const [printSettings, setPrintSettings] = useState({ fontSize: 10, rowHeight: 18, paperSize: 'A4' });
    const [maxPrintLimits, setMaxPrintLimits] = useState({ fontSize: 16, rowHeight: 40 });



    const getOrdinal = (n) => {
        const s = ["th", "st", "nd", "rd"], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    // Auto-fetch students when semester changes
    useEffect(() => {
        let isActive = true;
        const fetchStudentsForSem = async () => {
            if (!config.semester) {
                setSemesterStudents([]);
                setConfig(prev => ({ ...prev, group: '' }));
                return;
            }

            setLoadingSem(true);
            try {
                const studentRef = collection(db, 'students');
                const q = query(studentRef, where('semester', '==', config.semester.toString()));
                const snapshot = await getDocs(q);
                if (!isActive) return;
                let data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                
                // Filter out transferred/alumni
                data = data.filter(s => s.status === 'active');
                setSemesterStudents(data);
                
                // Reset group if it's no longer valid in the new semester
                setConfig(prev => ({ ...prev, group: '' }));
            } catch (error) {
                console.error("Error fetching students", error);
                toast.error("Failed to load students for semester.");
            } finally {
                if (isActive) setLoadingSem(false);
            }
        };

        fetchStudentsForSem();
        return () => { isActive = false; };
    }, [config.semester]);

    // Smart Group Discovery
    const dynamicGroups = useMemo(() => {
        if (!config.semester || semesterStudents.length === 0) return [];
        const groupSet = new Set();
        semesterStudents.forEach(s => {
            const sSection = (s.section || '').trim();
            const sGroup = String(s.group || '1').trim();
            const subStr = sSection ? sSection : (s.branch || '').trim();
            const badge = `${subStr}-${sGroup}`.toUpperCase();
            groupSet.add(badge);
        });
        return Array.from(groupSet).sort();
    }, [semesterStudents, config.semester]);

    // Derived sheet students based on selected group
    const sheetStudents = useMemo(() => {
        if (!config.group || semesterStudents.length === 0) return [];
        
        let filtered = semesterStudents.filter(s => {
            const sSection = (s.section || '').trim();
            const sGroup = String(s.group || '1').trim();
            const subStr = sSection ? sSection : (s.branch || '').trim();
            const badge = `${subStr}-${sGroup}`.toUpperCase();
            return badge === config.group;
        });

        // Sort by Roll No / Reg No
        filtered.sort((a, b) => {
            const rollA = parseInt(a.rollNo || a.rollno || '0');
            const rollB = parseInt(b.rollNo || b.rollno || '0');
            if (rollA && rollB && rollA !== rollB) return rollA - rollB;
            return (a.regNo || '').localeCompare(b.regNo || '');
        });
        return filtered;
    }, [semesterStudents, config.group]);

    const PAPER_SIZES = useMemo(() => ({
        'A4': { css: 'A4 portrait', maxSafeHeight: 1000, name: 'A4 (Standard)', width: '210mm' },
        'A3': { css: 'A3 portrait', maxSafeHeight: 1450, name: 'A3 (Large)', width: '297mm' },
        'Letter': { css: 'letter portrait', maxSafeHeight: 950, name: 'Letter (8.5 x 11")', width: '215.9mm' },
        'Legal': { css: 'legal portrait', maxSafeHeight: 1150, name: 'Legal (8.5 x 14")', width: '215.9mm' },
        'B5': { css: 'B5 portrait', maxSafeHeight: 820, name: 'B5 (Notebook)', width: '176mm' },
        '6x4': { css: '4in 6in', maxSafeHeight: 420, name: '6x4 (Photo Card)', width: '101.6mm' }
    }), []);



    const [isAiOptimizing, setIsAiOptimizing] = useState(false);
    const [aiProgress, setAiProgress] = useState(0);
    const aiTimeoutRef = useRef(null);
    const aiIntervalRef = useRef(null);

    const runAiOptimizer = useCallback(() => {
        if (sheetStudents.length === 0) return;
        
        if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
        if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);

        setIsAiOptimizing(true);
        setAiProgress(0);

        // Calculate math immediately to lock in the closure values
        const currentPaper = PAPER_SIZES[printSettings.paperSize] || PAPER_SIZES['A4'];
        const PAGE_HEIGHT = currentPaper.maxSafeHeight; 
        
        const headerEl = document.getElementById('print-header');
        const footerEl = document.getElementById('print-footer');
        
        const dynamicHeaderHeight = headerEl ? headerEl.offsetHeight : 160;
        const dynamicFooterHeight = footerEl ? footerEl.offsetHeight : 95;
        const exactFixedSpace = dynamicHeaderHeight + dynamicFooterHeight + 65; 
        const targetTableHeight = PAGE_HEIGHT - exactFixedSpace;
        
        let idealRowHeight = (targetTableHeight / sheetStudents.length);
        // Cap at 28 to ensure the sheet looks like a normal sheet (spawning empty rows) instead of massive text boxes
        idealRowHeight = Math.max(9, Math.min(idealRowHeight, 28));
        
        // The font size dynamically fills the row height (70% height).
        let idealFontSize = idealRowHeight * 0.70;
        idealFontSize = Math.max(8, Math.min(idealFontSize, 14));
        
        const finalRowHeight = Number(idealRowHeight.toFixed(2));
        const finalFontSize = Number(idealFontSize.toFixed(2));

        // Simulate AI Processing visually
        let progress = 0;
        aiIntervalRef.current = setInterval(() => {
            progress += 18;
            setAiProgress(Math.min(progress, 100));
            if (progress >= 100) {
                clearInterval(aiIntervalRef.current);
                
                aiTimeoutRef.current = setTimeout(() => {
                    setPrintSettings(prev => ({
                        ...prev,
                        rowHeight: finalRowHeight,
                        fontSize: finalFontSize
                    }));
                    
                    setMaxPrintLimits({ 
                        fontSize: finalFontSize + 6, 
                        rowHeight: finalRowHeight + 15 
                    });
                    
                    setIsAiOptimizing(false);
                }, 100);
            }
        }, 50);
    }, [sheetStudents.length, printSettings.paperSize, PAPER_SIZES]);

    // Auto-adjust the sliders to optimal values when the batch or paper size changes
    useEffect(() => {
        if (sheetStudents.length > 0) {
            runAiOptimizer();
        }
    }, [config.group, sheetStudents.length, printSettings.paperSize, runAiOptimizer]);

    const handleExportExcel = () => {
        if (sheetStudents.length === 0) return;

        const dataForExcel = sheetStudents.map((s, idx) => ({
            'Sl No': idx + 1,
            'Roll No': s.rollNo || s.rollno || '--',
            'Regd No': s.regNo || '--',
            'Student Name': (s.name || 'Unnamed Student').toUpperCase(),
            'Branch': s.branch || '--'
        }));

        const ws = XLSX.utils.json_to_sheet(dataForExcel);
        ws['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 35 }, { wch: 30 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Attendance Sheet");

        const fileName = `Attendance_Sem${config.semester}_${config.group}_${config.subject}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const printCss = `
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap');
        @page {
            size: ${PAPER_SIZES[printSettings.paperSize]?.css || 'A4 portrait'};
            margin: 10mm;
        }
        .print-table { border: none; width: 100%; table-layout: fixed; border-collapse: collapse; }
        .print-table thead { display: table-header-group; }
        .print-table tbody tr { page-break-inside: avoid; page-break-after: auto; }
        .sig-table, .sig-table td { border: none !important; }
        .sig-table { page-break-inside: avoid; }
        
        /* Apply table borders to BOTH preview and print */
        .print-table th, .print-table td { padding: 1px 2px; box-sizing: border-box; border: 1px solid black; line-height: 1.1 !important; word-wrap: break-word; }
        .print-table tfoot td { border: none !important; }
        .print-table th:first-child, .print-table td:first-child { border-left: none; }
        .print-table th:last-child,  .print-table td:last-child  { border-right: none; }
        .print-table tr:first-child th { border-top: none; }
        .print-table tbody tr:last-child td { border-bottom: none; }
        .print-table th { border-bottom: 2px solid black; font-weight: 900 !important; text-align: center; background: #f8fafc; }
        
        @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            header, aside, nav, footer, .sidebar, .top-header, .no-print { display: none !important; }
            body, html, #root, main { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: white !important; }
            .lams-print-page-wrapper, .lams-print-content-wrapper { display: block !important; overflow: visible !important; height: auto !important; margin: 0 !important; padding: 0 !important; border: none !important; background: none !important; background-color: white !important; background-image: none !important; box-shadow: none !important; border-radius: 0 !important; }
            .preview-wrapper { display: block !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; border: none !important; background: none !important; background-color: white !important; background-image: none !important; box-shadow: none !important; width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
            .print-area { display: block !important; overflow: visible !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; background: none !important; background-color: white !important; background-image: none !important; color: black !important; font-family: 'Lato', sans-serif !important; box-shadow: none !important; border-radius: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; }
            
            .sig-table { margin-top: 10px !important; }
            ::-webkit-scrollbar { display: none; }
        }
    `;

    // Calculate padding dynamically based on row height
    let cellPadding = 2;
    if (printSettings.rowHeight <= 16) cellPadding = 0;
    else if (printSettings.rowHeight <= 24) cellPadding = 1;

    const isReady = config.semester && config.group;

    // AI-like Dynamic Exact Fitting Math
    useEffect(() => {
        if (!isReady || sheetStudents.length === 0) return;
        
        let timeoutId;
        const calculateExactWidths = () => {
            const containers = document.querySelectorAll('.dynamic-scale-container');
            containers.forEach(container => {
                const textSpan = container.querySelector('.dynamic-scale-target');
                if (!textSpan) return;
                
                // Reset scale to measure natural width
                textSpan.style.transform = 'scaleX(1)';
                
                const availableWidth = container.getBoundingClientRect().width;
                const naturalWidth = textSpan.getBoundingClientRect().width;
                
                if (naturalWidth > availableWidth && availableWidth > 0) {
                    const exactScale = (availableWidth - 1) / naturalWidth;
                    
                    // Advanced Typographical Scaling
                    if (exactScale >= 0.80) {
                        // Mild overflow: Squeeze horizontally to maintain uniform row height (like a condensed font)
                        textSpan.style.transform = `scaleX(${exactScale})`;
                    } else {
                        // Extreme overflow (Future-proof for massive names/numbers):
                        // Squeezing purely horizontally below 80% creates an unreadable 'barcode' effect.
                        // We lock the horizontal compression at an aesthetically pleasing 80% (0.8), 
                        // and proportionally shrink the vertical height for the remainder to preserve readability!
                        const verticalScale = exactScale / 0.80;
                        textSpan.style.transform = `scale(${exactScale}, ${verticalScale})`;
                    }
                }
            });
        };

        // Ensure font is loaded before calculating
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                timeoutId = setTimeout(calculateExactWidths, 100);
            });
        } else {
            timeoutId = setTimeout(calculateExactWidths, 100);
        }
        
        // Ensure calculations fire exactly when the print dialog opens
        window.addEventListener('beforeprint', calculateExactWidths);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('beforeprint', calculateExactWidths);
        };
    }, [sheetStudents, printSettings.fontSize, printSettings.rowHeight, printSettings.paperSize, isReady]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <style>{printCss}</style>
            <div className="glass-panel no-print" style={{ 
                padding: '2rem', overflow: 'hidden', 
                background: 'rgba(23, 21, 44, 0.7)', border: '1px solid rgba(255, 255, 255, 0.05)', 
                borderRadius: '16px', backdropFilter: 'blur(20px)',
                boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)',
                color: '#e2e8f0'
            }}>
                {/* ── Header ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ padding: '12px', background: 'linear-gradient(135deg, #4f46e5, #3b82f6)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Printer size={24} color="white" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>Attendance Sheet Generator</h3>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', marginTop: '2px' }}>Configure and print your lab attendance sheet</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '999px', padding: '6px 16px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: sheetStudents.length > 0 ? '#10b981' : '#64748b' }} />
                        <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>{sheetStudents.length} students matched</span>
                    </div>
                </div>

                {/* ── Config Body ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Row 1 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                <span style={{ color: '#a855f7', fontSize: '1.2rem' }}>•</span> SEMESTER
                            </label>
                            <select style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none' }} value={config.semester} onChange={e => setConfig({ ...config, semester: e.target.value })}>
                                <option value="" style={{ background: '#0f172a' }}>— Select Semester —</option>
                                {semesters.map(s => <option key={s.id} value={s.number} style={{ background: '#0f172a' }}>{formatSemester(s.number)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span> LAB BATCH / SUB-GROUP
                            </label>
                            <select 
                                style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: config.semester && !config.group ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none' }} 
                                value={config.group} 
                                onChange={e => setConfig({ ...config, group: e.target.value })}
                                disabled={!config.semester || loadingSem}
                            >
                                <option value="" style={{ background: '#0f172a' }}>{loadingSem ? 'Loading batches...' : '— Select Batch —'}</option>
                                {dynamicGroups.map(g => <option key={g} value={g} style={{ background: '#0f172a' }}>{g}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                <span style={{ color: '#eab308', fontSize: '1.2rem' }}>•</span> SUBJECT
                            </label>
                            <select style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none' }} value={config.subject} onChange={e => setConfig({ ...config, subject: e.target.value })}>
                                <option value="" style={{ background: '#0f172a' }}>— Select Subject —</option>
                                {subjects.map(s => <option key={s.id} value={s.name} style={{ background: '#0f172a' }}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span> LAB NUMBER / HALL
                            </label>
                            <input style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none' }} placeholder="e.g. Lab-1, Hall-A" value={config.labNo} onChange={e => setConfig({ ...config, labNo: e.target.value })} />
                        </div>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                <span style={{ color: '#ec4899', fontSize: '1.2rem' }}>•</span> DATE
                            </label>
                            <input type="date" style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.95rem', outline: 'none', colorScheme: 'dark' }} value={config.date} onChange={e => setConfig({ ...config, date: e.target.value })} />
                        </div>
                    </div>

                    {/* Print Settings Premium Container */}
                    <div style={{ position: 'relative', marginTop: '1rem', borderRadius: '20px', padding: '1.5rem 2rem', background: 'linear-gradient(180deg, rgba(30,41,59,0.4) 0%, rgba(15,23,42,0.6) 100%)', border: '1px solid rgba(255,255,255,0.06)', borderTop: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 40px -10px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                        
                        {/* Subtle decorative glow */}
                        <div style={{ position: 'absolute', top: '-50px', left: '20%', width: '60%', height: '50px', background: 'radial-gradient(ellipse at top, rgba(99,102,241,0.2), transparent 70%)', pointerEvents: 'none' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.8rem', position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ background: 'rgba(56,189,248,0.1)', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                    <SlidersHorizontal size={16} color="#38bdf8" />
                                </div>
                                <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#e2e8f0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Print Layout Adjustments</h4>
                            </div>
                            

                        </div>
                        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2.5rem', position: 'relative' }}>
                            <style>{`
                                .premium-slider { -webkit-appearance: none; width: 100%; height: 6px; border-radius: 10px; outline: none; transition: all 0.2s; }
                                .premium-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #ffffff; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 2px 10px rgba(0,0,0,0.5), inset 0 0 0 2px var(--thumb-color); }
                                .premium-slider::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 4px 15px rgba(0,0,0,0.6), inset 0 0 0 2px var(--thumb-color); }
                                .premium-slider::-webkit-slider-thumb:active { transform: scale(0.95); }
                                .premium-select { appearance: none; background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E"); background-repeat: no-repeat; background-position: right 14px top 50%; background-size: 10px auto; }
                                .premium-select:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2) !important; }
                            `}</style>
                            
                            {/* Font Size Slider */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                                        <Type size={14} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Font Size</span>
                                    </div>
                                    <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', padding: '2px 8px', borderRadius: '6px' }}>
                                        <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.8rem' }}>{printSettings.fontSize}px</span>
                                    </div>
                                </div>
                                <div style={{ position: 'relative', width: '100%', padding: '10px 0' }}>
                                    <input
                                        type="range" min={7.5} max={maxPrintLimits.fontSize} step={0.5}
                                        value={printSettings.fontSize}
                                        onChange={e => setPrintSettings(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                                        className="premium-slider"
                                        style={{ '--thumb-color': '#3b82f6', background: `linear-gradient(to right, #3b82f6 ${((printSettings.fontSize - 7.5) / (maxPrintLimits.fontSize - 7.5)) * 100}%, rgba(255,255,255,0.1) 0%)` }}
                                    />
                                </div>
                            </div>

                            {/* Row Height Slider */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                                        <Maximize2 size={14} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Row Height</span>
                                    </div>
                                    <div style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', padding: '2px 8px', borderRadius: '6px' }}>
                                        <span style={{ color: '#c084fc', fontWeight: 700, fontSize: '0.8rem' }}>{printSettings.rowHeight}px</span>
                                    </div>
                                </div>
                                <div style={{ position: 'relative', width: '100%', padding: '10px 0' }}>
                                    <input
                                        type="range" min={12} max={maxPrintLimits.rowHeight} step={0.5}
                                        value={printSettings.rowHeight}
                                        onChange={e => setPrintSettings(prev => ({ ...prev, rowHeight: Number(e.target.value) }))}
                                        className="premium-slider"
                                        style={{ '--thumb-color': '#a855f7', background: `linear-gradient(to right, #a855f7 ${((printSettings.rowHeight - 12) / (maxPrintLimits.rowHeight - 12)) * 100}%, rgba(255,255,255,0.1) 0%)` }}
                                    />
                                </div>
                            </div>

                            {/* Paper Size Dropdown */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                                    <FileText size={14} />
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Paper Size</span>
                                </div>
                                <select 
                                    className="premium-select"
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} 
                                    value={printSettings.paperSize} 
                                    onChange={e => setPrintSettings(prev => ({ ...prev, paperSize: e.target.value }))}
                                >
                                    {Object.entries(PAPER_SIZES).map(([key, data]) => (
                                        <option key={key} value={key}>{data.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Action Area */}
                    {!isReady ? (
                        <button
                            disabled
                            style={{ width: '100%', padding: '16px', background: 'rgba(255,255,255,0.03)', color: '#475569', borderRadius: '14px', border: 'none', fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'not-allowed', marginTop: '0.5rem' }}
                        >
                            <Printer size={20} /> Select filters to generate sheet
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                            <button
                                onClick={() => window.print()}
                                style={{ flex: 1, padding: '16px', background: 'linear-gradient(135deg, #4f46e5, #3b82f6)', color: 'white', borderRadius: '14px', border: 'none', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', boxShadow: '0 4px 20px rgba(59,130,246,0.4)', transition: 'all 0.2s' }}
                            >
                                <Printer size={20} /> Print / Save as PDF
                            </button>
                            <button
                                onClick={handleExportExcel}
                                style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.05)', color: 'white', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                                <Download size={20} /> Export Excel
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════ PRINT PREVIEW ═══════════════════════ */}
            {isReady && sheetStudents.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', padding: 'min(2.5rem, 5vw)', background: 'linear-gradient(135deg, rgba(15,23,42,0.4), rgba(30,41,59,0.4))', borderRadius: '24px', overflowX: 'auto' }} className="preview-wrapper">
                    {/* True WYSIWYG Print Preview Box - Exactly simulates paper aspect ratio */}
                    <div className="print-area" style={{ 
                        background: 'white', color: 'black', padding: '10mm', 
                        borderRadius: '2px', fontFamily: "'Lato', sans-serif", 
                        width: PAPER_SIZES[printSettings.paperSize]?.width || '210mm', 
                        boxSizing: 'border-box', margin: '0 auto',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ border: '2px solid black', width: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                            {/* ── HEADER BLOCK ── */}
                            <div id="print-header" style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid black' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', padding: '8px 10px', background: '#ffffff' }}>
                                        <img src="/trident-logo.png" alt="Logo" style={{ height: '35px', width: 'auto' }} />
                                        <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>TRIDENT ACADEMY OF TECHNOLOGY, BBSR</h1>
                                    </div>
                                    <div style={{ borderTop: '1px solid black', background: '#e2e8f0', padding: '5px 0', textAlign: 'center' }}>
                                        <h2 style={{ fontSize: '14px', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '8px' }}>Laboratory Attendance Sheet</h2>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', borderBottom: '1px solid black', fontSize: '13px' }}>
                                    <div style={{ width: '50%', borderRight: '1px solid black', padding: '4px 8px', display: 'flex' }}>
                                        <span style={{ fontWeight: '900', marginRight: '5px' }}>Date:</span><span style={{ borderBottom: '1px dotted black', flex: 1, textAlign: 'center', fontWeight: '900' }}>{config.date ? config.date.split('-').reverse().join('-') : ''}</span>
                                    </div>
                                    <div style={{ flex: 1, padding: '4px 8px', display: 'flex' }}>
                                        <span style={{ fontWeight: '900', marginRight: '5px' }}>Branch:</span><span style={{ borderBottom: '1px dotted black', flex: 1, textAlign: 'center', fontWeight: '900' }}>{config.group}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', borderBottom: '1px solid black', fontSize: '13px' }}>
                                    <div style={{ width: '25%', borderRight: '1px solid black', padding: '4px 8px', display: 'flex' }}>
                                        <span style={{ fontWeight: '900', marginRight: '5px' }}>Sem:</span><span style={{ borderBottom: '1px dotted black', flex: 1, textAlign: 'center', fontWeight: '900' }}>{config.semester ? getOrdinal(parseInt(config.semester)).toUpperCase() : ''}</span>
                                    </div>
                                    <div style={{ flex: 1, borderRight: '1px solid black', padding: '4px 8px', display: 'flex' }}>
                                        <span style={{ fontWeight: '900', marginRight: '5px' }}>Subject:</span><span style={{ borderBottom: '1px dotted black', flex: 1, textAlign: 'center', fontWeight: '900' }}>{config.subject}</span>
                                    </div>
                                    <div style={{ width: '25%', padding: '4px 8px', display: 'flex' }}>
                                        <span style={{ fontWeight: '900', marginRight: '5px' }}>Lab No:</span><span style={{ borderBottom: '1px dotted black', flex: 1, textAlign: 'center', fontWeight: '900' }}>{config.labNo}</span>
                                    </div>
                                </div>
                            </div>
                            <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', border: 'none', fontSize: `${printSettings.fontSize}px`, tableLayout: 'fixed' }}>
                                    <thead style={{ fontSize: `${Math.min(printSettings.fontSize, 13)}px` }}>
                                        <tr>
                                            <th style={{ width: '5%', padding: `${cellPadding}px` }}>Roll<br/>No</th>
                                            <th style={{ width: '12%', padding: `${cellPadding}px` }}>Regd. No</th>
                                            <th style={{ width: '25%', padding: `${cellPadding}px` }}>Name of the Student</th>
                                            <th style={{ width: '28%', padding: `${cellPadding}px` }}>Signature</th>
                                            <th style={{ width: '6%', fontSize: '0.75em', letterSpacing: '-0.2px', padding: `${cellPadding}px` }}>DP&A<br/>(2)</th>
                                            <th style={{ width: '6%', fontSize: '0.75em', letterSpacing: '-0.2px', padding: `${cellPadding}px` }}>LR<br/>(2)</th>
                                            <th style={{ width: '6%', fontSize: '0.75em', letterSpacing: '-0.2px', padding: `${cellPadding}px` }}>LQ<br/>(1)</th>
                                            <th style={{ width: '6%', fontSize: '0.75em', letterSpacing: '-0.2px', padding: `${cellPadding}px` }}>E&V<br/>(5)</th>
                                            <th style={{ width: '6%', fontSize: '0.75em', letterSpacing: '-0.2px', padding: `${cellPadding}px` }}>TOTAL<br/>(10)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sheetStudents.map((student, index) => {
                                            const nameText = (student.name || '').toUpperCase();
                                            const nameLen = nameText.length;
                                            
                                            // PURE MATHEMATICAL SCALING
                                            // Default Chrome A4 print width = ~718px (with Default margins)
                                            // Name column is 25% = ~179px. Minus 10px padding = 169px usable width.
                                            // Bold uppercase character is roughly 0.6x fontSize in pixels.
                                            // Use a uniform slightly smaller font size for names and reg numbers
                                            // instead of squishing them, and let extremely long names naturally wrap to 2 lines.

                                            return (
                                                <tr key={student.id} style={{ height: `${printSettings.rowHeight}px` }}>
                                                    <td style={{ textAlign: 'center', fontWeight: 'bold', padding: `${cellPadding}px`, overflow: 'hidden' }}>
                                                        <div className="dynamic-scale-container" style={{
                                                            width: '100%',
                                                            fontSize: `${printSettings.fontSize}px`,
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            display: 'flex',
                                                            justifyContent: 'center'
                                                        }}>
                                                            <span className="dynamic-scale-target" style={{
                                                                display: 'inline-block',
                                                                flexShrink: 0,
                                                                transformOrigin: 'center center',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {student.rollNo || '--'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontWeight: 'bold', padding: `${cellPadding}px`, overflow: 'hidden' }}>
                                                        <div className="dynamic-scale-container" style={{
                                                            width: '100%',
                                                            fontSize: `${printSettings.fontSize}px`,
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            display: 'flex',
                                                            justifyContent: 'center'
                                                        }}>
                                                            <span className="dynamic-scale-target" style={{
                                                                display: 'inline-block',
                                                                flexShrink: 0,
                                                                transformOrigin: 'center center',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {student.regNo || ''}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: `0 ${cellPadding + 4}px`, fontWeight: '500', overflow: 'hidden' }}>
                                                        <div className="dynamic-scale-container" style={{
                                                            width: '100%',
                                                            fontSize: `${printSettings.fontSize}px`,
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden'
                                                        }}>
                                                            <span className="dynamic-scale-target" style={{
                                                                display: 'inline-block',
                                                                flexShrink: 0,
                                                                transformOrigin: 'left center',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {(student.name || '').toUpperCase()}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: `${cellPadding}px` }}></td>
                                                    <td style={{ padding: `${cellPadding}px` }}></td>
                                                    <td style={{ padding: `${cellPadding}px` }}></td>
                                                    <td style={{ padding: `${cellPadding}px` }}></td>
                                                    <td style={{ padding: `${cellPadding}px` }}></td>
                                                    <td style={{ padding: `${cellPadding}px` }}></td>
                                                </tr>
                                            );
                                        })}
                                        {/* Render empty rows to fill the rest of the page */}
                                        {Array.from({ length: Math.max(0, Math.floor(((PAPER_SIZES[printSettings.paperSize]?.maxSafeHeight || 1000) - 320) / printSettings.rowHeight) - sheetStudents.length) }).map((_, i) => (
                                            <tr key={`empty-${i}`} style={{ height: `${printSettings.rowHeight}px` }}>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                                <td style={{ padding: `${cellPadding}px` }}></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                        </div>
                        
                        {/* ════════════ SIGNATURE BLOCK (OUTSIDE TABLE BORDER) ════════════ */}
                        <div id="print-footer" className="sig-wrapper" style={{ width: '100%', marginTop: '30px', pageBreakInside: 'avoid' }}>
                            <table className="sig-table" style={{ width: '100%', border: 'none' }}>
                                <tbody>
                                    <tr>
                                        <th style={{ width: "50%", paddingTop: "50px", paddingRight: "40px", paddingBottom: "10px", verticalAlign: "bottom", border: 'none' }}>
                                            <div style={{ borderTop: "2px solid black", textAlign: "center", fontSize: "14px", fontWeight: "900", paddingTop: "8px", width: "80%", margin: "0 auto" }}>Faculty Signature</div>
                                        </th>
                                        <th style={{ width: "50%", paddingTop: "50px", paddingLeft: "40px", paddingBottom: "10px", verticalAlign: "bottom", border: 'none' }}>
                                            <div style={{ borderTop: "2px solid black", textAlign: "center", fontSize: "14px", fontWeight: "900", paddingTop: "8px", width: "80%", margin: "0 auto" }}>HOD Signature</div>
                                        </th>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{ __html: printCss }} />
        </div>
    );
};

export default StudentAttendance;
