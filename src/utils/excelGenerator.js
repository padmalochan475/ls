import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { saveAs } from 'file-saver';
import { sortSemesters } from './sortUtils';

export const styledExportToExcel = async ({
    days,
    timeSlots,
    getAssignments,
    getSubjectShortCode,
    getFacultyShortCode,
    activeAcademicYear
}) => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Schedule');

    // Styles
    const headerStyle = {
        font: { name: 'Arial', size: 11, bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4DFEC' } },
        alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
        border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };

    const dayStyle = { ...headerStyle };

    const dataStyle = {
        font: { name: 'Arial', size: 10 },
        alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
        border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };

    // 1. Headers
    const headerRow = ['Day', ...timeSlots];
    ws.addRow(headerRow);

    // Apply Header Styles
    ws.getRow(1).height = 30;
    ws.getRow(1).eachCell((cell) => {
        cell.style = headerStyle;
        cell.border = headerStyle.border;
    });

    // Columns width
    const colWidths = [18, ...timeSlots.map(() => 40)];
    ws.columns = colWidths.map(w => ({ width: w }));

    let currentRow = 2;

    days.forEach(day => {
        const slotsMap = {};
        timeSlots.forEach(t => slotsMap[t] = []);

        timeSlots.forEach(time => {
            const dayAssignments = getAssignments(day, time);
            dayAssignments.sort(sortSemesters);
            slotsMap[time] = dayAssignments;
        });

        // Determine Max Rows
        let maxRows = 0;
        timeSlots.forEach(t => {
            if (slotsMap[t].length > maxRows) maxRows = slotsMap[t].length;
        });
        if (maxRows === 0) maxRows = 1;

        // Build Rows
        for (let i = 0; i < maxRows; i++) {
            const rowData = [];
            // Col 0: Day
            if (i === 0) rowData.push(day);
            else rowData.push('');

            // Col 1..N: Assignments
            timeSlots.forEach(time => {
                const assignments = slotsMap[time];
                if (assignments && assignments[i]) {
                    const a = assignments[i];
                    const subj = getSubjectShortCode(a.subject);
                    const fac1 = getFacultyShortCode(a.faculty);
                    const fac2 = a.faculty2 ? getFacultyShortCode(a.faculty2) : null;
                    const semStr = a.sem ? a.sem.replace(/Semester/i, '').replace(/Sem/i, '').trim() : '';

                    // Format: DEPT-SEC-GRP-[SUB]-[FAC]-ROOM-SEM
                    // Matches PDF 'pdfLabel' logic exactly
                    const cellText = `${a.dept}-${a.section}${(a.group && a.group !== 'All' && a.group !== a.section) ? `-${a.group}` : ''}-[${subj}]-[${fac1}${fac2 ? `,${fac2}` : ''}]-${a.room}-${semStr} SEM`; // eslint-disable-line sonarjs/no-nested-template-literals

                    rowData.push(cellText);
                } else {
                    rowData.push('');
                }
            });

            const row = ws.addRow(rowData);
            // Dynamic Row Height: Estimate based on max content length per cell
            // Approx 40 chars per line for width 40?
            // Minimal height 30.
            const maxLen = rowData.reduce((max, txt) => Math.max(max, txt ? txt.length : 0), 0);
            const estimatedLines = Math.ceil(maxLen / 35); // Liberal estimate
            row.height = Math.max(25, estimatedLines * 15);

            // Apply Styles
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const isFirstRowOfDay = (i === 0);
                const isLastRowOfDay = (i === maxRows - 1);

                // Default Borders (Thin Internal)
                let borderStyle = {
                    top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, // Light Grey
                    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
                };

                // Day Column Styling
                if (colNumber === 1) {
                    cell.style = dayStyle;
                    // Outer Bold Borders for Day Box
                    borderStyle = {
                        top: { style: isFirstRowOfDay ? 'medium' : 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'medium', color: { argb: 'FF000000' } },
                        bottom: { style: isLastRowOfDay ? 'medium' : 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'medium', color: { argb: 'FF000000' } }
                    };
                } else {
                    // Data Columns
                    cell.style = dataStyle;
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

                    // Override Borders for Day Grouping
                    if (isFirstRowOfDay) borderStyle.top = { style: 'medium', color: { argb: 'FF000000' } };
                    if (isLastRowOfDay) borderStyle.bottom = { style: 'medium', color: { argb: 'FF000000' } };

                    // Right-most column outer border
                    if (colNumber === timeSlots.length + 1) borderStyle.right = { style: 'medium', color: { argb: 'FF000000' } };
                }

                cell.border = borderStyle;
            });
        }

        // Merge Day Column
        if (maxRows > 1) {
            ws.mergeCells(currentRow, 1, currentRow + maxRows - 1, 1);
        }

        currentRow += maxRows;
    });

    // 6. Save
    try {
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Schedule-${activeAcademicYear || 'Export'}.xlsx`);
    } catch (error) {
        console.error("Excel Export Error:", error);
        alert("Failed to export Excel file. Please try again.");
    }
};
