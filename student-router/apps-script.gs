// Google Apps Script Backend for Student Router
// Deploy as Web App with anonymous access

// Configuration
const SHEET_NAME = 'StudentRoster';
const BEARER_TOKEN = ''; // Optional: Add a token for basic security
const ALLOWED_IDS = []; // Optional: Add whitelist of student IDs

// Sheet columns
const COLS = {
  TIMESTAMP: 0,
  ID: 1,
  NAME: 2,
  EMAIL: 3,
  AVAILABILITY_JSON: 4,
  CLASS: 5,
  REC_A: 6,
  REC_B: 7,
  TA: 8,
  LOCKED: 9,
  NOTES: 10
};

// Schedule configuration (should match schedule.json)
const SCHEDULE = {
  capacities: {
    class: { sparta: 40, athens: 40 },
    recitations: { corinth: 40, argos: 40, thebes: 40, crete: 40 },
    ta: { woods: 16, johnnie: 16, siddhu: 16, mariam: 16, jack: 16 }
  },
  recitations: {
    corinth: { day: 'A' },
    argos: { day: 'A' },
    thebes: { day: 'B' },
    crete: { day: 'B' }
  }
};

function doGet(e) {
  const action = e.parameter.action;
  
  try {
    let result;
    
    switch(action) {
      case 'counts':
        result = getCounts();
        break;
      case 'roster':
        result = getRoster();
        break;
      default:
        result = { error: 'Invalid action' };
    }
    
    return createResponse(result);
  } catch (error) {
    return createResponse({ error: error.toString() });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Optional bearer token check
    if (BEARER_TOKEN && e.parameter.token !== BEARER_TOKEN) {
      return createResponse({ ok: false, message: 'Unauthorized' });
    }
    
    // Optional ID whitelist check
    if (ALLOWED_IDS.length > 0 && !ALLOWED_IDS.includes(data.id)) {
      return createResponse({ ok: false, message: 'ID not in whitelist' });
    }
    
    if (e.parameter.action === 'assign') {
      const result = assignStudent(data);
      return createResponse(result);
    }
    
    return createResponse({ ok: false, message: 'Invalid action' });
  } catch (error) {
    return createResponse({ ok: false, message: error.toString() });
  }
}

function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*');
}

