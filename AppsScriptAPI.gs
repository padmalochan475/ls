
/**
 * LAMS 2.0 - Certificate System Backend (Official TAT Bridge)
 * Based on Project Blueprint v18
 * Institution: Trident Academy of Technology (TAT)
 */

const SHEET_FORM = "Form Responses 1";
const SHEET_BRANCHES = "Branch Master";
const SHEET_COMPANIES = "Company Master";
const SHEET_LOG = "Certificate Log";
const SHEET_SETTINGS = "Settings";
const SHEET_AUDIT = "Activity Log";

/**
 * OPTIONAL: Hardcode your Spreadsheet ID here if running as a standalone script.
 */
const SPREADSHEET_ID = "1lOiP0u6NFvYTkT6i6CTABLVe51ArzMkuVf8wh5ilWXo"; 

function _getSS() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * ONE-CLICK SETUP: Run this to create the official TAT structure.
 */
function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Form Responses
  let formSheet = ss.getSheetByName(SHEET_FORM) || ss.insertSheet(SHEET_FORM);
  formSheet.getRange(1, 1, 1, 12).setValues([[
    "Timestamp", "Salutation", "Student Full Name", "Registration Number", 
    "Branch", "Year of Study", "Academic Session", "Certificate Type", 
    "Company", "Duration", "Status", "Ref No"
  ]]);
  formSheet.setFrozenRows(1);

  // 2. Branch Master
  let branchSheet = ss.getSheetByName(SHEET_BRANCHES) || ss.insertSheet(SHEET_BRANCHES);
  branchSheet.getRange(1, 1, 1, 8).setValues([[
    "Branch Code", "Branch Full Name", "HOD Name", "Dept Mail ID", "Contact Number", "Ref Start From", "Current Serial", "Serial Year"
  ]]);
  branchSheet.setFrozenRows(1);

  // 3. Company Master
  let compSheet = ss.getSheetByName(SHEET_COMPANIES) || ss.insertSheet(SHEET_COMPANIES);
  compSheet.getRange(1, 1, 1, 6).setValues([[
    "Company Name", "HR Address", "City", "PIN", "State", "HR Contact"
  ]]);
  compSheet.setFrozenRows(1);

  // 4. Log
  let logSheet = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG);
  logSheet.getRange(1, 1, 1, 11).setValues([[
    "Ref No", "Student Name", "Registration No", "Branch", "Company", 
    "Certificate Type", "Start Date", "Duration", "Generated On", "Academic Year", "Student Contact"
  ]]);
  logSheet.setFrozenRows(1);

  // 5. Settings
  let setSheet = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  setSheet.getRange(1, 1, 1, 2).setValues([["Key", "Value"]]);
  if (setSheet.getLastRow() === 1) {
    setSheet.appendRow(["active_year", _currentAcademicYear()]);
    setSheet.appendRow(["academic_years_list", _currentAcademicYear()]);
    setSheet.appendRow(["allow_internship", "true"]);
    setSheet.appendRow(["allow_apprenticeship", "true"]);
  }
  setSheet.setFrozenRows(1);

  // 6. Audit Log
  let auditSheet = ss.getSheetByName(SHEET_AUDIT) || ss.insertSheet(SHEET_AUDIT);
  auditSheet.getRange(1, 1, 1, 4).setValues([["Timestamp", "User", "Action", "Details"]]);
  auditSheet.setFrozenRows(1);

  return "✅ TAT Enhanced Certificate System Structure Created.";
}

// --- API ROUTER ---
function doPost(e) {
  const result = { success: false, data: null, error: null };
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'getAdminData') {
      result.data = {
        requests: getTableData(SHEET_FORM),
        branches: getTableData(SHEET_BRANCHES),
        companies: getTableData(SHEET_COMPANIES),
        settings: getKeyValueSettings(SHEET_SETTINGS),
        academicYears: getAcademicYears(),
        sheetUrl: _getSS().getUrl()
      };
    } else if (action === 'submitRequest') {
      result.data = submitRequest(payload.data);
    } else if (action === 'updateStatus') {
      result.data = updateStatus(payload.id, payload.status, payload.refNo, payload.certData);
    } else if (action === 'deleteRequest') {
      result.data = deleteRequest(payload.id);
    } else if (action === 'getBranches') {
      result.data = getTableData(SHEET_BRANCHES);
    } else if (action === 'listSheets') {
      result.data = SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName());
    } else if (action === 'getSheetData') {
      result.data = getGenericSheetData(payload.sheetName);
    } else if (action === 'saveGenericRow') {
      result.data = saveGenericRow(payload.sheetName, payload.rowId, payload.data);
    } else if (action === 'deleteGenericRow') {
      result.data = deleteGenericRow(payload.sheetName, payload.rowId);
    } else if (action === 'saveSetting') {
      result.data = saveSetting(payload.key, payload.value);
    } else if (action === 'bulkUpdateStatus') {
      result.data = bulkUpdateStatus(payload.ids, payload.status);
    } else if (action === 'getAuditLogs') {
      result.data = getTableData(SHEET_AUDIT);
    } else if (action === 'runDiagnostics') {
      result.data = runDiagnostics();
    } else {
      throw new Error("Action not recognized: " + action);
    }

    result.success = true;
  } catch (err) {
    result.error = err.toString();
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- CORE FUNCTIONS ---

function getAcademicYears() {
  const years = {};
  
  // 1. Get from Master List in Settings
  const settings = getKeyValueSettings(SHEET_SETTINGS);
  if (settings.academic_years_list) {
    settings.academic_years_list.split(',').forEach(y => { if (y.trim()) years[y.trim()] = true; });
  }

  // 2. Derive from data
  years[_currentAcademicYear()] = true; 
  try {
    const log = getTableData(SHEET_LOG);
    log.forEach(r => { if (r.AcademicYear) years[r.AcademicYear] = true; });
  } catch(e) {}

  try {
    const students = getTableData(SHEET_FORM);
    students.forEach(s => {
      if (s.Timestamp) {
        const d = new Date(s.Timestamp);
        if (!isNaN(d)) years[_deriveAcYear(d)] = true;
      }
    });
  } catch(e) {}

  return Object.keys(years).sort().reverse();
}

function saveSetting(key, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return true;
    }
  }
  sheet.appendRow([key, value]);
  return true;
}

function submitRequest(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10s timeout
    
    const ss = _getSS();
    const sheet = ss.getSheetByName(SHEET_FORM);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // CONFLICT DETECTION: Check for duplicates in current Year
    const currentData = getTableData(SHEET_FORM);
    const academicYear = _currentAcademicYear();
    const isDuplicate = currentData.some(r => 
      r.RegistrationNumber == data.regNo && 
      r.CertificateType == data.type && 
      r.Status?.toLowerCase() !== 'rejected' &&
      _deriveAcYear(new Date(r.Timestamp)) === academicYear
    );

    if (isDuplicate) {
      throw new Error("CONFLICT: You have already submitted a request for this certificate type in this academic year.");
    }

    const map = {
      'studentName': 'Student Full Name',
      'regNo':       'Registration Number',
      'branch':      'Branch',
      'year':        'Year of Study',
      'type':        'Certificate Type',
      'company':     'Company',
      'department':  'Department',
      'duration':    'Duration',
      'startDate':   'Proposed Start Date',
      'salutation':  'Salutation',
      'session':     'Academic Session'
    };

    const rowData = { 'Timestamp': new Date(), 'Status': 'Pending' };
    Object.keys(data).forEach(key => { rowData[map[key] || key] = data[key]; });

    const row = headers.map(h => rowData[h] !== undefined ? rowData[h] : "");
    sheet.appendRow(row);
    return sheet.getLastRow();
  } finally {
    lock.releaseLock();
  }
}