function assignStudent(data) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000); // Wait up to 10 seconds
    
    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();
    
    // Find existing student
    let existingRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][COLS.ID] === data.id) {
        existingRowIndex = i;
        break;
      }
    }
    
    // Get current counts
    const counts = calculateCounts(rows);
    
    // Check if existing assignment is still valid
    let assignment;
    if (existingRowIndex !== -1) {
      const existingRow = rows[existingRowIndex];
      
      // Skip if locked
      if (existingRow[COLS.LOCKED] === true || existingRow[COLS.LOCKED] === 'TRUE') {
        return {
          ok: true,
          assignment: {
            class: existingRow[COLS.CLASS],
            rec_a: existingRow[COLS.REC_A],
            rec_b: existingRow[COLS.REC_B],
            ta: existingRow[COLS.TA]
          },
          message: 'Assignment locked'
        };
      }
      
      // Check stability
      const currentAssignment = {
        class: existingRow[COLS.CLASS],
        rec_a: existingRow[COLS.REC_A],
        rec_b: existingRow[COLS.REC_B],
        ta: existingRow[COLS.TA]
      };
      
      if (isAssignmentValid(currentAssignment, data.availability, counts)) {
        assignment = currentAssignment;
      } else {
        // Adjust counts to exclude current student
        if (currentAssignment.class) counts.class[currentAssignment.class]--;
        if (currentAssignment.rec_a) counts.recitations[currentAssignment.rec_a]--;
        if (currentAssignment.rec_b) counts.recitations[currentAssignment.rec_b]--;
        if (currentAssignment.ta) counts.ta[currentAssignment.ta]--;
        
        assignment = computeAssignment(data.id, data.availability, counts);
      }
    } else {
      assignment = computeAssignment(data.id, data.availability, counts);
    }
    
    if (!assignment.ok) {
      return assignment;
    }
    
    // Save to sheet
    const rowData = [
      new Date().toISOString(),
      data.id,
      data.name,
      data.email,
      JSON.stringify(data.availability),
      assignment.class,
      assignment.rec_a,
      assignment.rec_b,
      assignment.ta,
      false,
      ''
    ];
    
    if (existingRowIndex !== -1) {
      // Update existing row
      sheet.getRange(existingRowIndex + 1, 1, 1, rowData.length).setValues([rowData]);
    } else {
      // Add new row
      sheet.appendRow(rowData);
    }
    
    return {
      ok: true,
      assignment: {
        class: assignment.class,
        rec_a: assignment.rec_a,
        rec_b: assignment.rec_b,
        ta: assignment.ta
      },
      created: existingRowIndex === -1
    };
    
  } catch (error) {
    return { ok: false, message: 'Lock timeout or error: ' + error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function computeAssignment(studentId, availability, counts) {
  // Stable hash for tiebreaking
  const hash = getStableHash(studentId);
  
  // Assign class
  const classChoice = selectMinFill(
    availability.class,
    counts.class,
    SCHEDULE.capacities.class,
    hash
  );
  
  if (!classChoice) {
    return { ok: false, reason: 'no_feasible', details: { where: 'class' } };
  }
  
  // Assign Day A recitation
  const dayAOptions = availability.recitations.filter(r => SCHEDULE.recitations[r]?.day === 'A');
  const recAChoice = selectMinFill(
    dayAOptions,
    counts.recitations,
    SCHEDULE.capacities.recitations,
    hash
  );
  
  if (!recAChoice) {
    return { ok: false, reason: 'no_feasible', details: { where: 'recitation_day_a' } };
  }
  
  // Assign Day B recitation
  const dayBOptions = availability.recitations.filter(r => SCHEDULE.recitations[r]?.day === 'B');
  const recBChoice = selectMinFill(
    dayBOptions,
    counts.recitations,
    SCHEDULE.capacities.recitations,
    hash
  );
  
  if (!recBChoice) {
    return { ok: false, reason: 'no_feasible', details: { where: 'recitation_day_b' } };
  }
  
  // Assign TA section
  const taChoice = selectMinFill(
    availability.ta,
    counts.ta,
    SCHEDULE.capacities.ta,
    hash
  );
  
  if (!taChoice) {
    return { ok: false, reason: 'no_feasible', details: { where: 'ta' } };
  }
  
  return {
    ok: true,
    class: classChoice,
    rec_a: recAChoice,
    rec_b: recBChoice,
    ta: taChoice
  };
}

function selectMinFill(options, counts, capacities, hash) {
  if (!options || options.length === 0) return null;
  
  let bestOption = null;
  let bestRatio = Infinity;
  let bestHash = Infinity;
  
  for (const option of options) {
    const count = counts[option] || 0;
    const capacity = capacities[option];
    const ratio = count / capacity;
    
    // Allow soft overflow of 1
    if (count >= capacity + 1) continue;
    
    if (ratio < bestRatio || (ratio === bestRatio && hash % 997 < bestHash)) {
      bestOption = option;
      bestRatio = ratio;
      bestHash = hash % 997;
    }
  }
  
  return bestOption;
}

function isAssignmentValid(assignment, availability, counts) {
  // Check if assignment matches availability
  if (!availability.class.includes(assignment.class)) return false;
  if (!availability.recitations.includes(assignment.rec_a)) return false;
  if (!availability.recitations.includes(assignment.rec_b)) return false;
  if (!availability.ta.includes(assignment.ta)) return false;
  
  // Check capacities (allow soft overflow of 1)
  if ((counts.class[assignment.class] || 0) > SCHEDULE.capacities.class[assignment.class] + 1) return false;
  if ((counts.recitations[assignment.rec_a] || 0) > SCHEDULE.capacities.recitations[assignment.rec_a] + 1) return false;
  if ((counts.recitations[assignment.rec_b] || 0) > SCHEDULE.capacities.recitations[assignment.rec_b] + 1) return false;
  if ((counts.ta[assignment.ta] || 0) > SCHEDULE.capacities.ta[assignment.ta] + 1) return false;
  
  return true;
}

function getStableHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function calculateCounts(rows) {
  const counts = {
    class: {},
    recitations: {},
    ta: {}
  };
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[COLS.CLASS]) counts.class[row[COLS.CLASS]] = (counts.class[row[COLS.CLASS]] || 0) + 1;
    if (row[COLS.REC_A]) counts.recitations[row[COLS.REC_A]] = (counts.recitations[row[COLS.REC_A]] || 0) + 1;
    if (row[COLS.REC_B]) counts.recitations[row[COLS.REC_B]] = (counts.recitations[row[COLS.REC_B]] || 0) + 1;
    if (row[COLS.TA]) counts.ta[row[COLS.TA]] = (counts.ta[row[COLS.TA]] || 0) + 1;
  }
  
  return counts;
}

function getCounts() {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  return calculateCounts(rows);
}

function getRoster() {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  
  const roster = [];
  for (let i = 1; i < rows.length; i++) {
    roster.push({
      timestamp: rows[i][COLS.TIMESTAMP],
      id: rows[i][COLS.ID],
      name: rows[i][COLS.NAME],
      email: rows[i][COLS.EMAIL],
      class: rows[i][COLS.CLASS],
      rec_a: rows[i][COLS.REC_A],
      rec_b: rows[i][COLS.REC_B],
      ta: rows[i][COLS.TA],
      locked: rows[i][COLS.LOCKED],
      notes: rows[i][COLS.NOTES]
    });
  }
  
  return roster;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    
    // Add headers
    const headers = [
      'Timestamp',
      'ID',
      'Name',
      'Email',
      'Availability JSON',
      'Class',
      'Rec A',
      'Rec B',
      'TA',
      'Locked',
      'Notes'
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    
    // Format columns
    sheet.setColumnWidth(1, 150); // Timestamp
    sheet.setColumnWidth(2, 100); // ID
    sheet.setColumnWidth(3, 150); // Name
    sheet.setColumnWidth(4, 200); // Email
    sheet.setColumnWidth(5, 300); // Availability JSON
    sheet.setColumnWidth(10, 60); // Locked
    sheet.setColumnWidth(11, 200); // Notes
  }
  
  return sheet;
}