function updateStatus(rowId, status, manualRefNo, certData, lastKnownTimestamp) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = _getSS();
    const sheet = ss.getSheetByName(SHEET_FORM);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const statusIdx = headers.indexOf('Status');
    const refIdx = headers.indexOf('Ref No');
    const tsIdx = headers.indexOf('Timestamp');

    // VERSION CHECK
    if (lastKnownTimestamp) {
      const currentTs = sheet.getRange(rowId, tsIdx + 1).getValue();
      const formattedCurrent = String(new Date(currentTs).getTime());
      if (formattedCurrent !== String(lastKnownTimestamp)) {
        throw new Error("CONFLICT: This record has been updated by another user. Please refresh.");
      }
    }
    
    let finalRefNo = manualRefNo;
    const branchName = sheet.getRange(rowId, headers.indexOf('Branch') + 1).getValue();

    if (status === 'approved' && !finalRefNo) {
      finalRefNo = _getNextRefNo(branchName);
    }

    sheet.getRange(rowId, statusIdx + 1).setValue(status);
    if (finalRefNo && refIdx !== -1) {
      sheet.getRange(rowId, refIdx + 1).setValue(finalRefNo);
    }

    // Reconstruct certData if missing (important for Bulk operations)
    if (status === 'approved' && !certData) {
      const rowDataValues = sheet.getRange(rowId, 1, 1, headers.length).getValues()[0];
      certData = {};
      headers.forEach((h, i) => {
        const key = h.replace(/\s+/g, '');
        certData[key] = rowDataValues[i];
      });
      // Normalize keys for the logMap
      certData.studentName = certData.StudentFullName;
      certData.regNo = certData.RegistrationNumber;
      certData.branch = certData.Branch;
      certData.type = certData.CertificateType;
      certData.company = certData.Company;
    }

    if (status === 'approved' && finalRefNo && certData) {
      const logSheet = ss.getSheetByName(SHEET_LOG);
      const logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
      
      // DEEP RECHECK: Lookup Branch HOD & Company Details
      const branches = getTableData(SHEET_BRANCHES);
      const branchInfo = branches.find(b => b.BranchFullName === branchName || b.BranchCode === branchName) || {};

      const companies = getTableData(SHEET_COMPANIES);
      const companyInfo = companies.find(c => c.CompanyName === certData.company) || {};

      certData.refNo = finalRefNo;
      certData.generatedOn = Utilities.formatDate(new Date(), "GMT+5:30", "dd-MM-yyyy");
      certData.academicYear = _currentAcademicYear();
      
      // Inject Metadata for PDF
      certData.hodName = branchInfo.HODName || "";
      certData.hrAddress = companyInfo.HRAddress || "";
      certData.city = companyInfo.City || "";
      certData.state = companyInfo.State || "";
      certData.pin = companyInfo.PIN || "";

      const logMap = {
        'refNo': 'Ref No', 'studentName': 'Student Name', 'regNo': 'Registration No',
        'branch': 'Branch', 'company': 'Company', 'type': 'Certificate Type',
        'startDate': 'Start Date', 'duration': 'Duration', 'generatedOn': 'Generated On',
        'academicYear': 'Academic Year', 'hodName': 'HOD Name'
      };

      const logRow = logHeaders.map(h => {
        const key = Object.keys(logMap).find(k => logMap[k] === h);
        return certData[key] || "";
      });
      logSheet.appendRow(logRow);
    }

    _logActivity("Update Status", `${status.toUpperCase()} row ${rowId}: Ref ${finalRefNo || 'N/A'}`);
    return { status, refNo: finalRefNo, meta: certData };
  } finally {
    lock.releaseLock();
  }
}

function bulkUpdateStatus(ids, status) {
  const results = ids.map(id => {
    try {
      return updateStatus(id, status);
    } catch (e) {
      return { id, error: e.message };
    }
  });
  _logActivity("Bulk Status Update", `Processed ${ids.length} records to ${status}`);
  return results;
}

function runDiagnostics() {
  const ss = _getSS();
  const report = [];
  [SHEET_FORM, SHEET_BRANCHES, SHEET_COMPANIES, SHEET_LOG, SHEET_SETTINGS, SHEET_AUDIT].forEach(name => {
    const s = ss.getSheetByName(name);
    report.push({ sheet: name, exists: !!s, rows: s ? s.getLastRow() : 0 });
  });
  _logActivity("System Diagnostics", "Admin ran diagnostic report");
  return report;
}

function _logActivity(action, details) {
  try {
    const ss = _getSS();
    const sheet = ss.getSheetByName(SHEET_AUDIT);
    sheet.appendRow([new Date(), Session.getActiveUser().getEmail() || "System", action, details]);
  } catch(e) {}
}

function _getNextRefNo(branchName) {
  const ss = _getSS();
  const sheet = ss.getSheetByName(SHEET_BRANCHES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const academicYear = _currentAcademicYear(); // "2025-26"
  
  const bCodeIdx = headers.indexOf("Branch Code");
  const bFullNameIdx = headers.indexOf("Branch Full Name");
  const startIdx = headers.indexOf("Ref Start From");
  const currentIdx = headers.indexOf("Current Serial");
  const yearIdx = headers.indexOf("Serial Year"); // This now tracks Academic Year string

  for (let i = 1; i < data.length; i++) {
    const isMatch = (data[i][bFullNameIdx] === branchName || data[i][bCodeIdx] === branchName);
    if (isMatch) {
      let serial = parseInt(data[i][currentIdx]) || 0;
      let serialAcYear = data[i][yearIdx]; // e.g. "2024-25"
      let startFrom = parseInt(data[i][startIdx]) || 1;

      // DYNAMIC LOGIC: Reset serial if the Academic Year has shifted
      if (serialAcYear !== academicYear) {
        serial = startFrom - 1; 
        sheet.getRange(i + 1, yearIdx + 1).setValue(academicYear);
      }

      serial++;
      sheet.getRange(i + 1, currentIdx + 1).setValue(serial);
      
      const code = data[i][bCodeIdx] || branchName.substring(0, 3).toUpperCase();
      // Format: TAT/CSE/101/2025-26
      return `TAT/${code}/${serial}/${academicYear}`;
    }
  }
  
  return `TAT/GEN/${Math.floor(Math.random() * 9000 + 1000)}/${academicYear}`;
}

function deleteRequest(rowId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = _getSS();
    ss.getSheetByName(SHEET_FORM).deleteRow(rowId);
    _logActivity("Delete Request", `Deleted row ${rowId} from Form`);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// --- UTILS ---

function getTableData(name) {
  const ss = _getSS();
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, j) => {
      const key = h.replace(/\s+/g, '');
      obj[key] = row[j];
    });
    return obj;
  });
}

function getKeyValueSettings(name) {
  const data = getTableData(name);
  const settings = {};
  data.forEach(row => { if (row.Key) settings[row.Key] = row.Value; });
  return settings;
}

function _currentAcademicYear() {
  return _deriveAcYear(new Date());
}

function _deriveAcYear(date) {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  return (m >= 7) ? (y + '-' + String(y + 1).slice(-2)) : ((y - 1) + '-' + String(y).slice(-2));
}

// --- GENERIC CRUD ENGINE ---

function getGenericSheetData(sheetName) {
  const ss = _getSS();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Database sheet '" + sheetName + "' not found. Run diagnostics.");
  
  const data = sheet.getDataRange().getValues();
  if (data.length === 0 || (data.length === 1 && data[0][0] === "")) {
    throw new Error("Sheet '" + sheetName + "' is empty. Please add a header row.");
  }
  
  const headers = data[0].filter(h => h && h.toString().trim() !== "");
  if (headers.length === 0) throw new Error("No valid headers found in " + sheetName);

  const rows = data.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, j) => {
      obj[h || `Col_${j}`] = row[j];
    });
    return obj;
  });
  
  return { headers, rows };
}

function saveGenericRow(sheetName, rowId, data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = _getSS();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);

    const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    const rowValues = headers.map(h => (data[h] !== undefined && data[h] !== null) ? data[h] : "");
    
    if (rowId) {
      if (rowId < 2 || rowId > sheet.getLastRow()) throw new Error("CONFLICT: Record no longer exists.");
      sheet.getRange(rowId, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

function deleteGenericRow(sheetName, rowId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = _getSS();
    const sheet = ss.getSheetByName(sheetName);
    if (sheet && rowId >= 2 && rowId <= sheet.getLastRow()) {
      sheet.deleteRow(rowId);
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}
