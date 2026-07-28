const LABELS = Object.freeze({
  department: '\uBD80\uC11C\uBA85',
  name: '\uC774\uB984',
  employeeId: '\uC0AC\uBC88',
  status: '\uC7AC\uC9C1\uC0C1\uD0DC',
  employed: '\uC7AC\uC9C1',
  clockIn: '\uCD9C\uADFC',
  clockOut: '\uD1F4\uADFC',
  early: '\uC870\uCD9C',
  overtime: '\uC794\uC5C5',
  ot: 'OT',
  leaveUsed: '\uC0AC\uC6A9\uC5F0\uCC28',
  passwordHash: '\uBE44\uBC00\uBC88\uD638',
  passwordChangeRequired: '\uBE44\uBC00\uBC88\uD638\uBCC0\uACBD\uD544\uC694',
  passwordResetAt: '\uBE44\uBC00\uBC88\uD638\uCD08\uAE30\uD654\uC77C\uC2DC'
});

const LOG_EVENTS = Object.freeze({
  clockIn: LABELS.clockIn,
  clockOut: LABELS.clockOut,
  duplicateClockIn: '\uCD9C\uADFC \uC911\uBCF5 \uB4F1\uB85D \uC2DC\uB3C4',
  duplicateClockOut: '\uD1F4\uADFC \uC911\uBCF5 \uB4F1\uB85D \uC2DC\uB3C4',
  unknownEmployeeLogin: '\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uC0AC\uBC88 \uB85C\uADF8\uC778 \uC2DC\uB3C4',
  systemError: '\uC2DC\uC2A4\uD15C \uC624\uB958'
});

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.webTitle)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function login(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();

  if (!employeeId) {
    throw new Error('ì‚¬ë²ˆì„ ìž…ë ¥í•´ ì£¼ì„¸ìš”.');
  }

  let ss = null;
  let employee = null;

  try {
    ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
    employee = findEmployeeById(ss, employeeId);

    if (!employee) {
      throw createOperationalError('ë“±ë¡ëœ ì‚¬ë²ˆì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.', LOG_EVENTS.unknownEmployeeLogin);
    }

    if (employee.status !== LABELS.employed) {
      throw createOperationalError('ìž¬ì§ ìƒíƒœì¸ ì§ì›ë§Œ ë¡œê·¸ì¸í•  ìˆ˜ ìžˆìŠµë‹ˆë‹¤.', '', true);
    }

    const role = employee.employeeId === CONFIG.adminEmployeeId ? 'admin' : 'employee';

    return {
      ok: true,
      role,
      user: employee,
      mustChangePassword: false,
      employee: buildEmployeeDashboard(ss, employee),
      admin: null
    };
  } catch (error) {
    if (ss && !error.skipOperationalLog) {
      appendOperationalFailure(ss, {
        eventType: error.logEventType || LOG_EVENTS.systemError,
        employeeId,
        employee,
        device: 'LogiFlow login',
        error
      });
    }
    throw error;
  }
}

function changePassword(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();
  const currentPassword = String(input.currentPassword || '').trim();
  const newPassword = String(input.newPassword || '').trim();

  if (!employeeId || !currentPassword || !newPassword) {
    throw new Error('í˜„ìž¬ ë¹„ë°€ë²ˆí˜¸ì™€ ìƒˆ ë¹„ë°€ë²ˆí˜¸ë¥¼ ëª¨ë‘ ìž…ë ¥í•´ ì£¼ì„¸ìš”.');
  }

  if (newPassword.length < 4) {
    throw new Error('ìƒˆ ë¹„ë°€ë²ˆí˜¸ëŠ” 4ìžë¦¬ ì´ìƒìœ¼ë¡œ ìž…ë ¥í•´ ì£¼ì„¸ìš”.');
  }

  if (!isValidNewPassword(newPassword)) {
    throw new Error('ìƒˆ ë¹„ë°€ë²ˆí˜¸ëŠ” ì˜ë¬¸ê³¼ ìˆ«ìžë¥¼ ëª¨ë‘ í¬í•¨í•´ ì£¼ì„¸ìš”.');
  }

  if (newPassword === currentPassword) {
    throw new Error('ìƒˆ ë¹„ë°€ë²ˆí˜¸ëŠ” í˜„ìž¬ ë¹„ë°€ë²ˆí˜¸ì™€ ë‹¤ë¥´ê²Œ ìž…ë ¥í•´ ì£¼ì„¸ìš”.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = getRosterSheet(ss);
  const indexes = getRosterIndexes(sheet, true);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('ë“±ë¡ëœ ì‚¬ë²ˆì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.');
  }

  if (!verifyEmployeePassword(employee, currentPassword).ok) {
    throw new Error('í˜„ìž¬ ë¹„ë°€ë²ˆí˜¸ê°€ ì¼ì¹˜í•˜ì§€ ì•ŠìŠµë‹ˆë‹¤.');
  }

  sheet.getRange(employee.row, indexes.passwordHash + 1).setValue(hashPassword(employeeId, newPassword));
  sheet.getRange(employee.row, indexes.passwordChangeRequired + 1).setValue('N');
  SpreadsheetApp.flush();

  const updatedEmployee = findEmployeeById(ss, employeeId);
  const role = employeeId === CONFIG.adminEmployeeId ? 'admin' : 'employee';

  return {
    ok: true,
    role,
    user: updatedEmployee,
    employee: getEmployeeDashboard(employeeId),
    admin: role === 'admin' ? getAdminDashboard({}) : null
  };
}

function requestPasswordReset(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();

  if (!employeeId) {
    throw new Error('ì´ˆê¸°í™”ë¥¼ ìš”ì²­í•  ì‚¬ë²ˆì„ ìž…ë ¥í•´ ì£¼ì„¸ìš”.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('ë“±ë¡ëœ ì‚¬ë²ˆì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.');
  }

  const sheet = ensurePasswordResetSheet(ss);
  sheet.appendRow([
    formatDateTime(new Date()),
    employee.employeeId,
    employee.name,
    employee.department,
    'ëŒ€ê¸°',
    '',
    ''
  ]);

  return {
    ok: true,
    message: 'ê´€ë¦¬ìžì—ê²Œ ë¹„ë°€ë²ˆí˜¸ ì´ˆê¸°í™” ìš”ì²­ì„ ë³´ëƒˆìŠµë‹ˆë‹¤.'
  };
}

function resetEmployeePassword(request) {
  const input = request || {};
  const adminEmployeeId = String(input.adminEmployeeId || '').trim();
  const targetEmployeeId = String(input.employeeId || '').trim();

  if (adminEmployeeId !== CONFIG.adminEmployeeId) {
    throw new Error('ê´€ë¦¬ìž ê³„ì •ì—ì„œë§Œ ì´ˆê¸°í™”í•  ìˆ˜ ìžˆìŠµë‹ˆë‹¤.');
  }

  if (!targetEmployeeId) {
    throw new Error('ì´ˆê¸°í™”í•  ì‚¬ë²ˆì„ í™•ì¸í•´ ì£¼ì„¸ìš”.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = getRosterSheet(ss);
  const indexes = getRosterIndexes(sheet, true);
  const employee = findEmployeeById(ss, targetEmployeeId);

  if (!employee) {
    throw new Error('ë“±ë¡ëœ ì‚¬ë²ˆì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.');
  }

  sheet.getRange(employee.row, indexes.passwordHash + 1).setValue(hashPassword(targetEmployeeId, targetEmployeeId));
  sheet.getRange(employee.row, indexes.passwordChangeRequired + 1).setValue('Y');
  sheet.getRange(employee.row, indexes.passwordResetAt + 1).setValue(formatDateTime(new Date()));
  closePasswordResetRequests(ss, targetEmployeeId, adminEmployeeId);
  SpreadsheetApp.flush();

  return {
    ok: true,
    employeeId: targetEmployeeId,
    name: employee.name
  };
}

function registerAttendance(request) {
  let input = null;
  let ss = null;
  let employee = null;

  try {
    input = normalizeAttendanceRequest(request);
    ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
    employee = findEmployeeById(ss, input.employeeId);

    if (!employee) {
      throw createOperationalError('ë“±ë¡ëœ ì‚¬ë²ˆì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.', '', true);
    }

    if (employee.status !== LABELS.employed) {
      throw createOperationalError('ìž¬ì§ ìƒíƒœì¸ ì§ì›ë§Œ ì¶œí‡´ê·¼ ë“±ë¡ì´ ê°€ëŠ¥í•©ë‹ˆë‹¤.', '', true);
    }

    const attendanceSheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
    let employeeBlock = findEmployeeBlockOrNull(attendanceSheet, employee.name);

    if (!employeeBlock) {
      syncRosterToAttendanceSheetInSpreadsheet(ss);
      employeeBlock = findEmployeeBlock(attendanceSheet, employee.name);
    }

    const savedAt = new Date(input.actualAt);
    const attendanceTarget = resolveAttendanceTarget_(attendanceSheet, employeeBlock, input.type, savedAt);
    const workDate = attendanceTarget.workDate;
    const targetRow = attendanceTarget.row;
    const targetColumn = input.type === 'clockIn'
      ? employeeBlock.clockInColumn
      : employeeBlock.clockOutColumn;
    const targetCell = attendanceSheet.getRange(targetRow, targetColumn);

    if (targetCell.getDisplayValue()) {
      throw createOperationalError(
        input.type === 'clockIn'
          ? 'í•´ë‹¹ ì¼ìžëŠ” ì´ë¯¸ ì¶œê·¼ ë“±ë¡ì´ ì™„ë£Œë˜ì—ˆìŠµë‹ˆë‹¤.'
          : 'í•´ë‹¹ ì¼ìžëŠ” ì´ë¯¸ í‡´ê·¼ ë“±ë¡ì´ ì™„ë£Œë˜ì—ˆìŠµë‹ˆë‹¤.',
        input.type === 'clockIn' ? LOG_EVENTS.duplicateClockIn : LOG_EVENTS.duplicateClockOut
      );
    }

    targetCell
      .setValue(timeToAttendanceSheetSerial(savedAt, workDate))
      .setNumberFormat('h:mm');

    appendAttendanceLog(ss, {
      dateText: formatDate(workDate),
      employeeId: employee.employeeId,
      name: employee.name,
      type: input.type === 'clockIn' ? LOG_EVENTS.clockIn : LOG_EVENTS.clockOut,
      savedTime: formatTime(savedAt),
      actualTime: formatTime(input.actualAt),
      device: input.device || 'LogiFlow PWA',
      registeredAt: new Date(),
      updatedAt: '',
      updatedBy: ''
    });

    SpreadsheetApp.flush();

    return {
      ok: true,
      sheetName: CONFIG.attendanceSheetName,
      row: targetRow,
      column: targetColumn,
      cell: columnToLetter(targetColumn) + targetRow,
      employeeId: employee.employeeId,
      name: employee.name,
      type: input.type,
      date: formatDate(workDate),
      savedTime: formatTime(savedAt),
      actualTime: formatTime(input.actualAt)
    };
  } catch (error) {
    if (ss && !error.skipOperationalLog) {
      appendOperationalFailure(ss, {
        eventType: error.logEventType || LOG_EVENTS.systemError,
        employeeId: input ? input.employeeId : '',
        employee,
        input,
        error
      });
    }
    throw error;
  }
}

function syncRosterToAttendanceSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  return syncRosterToAttendanceSheetInSpreadsheet(ss);
}

function syncRosterToAttendanceSheetInSpreadsheet(ss) {
  const attendanceSheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  const employees = readRosterEmployees(ss)
    .filter(function (employee) {
      return employee.employeeId && employee.name && employee.status === LABELS.employed;
    });
  const existingNames = getExistingEmployeeNames(attendanceSheet);
  const added = [];

  employees.forEach(function (employee) {
    if (!existingNames.has(employee.name)) {
      const block = addEmployeeBlock(attendanceSheet, employee);
      added.push({
        employeeId: employee.employeeId,
        name: employee.name,
        startColumn: block.startColumn,
        range: columnToLetter(block.startColumn) + ':' + columnToLetter(block.startColumn + 5)
      });
      existingNames.add(employee.name);
    }
  });

  SpreadsheetApp.flush();

  return {
    ok: true,
    added,
    addedCount: added.length,
    employeeCount: employees.length,
    sheetName: CONFIG.attendanceSheetName
  };
}

function getEmployeeDashboard(employeeId) {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('ë“±ë¡ëœ ì‚¬ë²ˆì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.');
  }

  return buildEmployeeDashboard(ss, employee);
}

function buildEmployeeDashboard(ss, employee) {
  const sheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  let block = findEmployeeBlockOrNull(sheet, employee.name);

  if (!block) {
    syncRosterToAttendanceSheetInSpreadsheet(ss);
    block = findEmployeeBlock(sheet, employee.name);
  }

  const now = new Date();
  const year = Number(Utilities.formatDate(now, CONFIG.timezone, 'yyyy'));
  const month = Number(Utilities.formatDate(now, CONFIG.timezone, 'M'));
  const todayText = formatDate(now);
  const attendanceRows = readAttendanceRows(sheet, block);
  const holidayMap = readHolidayMap_(ss);
  const labeledAttendanceRows = addHolidayLabelsToRows_(attendanceRows, holidayMap);
  const rows = filterAttendanceRowsByMonth(labeledAttendanceRows, year, month);
  const today = rows.filter(function (row) {
    return row.date === todayText;
  })[0] || emptyAttendanceRow(todayText);
  const summary = summarizeAttendanceRows(rows);
  const attendanceRowsByEmployee = {};
  attendanceRowsByEmployee[employee.employeeId] = labeledAttendanceRows;
  const pendingLeaveDates = new Set(readPendingAttendanceRequests_(ss, attendanceRowsByEmployee)
    .filter(function (request) { return request.kind === 'leave'; })
    .map(function (request) { return request.targetDate; }));
  return {
    employee,
    today,
    rows,
    summary,
    statistics: buildAttendanceStatistics(labeledAttendanceRows, rows, now),
    holidays: holidayMap,
    leaveCandidates: buildLeaveCandidates_(labeledAttendanceRows, holidayMap, now).filter(function (candidate) {
      return !pendingLeaveDates.has(candidate.date);
    }),
    operationalSettings: readOperationalSettings_(),
    generatedAt: formatDateTime(new Date())
  };
}

function getMonthlyAttendance(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();
  const year = Number(input.year);
  const month = Number(input.month);

  if (!employeeId || !year || !month) {
    throw new Error('ì¡°íšŒí•  ì‚¬ë²ˆê³¼ ì›”ì„ í™•ì¸í•´ ì£¼ì„¸ìš”.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('ë“±ë¡ëœ ì‚¬ë²ˆì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.');
  }

  const sheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  const block = findEmployeeBlock(sheet, employee.name);
  const attendanceRows = readAttendanceRows(sheet, block);
  const holidayMap = readHolidayMap_(ss);
  const labeledAttendanceRows = addHolidayLabelsToRows_(attendanceRows, holidayMap);
  const rows = filterAttendanceRowsByMonth(labeledAttendanceRows, year, month);

  return {
    ok: true,
    employee,
    year,
    month,
    rows,
    summary: summarizeAttendanceRows(rows),
    statistics: buildAttendanceStatistics(labeledAttendanceRows, rows, new Date()),
    holidays: holidayMap
  };
}

function getAttendanceByRange(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();
  const startDate = parseIsoDateText(input.startDate);
  const endDate = parseIsoDateText(input.endDate);

  if (!employeeId || !startDate || !endDate) {
    throw new Error('ì¡°íšŒí•  ì‚¬ë²ˆê³¼ ê¸°ê°„ì„ í™•ì¸í•´ ì£¼ì„¸ìš”.');
  }

  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('ì‹œìž‘ì¼ì€ ì¢…ë£Œì¼ë³´ë‹¤ ëŠ¦ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('ë“±ë¡ëœ ì‚¬ë²ˆì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.');
  }

  const sheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  const block = findEmployeeBlock(sheet, employee.name);
  const attendanceRows = readAttendanceRows(sheet, block);
  const holidayMap = readHolidayMap_(ss);
  const labeledAttendanceRows = addHolidayLabelsToRows_(attendanceRows, holidayMap);
  const rows = filterAttendanceRowsByRange(labeledAttendanceRows, startDate, endDate);

  return {
    ok: true,
    employee,
    startDate: formatIsoDate(startDate),
    endDate: formatIsoDate(endDate),
    rows,
    summary: summarizeAttendanceRows(rows),
    statistics: buildAttendanceStatistics(labeledAttendanceRows, rows, endDate),
    holidays: holidayMap
  };
}

function getAdminDashboard(request) {
  const input = request || {};
  const filterãx¶‰žËkºwµç@ôÍ¡••Ð¹•ÑI…¹” È°€Ä°±…ÍÑI½Ü€´€Ä°€Ü¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¤ì(€½¹ÍÐÉ•ÅÕ•ÍÑÌ€ômtì((€Ù…±Õ•Ì¹™½É… ¡™Õ¹Ñ¥½¸€¡É½Ü°¥¹‘•à¤ì(€€€¥˜€¡MÑÉ¥¹œ¡É½ÝlÑtñð€œœ¤¹ÑÉ¥´ ¤€„ôô€Ÿ®2ªâÀœ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô((€€€É•ÅÕ•ÍÑÌ¹ÁÕÍ ¡ì(€€€€€É½Üè¥¹‘•à€¬€È°(€€€€€É•ÅÕ•ÍÑ•‘ÐèÉ½ÝlÁt°(€€€€€•µÁ±½å••%èÉ½ÝlÅt°(€€€€€¹…µ”èÉ½ÝlÉt°(€€€€€‘•Á…ÉÑµ•¹ÐèÉ½ÝlÍt°(€€€€€ÍÑ…ÑÕÌèÉ½ÝlÑt(€€€ô¤ì(€ô¤ì((€É•ÑÕÉ¸É•ÅÕ•ÍÑÌì)ô()™Õ¹Ñ¥½¸±½Í•A…ÍÍÝ½É‘I•Í•ÑI•ÅÕ•ÍÑÌ¡ÍÌ°•µÁ±½å••%°…‘µ¥¹µÁ±½å••%¤ì(€½¹ÍÐÍ¡••Ð€ô•¹ÍÕÉ•A…ÍÍÝ½É‘I•Í•ÑM¡••Ð¡ÍÌ¤ì(€½¹ÍÐ±…ÍÑI½Ü€ôÍ¡••Ð¹•Ñ1…ÍÑI½Ü ¤ì((€¥˜€¡±…ÍÑI½Ü€ð€È¤ì(€€€É•ÑÕÉ¸ì(€ô((€½¹ÍÐÙ…±Õ•Ì€ôÍ¡••Ð¹•ÑI…¹” È°€Ä°±…ÍÑI½Ü€´€Ä°€Ü¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¤ì((€Ù…±Õ•Ì¹™½É… ¡™Õ¹Ñ¥½¸€¡É½Ü°¥¹‘•à¤ì(€€€½¹ÍÐÑ…É•ÑI½Ü€ô¥¹‘•à€¬€Èì(€€€¥˜€¡MÑÉ¥¹œ¡É½ÝlÅtñð€œœ¤¹ÑÉ¥´ ¤€ôôô•µÁ±½å••%€˜˜MÑÉ¥¹œ¡É½ÝlÑtñð€œœ¤¹ÑÉ¥´ ¤€ôôô€Ÿ®2ªâÀœ¤ì(€€€€€Í¡••Ð¹•ÑI…¹”¡Ñ…É•ÑI½Ü°€Ô°€Ä°€Ì¤¹Í•ÑY…±Õ•Ì¡mlŸ²f®Ž0œ°™½Éµ…Ñ…Ñ•Q¥µ”¡¹•Ü…Ñ” ¤¤°…‘µ¥¹µÁ±½å••%‘ut¤ì(€€€ô(€ô¤ì)ô()™Õ¹Ñ¥½¸™¥¹‘µÁ±½å••	å%¡ÍÌ°•µÁ±½å••%¤ì(€½¹ÍÐ•µÁ±½å••Ì€ôÉ•…‘I½ÍÑ•ÉµÁ±½å••Ì¡ÍÌ¤ì((€™½È€¡±•Ð¥¹‘•à€ô€Àì¥¹‘•à€ð•µÁ±½å••Ì¹±•¹Ñ ì¥¹‘•à€¬ô€Ä¤ì(€€€¥˜€¡•µÁ±½å••Ím¥¹‘•át¹•µÁ±½å••%€ôôô•µÁ±½å••%¤ì(€€€€€É•ÑÕÉ¸•µÁ±½å••Ím¥¹‘•átì(€€€ô(€ô((€É•ÑÕÉ¸¹Õ±°ì)ô()™Õ¹Ñ¥½¸•Ñá¥ÍÑ¥¹µÁ±½å••9…µ•Ì¡Í¡••Ð¤ì(€½¹ÍÐ±…ÍÑ½±Õµ¸€ôÍ¡••Ð¹•Ñ1…ÍÑ½±Õµ¸ ¤ì(€½¹ÍÐ¹…µ•Ì€ôÍ¡••Ð¹•ÑI…¹” Ä°€Ä°€Ä°±…ÍÑ½±Õµ¸¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¥lÁtì(€½¹ÍÐ•á¥ÍÑ¥¹œ€ô¹•ÜM•Ð ¤ì((€¹…µ•Ì¹™½É… ¡™Õ¹Ñ¥½¸€¡¹…µ”¤ì(€€€½¹ÍÐ¹½Éµ…±¥é•€ôMÑÉ¥¹œ¡¹…µ”ñð€œœ¤¹ÑÉ¥´ ¤ì(€€€¥˜€¡¹½Éµ…±¥é•¤ì(€€€€€•á¥ÍÑ¥¹œ¹…‘¡¹½Éµ…±¥é•¤ì(€€€ô(€ô¤ì((€É•ÑÕÉ¸•á¥ÍÑ¥¹œì)ô()™Õ¹Ñ¥½¸…‘‘µÁ±½å••	±½¬¡Í¡••Ð°•µÁ±½å•”¤ì(€½¹ÍÐÑ•µÁ±…Ñ•MÑ…ÉÐ€ô™¥¹‘1…ÍÑµÁ±½å••	±½­MÑ…ÉÐ¡Í¡••Ð¤ì(€½¹ÍÐÑ…É•ÑMÑ…ÉÐ€ôÑ•µÁ±…Ñ•MÑ…ÉÐ€¬€Øì(€½¹ÍÐÉ•ÅÕ¥É•‘1…ÍÑ½±Õµ¸€ôÑ…É•ÑMÑ…ÉÐ€¬€Ôì((€¥˜€¡É•ÅÕ¥É•‘1…ÍÑ½±Õµ¸€øÍ¡••Ð¹•Ñ5…á½±Õµ¹Ì ¤¤ì(€€€Í¡••Ð¹¥¹Í•ÉÑ½±Õµ¹Í™Ñ•È¡Í¡••Ð¹•Ñ5…á½±Õµ¹Ì ¤°É•ÅÕ¥É•‘1…ÍÑ½±Õµ¸€´Í¡••Ð¹•Ñ5…á½±Õµ¹Ì ¤¤ì(€ô((€½¹ÍÐµ…áI½ÝÌ€ôÍ¡••Ð¹•Ñ5…áI½ÝÌ ¤ì(€½¹ÍÐÑ•µÁ±…Ñ•I…¹”€ôÍ¡••Ð¹•ÑI…¹” Ä°Ñ•µÁ±…Ñ•MÑ…ÉÐ°µ…áI½ÝÌ°€Ø¤ì(€½¹ÍÐÑ…É•ÑI…¹”€ôÍ¡••Ð¹•ÑI…¹” Ä°Ñ…É•ÑMÑ…ÉÐ°µ…áI½ÝÌ°€Ø¤ì(€Ñ•µÁ±…Ñ•I…¹”¹½ÁåQ¼¡Ñ…É•ÑI…¹”°ì½¹Ñ•¹ÑÍ=¹±äè™…±Í”ô¤ì((€Í¡••Ð¹•ÑI…¹” Ä°Ñ…É•ÑMÑ…ÉÐ°€Ä°€Ø¤¹‰É•…­Á…ÉÐ ¤¹µ•É•É½ÍÌ ¤¹Í•ÑY…±Õ”¡•µÁ±½å•”¹¹…µ”¤ì(€Í¡••Ð¹•ÑI…¹” È°Ñ…É•ÑMÑ…ÉÐ°€Ä°€Ø¤¹Í•ÑY…±Õ•Ì¡ml(€€€1	1L¹±½­%¸°(€€€1	1L¹±½­=ÕÐ°(€€€1	1L¹•…É±ä°(€€€1	1L¹½Ù•ÉÑ¥µ”°(€€€1	1L¹½Ð°(€€€1	1L¹±•…Ù•UÍ•(€ut¤ì((€¥˜€¡µ…áI½ÝÌ€ø€È¤ì(€€€Í¡••Ð¹•ÑI…¹” Ì°Ñ…É•ÑMÑ…ÉÐ°µ…áI½ÝÌ€´€È°€È¤¹±•…É½¹Ñ•¹Ð ¤ì(€€€Í¡••Ð¹•ÑI…¹” Ì°Ñ…É•ÑMÑ…ÉÐ€¬€Ô°µ…áI½ÝÌ€´€È°€Ä¤¹±•…É½¹Ñ•¹Ð ¤ì(€ô((€™½È€¡±•Ð½™™Í•Ð€ô€Àì½™™Í•Ð€ð€Øì½™™Í•Ð€¬ô€Ä¤ì(€€€Í¡••Ð¹Í•Ñ½±Õµ¹]¥‘Ñ ¡Ñ…É•ÑMÑ…ÉÐ€¬½™™Í•Ð°Í¡••Ð¹•Ñ½±Õµ¹]¥‘Ñ ¡Ñ•µÁ±…Ñ•MÑ…ÉÐ€¬½™™Í•Ð¤¤ì(€ô((€É•ÑÕÉ¸ì(€€€ÍÑ…ÉÑ½±Õµ¸èÑ…É•ÑMÑ…ÉÐ°(€€€±½­%¹½±Õµ¸èÑ…É•ÑMÑ…ÉÐ°(€€€±½­=ÕÑ½±Õµ¸èÑ…É•ÑMÑ…ÉÐ€¬€Ä(€ôì)ô()™Õ¹Ñ¥½¸™¥¹‘1…ÍÑµÁ±½å••	±½­MÑ…ÉÐ¡Í¡••Ð¤ì(€½¹ÍÐ±…ÍÑ½±Õµ¸€ôÍ¡••Ð¹•Ñ1…ÍÑ½±Õµ¸ ¤ì(€½¹ÍÐ¹…µ•Ì€ôÍ¡••Ð¹•ÑI…¹” Ä°€Ä°€Ä°±…ÍÑ½±Õµ¸¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¥lÁtì((€™½È€¡±•Ð¥¹‘•à€ô¹…µ•Ì¹±•¹Ñ €´€Äì¥¹‘•à€øô€Äì¥¹‘•à€´ô€Ä¤ì(€€€¥˜€¡MÑÉ¥¹œ¡¹…µ•Ím¥¹‘•átñð€œœ¤¹ÑÉ¥´ ¤¤ì(€€€€€É•ÑÕÉ¸¥¹‘•à€¬€Äì(€€€ô(€ô((€Ñ¡É½Ü¹•ÜÉÉ½È Ÿ®Î×²
³¶V€ƒ²ž²n@ƒ²î³®~ðƒ®âS®†w²vƒ²Âû²vƒ²"`ƒ²^²*×®.#®.¸œ¤ì)ô()™Õ¹Ñ¥½¸™¥¹‘µÁ±½å••	±½¬¡Í¡••Ð°•µÁ±½å••9…µ”¤ì(€½¹ÍÐ‰±½¬€ô™¥¹‘µÁ±½å••	±½­=É9Õ±°¡Í¡••Ð°•µÁ±½å••9…µ”¤ì((€¥˜€ …‰±½¬¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È¡•µÁ±½å••9…µ”€¬€œƒ²ž²n@ƒ²î³®~ó²v€œ€¬=9%¹…ÑÑ•¹‘…¹•M¡••Ñ9…µ”€¬€œƒ².s¶*ã²^C²pƒ²Âû²vƒ²"`ƒ²^²*×®.#®.¸œ¤ì(€ô((€É•ÑÕÉ¸‰±½¬ì)ô()™Õ¹Ñ¥½¸™¥¹‘µÁ±½å••	±½­=É9Õ±°¡Í¡••Ð°•µÁ±½å••9…µ”¤ì(€½¹ÍÐ±…ÍÑ½±Õµ¸€ôÍ¡••Ð¹•Ñ1…ÍÑ½±Õµ¸ ¤ì(€½¹ÍÐ¡•…‘•ÉI½ÝÌ€ôÍ¡••Ð¹•ÑI…¹” Ä°€Ä°€È°±…ÍÑ½±Õµ¸¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¤ì(€½¹ÍÐ¹…µ•Ì€ô¡•…‘•ÉI½ÝÍlÁtñðmtì(€½¹ÍÐ¡•…‘•ÉÌ€ô¡•…‘•ÉI½ÝÍlÅtñðmtì((€™½È€¡±•Ð¥¹‘•à€ô€Àì¥¹‘•à€ð¹…µ•Ì¹±•¹Ñ ì¥¹‘•à€¬ô€Ä¤ì(€€€¥˜€¡MÑÉ¥¹œ¡¹…µ•Ím¥¹‘•átñð€œœ¤¹ÑÉ¥´ ¤€ôôô•µÁ±½å••9…µ”¤ì(€€€€€½¹ÍÐÍÑ…ÉÑ½±Õµ¸€ô¥¹‘•à€¬€Äì(€€€€€½¹ÍÐ¡•…‘•ÉM±¥”€ô¡•…‘•ÉÌ¹Í±¥”¡¥¹‘•à°¥¹‘•à€¬€Ø¤ì(€€€€€½¹ÍÐ±½­%¹=™™Í•Ð€ô¡•…‘•ÉM±¥”¹¥¹‘•á=˜¡1	1L¹±½­%¸¤ì(€€€€€½¹ÍÐ±½­=ÕÑ=™™Í•Ð€ô¡•…‘•ÉM±¥”¹¥¹‘•á=˜¡1	1L¹±½­=ÕÐ¤ì((€€€€€¥˜€¡±½­%¹=™™Í•Ð€ð€Àñð±½­=ÕÑ=™™Í•Ð€ð€À¤ì(€€€€€€€Ñ¡É½Ü¹•ÜÉÉ½È¡•µÁ±½å••9…µ”€¬€œƒ²ž²nC²v`ƒ²ÚsªÞð¿¶ÓªÞðƒ²î³®~ó²vƒ²Âû²vƒ²"`ƒ²^²*×®.#®.¸œ¤ì(€€€€€ô((€€€€€É•ÑÕÉ¸ì(€€€€€€€ÍÑ…ÉÑ½±Õµ¸°(€€€€€€€±½­%¹½±Õµ¸èÍÑ…ÉÑ½±Õµ¸€¬±½­%¹=™™Í•Ð°(€€€€€€€±½­=ÕÑ½±Õµ¸èÍÑ…ÉÑ½±Õµ¸€¬±½­=ÕÑ=™™Í•Ð(€€€€€ôì(€€€ô(€ô((€É•ÑÕÉ¸¹Õ±°ì)ô()™Õ¹Ñ¥½¸™¥¹‘=ÉÉ•…Ñ•…Ñ•I½Ü¡Í¡••Ð°‘…Ñ•Y…±Õ”¤ì(€½¹ÍÐÑ…É•ÑQ•áÐ€ô™½Éµ…Ñ…Ñ”¡‘…Ñ•Y…±Õ”¤ì(€½¹ÍÐ±…ÍÑI½Ü€ô5…Ñ ¹µ…à¡Í¡••Ð¹•Ñ1…ÍÑI½Ü ¤°€È¤ì(€½¹ÍÐ‘…Ñ•Y…±Õ•Ì€ôÍ¡••Ð¹•ÑI…¹” Ä°€Ä°±…ÍÑI½Ü°€Ä¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¤ì((€™½È€¡±•ÐÉ½Ü€ô€ÈìÉ½Ü€ðô‘…Ñ•Y…±Õ•Ì¹±•¹Ñ ìÉ½Ü€¬ô€Ä¤ì(€€€¥˜€¡MÑÉ¥¹œ¡‘…Ñ•Y…±Õ•ÍmÉ½Ü€´€ÅulÁtñð€œœ¤¹ÑÉ¥´ ¤€ôôôÑ…É•ÑQ•áÐ¤ì(€€€€€É•ÑÕÉ¸É½Üì(€€€ô(€ô((€™½È€¡±•ÐÉ½Ü€ô€ÌìÉ½Ü€ðô±…ÍÑI½ÜìÉ½Ü€¬ô€Ä¤ì(€€€¥˜€ …MÑÉ¥¹œ¡‘…Ñ•Y…±Õ•ÍmÉ½Ü€´€ÅulÁtñð€œœ¤¹ÑÉ¥´ ¤¤ì(€€€€€Í¡••Ð¹•ÑI…¹”¡É½Ü°€Ä¤(€€€€€€€€¹Í•ÑY…±Õ”¡ÍÑÉ¥ÁQ¥µ”¡‘…Ñ•Y…±Õ”¤¤(€€€€€€€€¹Í•Ñ9Õµ‰•É½Éµ…Ð åååä¸´¸œ¤ì(€€€€€É•ÑÕÉ¸É½Üì(€€€ô(€ô((€½¹ÍÐ¹•ÝI½Ü€ô±…ÍÑI½Ü€¬€Äì(€Í¡••Ð¹•ÑI…¹”¡¹•ÝI½Ü°€Ä¤(€€€€¹Í•ÑY…±Õ”¡ÍÑÉ¥ÁQ¥µ”¡‘…Ñ•Y…±Õ”¤¤(€€€€¹Í•Ñ9Õµ‰•É½Éµ…Ð åååä¸´¸œ¤ì(€É•ÑÕÉ¸¹•ÝI½Üì)ô()™Õ¹Ñ¥½¸É•Í½±Ù•ÑÑ•¹‘…¹•Q…É•Ñ|¡Í¡••Ð°•µÁ±½å••	±½¬°ÑåÁ”°Í…Ù•‘Ð¤ì(€½¹ÍÐÍ•±•Ñ•‘]½É­…Ñ”€ôÍÑÉ¥ÁQ¥µ”¡Í…Ù•‘Ð¤ì(€½¹ÍÐÍ•±•Ñ•‘I½Ü€ô™¥¹‘…Ñ•I½Ý|¡Í¡••Ð°Í•±•Ñ•‘]½É­…Ñ”¤ì((€¥˜€¡ÑåÁ”€ôôô€±½­%¸œ¤ì(€€€É•ÑÕÉ¸ì(€€€€€É½ÜèÍ•±•Ñ•‘I½Üñð™¥¹‘=ÉÉ•…Ñ•…Ñ•I½Ü¡Í¡••Ð°Í•±•Ñ•‘]½É­…Ñ”¤°(€€€€€Ý½É­…Ñ”èÍ•±•Ñ•‘]½É­…Ñ”(€€€ôì(€ô((€¥˜€¡Í•±•Ñ•‘I½Ü¤ì(€€€½¹ÍÐÍ•±•Ñ•‘Y…±Õ•Ì€ô•ÑÑÑ•¹‘…¹•±½­Y…±Õ•Í|¡Í¡••Ð°Í•±•Ñ•‘I½Ü°•µÁ±½å••	±½¬¤ì(€€€¥˜€¡Í•±•Ñ•‘Y…±Õ•Ì¹±½­%¸¤ì(€€€€€É•ÑÕÉ¸ìÉ½ÜèÍ•±•Ñ•‘I½Ü°Ý½É­…Ñ”èÍ•±•Ñ•‘]½É­…Ñ”ôì(€€€ô(€ô((€½¹ÍÐÁÉ•Ù¥½ÕÍ]½É­…Ñ”€ô¹•Ü…Ñ”¡Í•±•Ñ•‘]½É­…Ñ”¤ì(€ÁÉ•Ù¥½ÕÍ]½É­…Ñ”¹Í•Ñ…Ñ”¡ÁÉ•Ù¥½ÕÍ]½É­…Ñ”¹•Ñ…Ñ” ¤€´€Ä¤ì(€½¹ÍÐÁÉ•Ù¥½ÕÍI½Ü€ô™¥¹‘…Ñ•I½Ý|¡Í¡••Ð°ÁÉ•Ù¥½ÕÍ]½É­…Ñ”¤ì((€¥˜€¡ÁÉ•Ù¥½ÕÍI½Ü€˜˜¥Í=Á•¹ÑÑ•¹‘…¹•I½Ý|¡Í¡••Ð°ÁÉ•Ù¥½ÕÍI½Ü°•µÁ±½å••	±½¬¤€˜˜(€€€€€¥Í±½­=ÕÑ]¥Ñ¡¥¹=Á•¹M¡¥™Ñ|¡Í¡••Ð°ÁÉ•Ù¥½ÕÍI½Ü°•µÁ±½å••	±½¬°ÁÉ•Ù¥½ÕÍ]½É­…Ñ”°Í…Ù•‘Ð¤¤ì(€€€É•ÑÕÉ¸ìÉ½ÜèÁÉ•Ù¥½ÕÍI½Ü°Ý½É­…Ñ”èÁÉ•Ù¥½ÕÍ]½É­…Ñ”ôì(€ô((€É•ÑÕÉ¸ì(€€€É½ÜèÍ•±•Ñ•‘I½Üñð™¥¹‘=ÉÉ•…Ñ•…Ñ•I½Ü¡Í¡••Ð°Í•±•Ñ•‘]½É­…Ñ”¤°(€€€Ý½É­…Ñ”èÍ•±•Ñ•‘]½É­…Ñ”(€ôì)ô()™Õ¹Ñ¥½¸™¥¹‘…Ñ•I½Ý|¡Í¡••Ð°‘…Ñ•Y…±Õ”¤ì(€½¹ÍÐÑ…É•ÑQ•áÐ€ô™½Éµ…Ñ…Ñ”¡‘…Ñ•Y…±Õ”¤ì(€½¹ÍÐ±…ÍÑI½Ü€ô5…Ñ ¹µ…à¡Í¡••Ð¹•Ñ1…ÍÑI½Ü ¤°€È¤ì(€½¹ÍÐ‘…Ñ•Y…±Õ•Ì€ôÍ¡••Ð¹•ÑI…¹” Ä°€Ä°±…ÍÑI½Ü°€Ä¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¤ì((€™½È€¡±•ÐÉ½Ü€ô€ÈìÉ½Ü€ðô‘…Ñ•Y…±Õ•Ì¹±•¹Ñ ìÉ½Ü€¬ô€Ä¤ì(€€€¥˜€¡MÑÉ¥¹œ¡‘…Ñ•Y…±Õ•ÍmÉ½Ü€´€ÅulÁtñð€œœ¤¹ÑÉ¥´ ¤€ôôôÑ…É•ÑQ•áÐ¤ì(€€€€€É•ÑÕÉ¸É½Üì(€€€ô(€ô((€É•ÑÕÉ¸€Àì)ô()™Õ¹Ñ¥½¸•ÑÑÑ•¹‘…¹•±½­Y…±Õ•Í|¡Í¡••Ð°É½Ü°•µÁ±½å••	±½¬¤ì(€½¹ÍÐÝ¥‘Ñ €ô•µÁ±½å••	±½¬¹±½­=ÕÑ½±Õµ¸€´•µÁ±½å••	±½¬¹±½­%¹½±Õµ¸€¬€Äì(€½¹ÍÐÙ…±Õ•Ì€ôÍ¡••Ð¹•ÑI…¹”¡É½Ü°•µÁ±½å••	±½¬¹±½­%¹½±Õµ¸°€Ä°Ý¥‘Ñ ¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¥lÁtñðmtì(€É•ÑÕÉ¸ì(€€€±½­%¸è±•…¹M¡••Ñ¥ÍÁ±…ä¡Ù…±Õ•ÍlÁt¤°(€€€±½­=ÕÐè±•…¹M¡••Ñ¥ÍÁ±…ä¡Ù…±Õ•ÍmÝ¥‘Ñ €´€Åt¤(€ôì)ô()™Õ¹Ñ¥½¸¥Í=Á•¹ÑÑ•¹‘…¹•I½Ý|¡Í¡••Ð°É½Ü°•µÁ±½å••	±½¬¤ì(€½¹ÍÐÙ…±Õ•Ì€ô•ÑÑÑ•¹‘…¹•±½­Y…±Õ•Í|¡Í¡••Ð°É½Ü°•µÁ±½å••	±½¬¤ì(€É•ÑÕÉ¸	½½±•…¸¡Ù…±Õ•Ì¹±½­%¸¤€˜˜€…Ù…±Õ•Ì¹±½­=ÕÐì)ô()™Õ¹Ñ¥½¸¥Í±½­=ÕÑ]¥Ñ¡¥¹=Á•¹M¡¥™Ñ|¡Í¡••Ð°É½Ü°•µÁ±½å••	±½¬°Ý½É­…Ñ”°Í…Ù•‘Ð¤ì(€½¹ÍÐÙ…±Õ•Ì€ô•ÑÑÑ•¹‘…¹•±½­Y…±Õ•Í|¡Í¡••Ð°É½Ü°•µÁ±½å••	±½¬¤ì(€½¹ÍÐ±½­%¹5¥¹ÕÑ•Ì€ôÁ…ÉÍ•Q¥µ•Q½5¥¹ÕÑ•Ì¡Ù…±Õ•Ì¹±½­%¸¤ì(€¥˜€¡±½­%¹5¥¹ÕÑ•Ì€ôôô¹Õ±°¤ì(€€€É•ÑÕÉ¸™…±Í”ì(€ô((€½¹ÍÐ±½­%¹Ð€ô¹•Ü…Ñ”¡Ý½É­…Ñ”¤ì(€±½­%¹Ð¹Í•Ñ!½ÕÉÌ¡5…Ñ ¹™±½½È¡±½­%¹5¥¹ÕÑ•Ì€¼€ØÀ¤°±½­%¹5¥¹ÕÑ•Ì€”€ØÀ°€À°€À¤ì(€½¹ÍÐ•±…ÁÍ•€ôÍ…Ù•‘Ð¹•ÑQ¥µ” ¤€´±½­%¹Ð¹•ÑQ¥µ” ¤ì(€É•ÑÕÉ¸•±…ÁÍ•€øô€À€˜˜•±…ÁÍ•€ðô€ÈÐ€¨€ØÀ€¨€ØÀ€¨€ÄÀÀÀì)ô()™Õ¹Ñ¥½¸É•…‘ÑÑ•¹‘…¹•I½ÝÌ¡Í¡••Ð°‰±½¬¤ì(€½¹ÍÐ±…ÍÑI½Ü€ô5…Ñ ¹µ…à¡Í¡••Ð¹•Ñ1…ÍÑI½Ü ¤°€È¤ì(€½¹ÍÐÉ•ÅÕ¥É•‘½±Õµ¹Ì€ô‰±½¬¹ÍÑ…ÉÑ½±Õµ¸€¬€Ôì(€½¹ÍÐÙ…±Õ•Ì€ôÍ¡••Ð¹•ÑI…¹” Ä°€Ä°±…ÍÑI½Ü°É•ÅÕ¥É•‘½±Õµ¹Ì¤¹•Ñ¥ÍÁ±…åY…±Õ•Ì ¤ì(€É•ÑÕÉ¸É•…‘ÑÑ•¹‘…¹•I½ÝÍÉ½µY…±Õ•Í|¡Ù…±Õ•Ì°‰±½¬¤ì)ô()™Õ¹Ñ¥½¸É•…‘ÑÑ•¹‘…¹•I½ÝÍÉ½µY…±Õ•Í|¡Ù…±Õ•Ì°‰±½¬¤ì(€½¹ÍÐÉ½ÝÌ€ômtì((€™½È€¡±•ÐÉ½Ý%¹‘•à€ô€ÈìÉ½Ý%¹‘•à€ðôÙ…±Õ•Ì¹±•¹Ñ ìÉ½Ý%¹‘•à€¬ô€Ä¤ì(€€€½¹ÍÐÉ½Ü€ôÙ…±Õ•ÍmÉ½Ý%¹‘•à€´€Åtì(€€€½¹ÍÐ‘…Ñ•Q•áÐ€ôMÑÉ¥¹œ¡É½ÝlÁtñð€œœ¤¹ÑÉ¥´ ¤ì(€€€½¹ÍÐÁ…ÉÍ•€ôÁ…ÉÍ•M¡••Ñ…Ñ•Q•áÐ¡‘…Ñ•Q•áÐ¤ì((€€€¥˜€ …Á…ÉÍ•¤ì(€€€€€½¹Ñ¥¹Õ”ì(€€€ô((€€€É½ÝÌ¹ÁÕÍ ¡‰Õ¥±‘ÑÑ•¹‘…¹•I½Ü¡‘…Ñ•Q•áÐ°Á…ÉÍ•¹‘…ä°É½Ü°‰±½¬¤¤ì(€ô((€É•ÑÕÉ¸É½ÝÌ¹Í½ÉÐ¡™Õ¹Ñ¥½¸€¡±•™Ð°É¥¡Ð¤ì(€€€É•ÑÕÉ¸…ÑÑ•¹‘…¹•…Ñ•Q½Q¥µ•ÍÑ…µÀ¡±•™Ð¹‘…Ñ”¤€´…ÑÑ•¹‘…¹•…Ñ•Q½Q¥µ•ÍÑ…µÀ¡É¥¡Ð¹‘…Ñ”¤ì(€ô¤ì)ô()™Õ¹Ñ¥½¸…‘‘!½±¥‘…å1…‰•±ÍQ½I½ÝÍ|¡É½ÝÌ°¡½±¥‘…å5…À¤ì(€É•ÑÕÉ¸É½ÝÌ¹µ…À¡™Õ¹Ñ¥½¸€¡É½Ü¤ì(€€€É•ÑÕÉ¸=‰©•Ð¹…ÍÍ¥¸¡íô°É½Ü°ì(€€€€€¡½±¥‘…å9…µ”è¡½±¥‘…å5…ÁmÉ½Ü¹‘…Ñ•tñð€œœ(€€€ô¤ì(€ô¤ì)ô()™Õ¹Ñ¥½¸™¥±Ñ•ÉÑÑ•¹‘…¹•I½ÝÍ	å5½¹Ñ ¡É½ÝÌ°å•…È°µ½¹Ñ ¤ì(€É•ÑÕÉ¸É½ÝÌ¹™¥±Ñ•È¡™Õ¹Ñ¥½¸€¡É½Ü¤ì(€€€½¹ÍÐÁ…ÉÍ•€ôÁ…ÉÍ•M¡••Ñ…Ñ•Q•áÐ¡É½Ü¹‘…Ñ”¤ì(€€€É•ÑÕÉ¸Á…ÉÍ•€˜˜Á…ÉÍ•¹å•…È€ôôôå•…È€˜˜Á…ÉÍ•¹µ½¹Ñ €ôôôµ½¹Ñ ì(€ô¤ì)ô()™Õ¹Ñ¥½¸™¥±Ñ•ÉÑÑ•¹‘…¹•I½ÝÍ	åI…¹”¡É½ÝÌ°ÍÑ…ÉÑ…Ñ”°•¹‘…Ñ”¤ì(€½¹ÍÐÍÑ…ÉÑQ¥µ•ÍÑ…µÀ€ôÍÑÉ¥ÁQ¥µ”¡ÍÑ…ÉÑ…Ñ”¤¹•ÑQ¥µ” ¤ì(€½¹ÍÐ•¹‘Q¥µ•ÍÑ…µÀ€ôÍÑÉ¥ÁQ¥µ”¡•¹‘…Ñ”¤¹•ÑQ¥µ” ¤ì((€É•ÑÕÉ¸É½ÝÌ¹™¥±Ñ•È¡™Õ¹Ñ¥½¸€¡É½Ü¤ì(€€€½¹ÍÐÑ¥µ•ÍÑ…µÀ€ô…ÑÑ•¹‘…¹•…Ñ•Q½Q¥µ•ÍÑ…µÀ¡É½Ü¹‘…Ñ”¤ì(€€€É•ÑÕÉ¸Ñ¥µ•ÍÑ…µÀ€øôÍÑ…ÉÑQ¥µ•ÍÑ…µÀ€˜˜Ñ¥µ•ÍÑ…µÀ€ðô•¹‘Q¥µ•ÍÑ…µÀì(€ô¤ì)ô()™Õ¹Ñ¥½¸‰Õ¥±‘ÑÑ•¹‘…¹•I½Ü¡‘…Ñ•Q•áÐ°‘…ä°É½Ü°‰±½¬¤ì(€½¹ÍÐÍÑ…ÉÐ€ô‰±½¬¹ÍÑ…ÉÑ½±Õµ¸€´€Äì(€½¹ÍÐ±½­%¸€ô±•…¹M¡••Ñ¥ÍÁ±…ä¡É½ÝmÍÑ…ÉÑt¤ì(€½¹ÍÐ±½­=ÕÐ€ô±•…¹M¡••Ñ¥ÍÁ±…ä¡É½ÝmÍÑ…ÉÐ€¬€Åt¤ì(€½¹ÍÐ•…É±ä€ô±•…¹M¡••Ñ¥ÍÁ±…ä¡É½ÝmÍÑ…ÉÐ€¬€Ét¤ì(€½¹ÍÐ½Ù•ÉÑ¥µ”€ô±•…¹M¡••Ñ¥ÍÁ±…ä¡É½ÝmÍÑ…ÉÐ€¬€Ít¤ì(€½¹ÍÐ½Ð€ô±•…¹M¡••Ñ¥ÍÁ±…ä¡É½ÝmÍÑ…ÉÐ€¬€Ñt¤ì(€½¹ÍÐ±•…Ù•UÍ•€ô±•…¹M¡••Ñ¥ÍÁ±…ä¡É½ÝmÍÑ…ÉÐ€¬€Õt¤ì((€É•ÑÕÉ¸ì(€€€‘…Ñ”è‘…Ñ•Q•áÐ°(€€€‘…ä°(€€€±½­%¸°(€€€±½­=ÕÐ°(€€€•…É±ä°(€€€½Ù•ÉÑ¥µ”°(€€€½Ð°(€€€±•…Ù•UÍ•°(€€€Ý½É­Q¥µ”è™½Éµ…ÑÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì¡½µÁÕÑ•]½É­5¥¹ÕÑ•Ì¡±½­%¸°±½­=ÕÐ¤¤(€ôì)ô()™Õ¹Ñ¥½¸•µÁÑåÑÑ•¹‘…¹•I½Ü¡‘…Ñ•Q•áÐ¤ì(€½¹ÍÐÁ…ÉÍ•€ôÁ…ÉÍ•M¡••Ñ…Ñ•Q•áÐ¡‘…Ñ•Q•áÐ¤ì((€É•ÑÕÉ¸ì(€€€‘…Ñ”è‘…Ñ•Q•áÐ°(€€€‘…äèÁ…ÉÍ•€üÁ…ÉÍ•¹‘…ä€è€œœ°(€€€±½­%¸è€œœ°(€€€±½­=ÕÐè€œœ°(€€€•…É±äè€œœ°(€€€½Ù•ÉÑ¥µ”è€œœ°(€€€½Ðè€œœ°(€€€±•…Ù•UÍ•è€œœ°(€€€Ý½É­Q¥µ”è€œÀèÀÀœ(€ôì)ô()™Õ¹Ñ¥½¸ÍÕµµ…É¥é•ÑÑ•¹‘…¹•I½ÝÌ¡É½ÝÌ¤ì(€½¹ÍÐÑ½Ñ…±Ì€ôÉ½ÝÌ¹É•‘Õ”¡™Õ¹Ñ¥½¸€¡ÍÕµµ…Éä°É½Ü¤ì(€€€½¹ÍÐ¡…Í]½É¬€ô	½½±•…¸¡É½Ü¹±½­%¸ñðÉ½Ü¹±½­=ÕÐ¤ì(€€€ÍÕµµ…Éä¹Ý½É­…åÌ€¬ô¡…Í]½É¬€ü€Ä€è€Àì(€€€ÍÕµµ…Éä¹Ý½É­5¥¹ÕÑ•Ì€¬ô‘ÕÉ…Ñ¥½¹Q•áÑQ½5¥¹ÕÑ•Ì¡É½Ü¹Ý½É­Q¥µ”¤ì(€€€ÍÕµµ…Éä¹•…É±å5¥¹ÕÑ•Ì€¬ô‘ÕÉ…Ñ¥½¹Q•áÑQ½5¥¹ÕÑ•Ì¡É½Ü¹•…É±ä¤ì(€€€ÍÕµµ…Éä¹½Ù•ÉÑ¥µ•5¥¹ÕÑ•Ì€¬ô‘ÕÉ…Ñ¥½¹Q•áÑQ½5¥¹ÕÑ•Ì¡É½Ü¹½Ù•ÉÑ¥µ”¤ì(€€€ÍÕµµ…Éä¹½Ñ5¥¹ÕÑ•Ì€¬ô‘ÕÉ…Ñ¥½¹Q•áÑQ½5¥¹ÕÑ•Ì¡É½Ü¹½Ð¤ì(€€€ÍÕµµ…Éä¹±•…Ù•UÍ•€¬ô9Õµ‰•È¡É½Ü¹±•…Ù•UÍ•ñð€À¤ñð€Àì(€€€É•ÑÕÉ¸ÍÕµµ…Éäì(€ô°ì(€€€Ý½É­…åÌè€À°(€€€Ý½É­5¥¹ÕÑ•Ìè€À°(€€€•…É±å5¥¹ÕÑ•Ìè€À°(€€€½Ù•ÉÑ¥µ•5¥¹ÕÑ•Ìè€À°(€€€½Ñ5¥¹ÕÑ•Ìè€À°(€€€±•…Ù•UÍ•è€À(€ô¤ì((€É•ÑÕÉ¸ì(€€€Ý½É­…åÌèÑ½Ñ…±Ì¹Ý½É­…åÌ°(€€€Ý½É­Q¥µ”è™½Éµ…ÑÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì¡Ñ½Ñ…±Ì¹Ý½É­5¥¹ÕÑ•Ì¤°(€€€•…É±äè™½Éµ…ÑÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì¡Ñ½Ñ…±Ì¹•…É±å5¥¹ÕÑ•Ì¤°(€€€½Ù•ÉÑ¥µ”è™½Éµ…ÑÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì¡Ñ½Ñ…±Ì¹½Ù•ÉÑ¥µ•5¥¹ÕÑ•Ì¤°(€€€½Ðè™½Éµ…ÑÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì¡Ñ½Ñ…±Ì¹½Ñ5¥¹ÕÑ•Ì¤°(€€€±•…Ù•UÍ•èMÑÉ¥¹œ¡5…Ñ ¹É½Õ¹¡Ñ½Ñ…±Ì¹±•…Ù•UÍ•€¨€ÄÀ¤€¼€ÄÀ¤°(€€€±•…Ù•I•µ…¥¸èMÑÉ¥¹œ¡5…Ñ ¹µ…à À°5…Ñ ¹É½Õ¹  ÄÔ€´Ñ½Ñ…±Ì¹±•…Ù•UÍ•¤€¨€ÄÀ¤€¼€ÄÀ¤¤(€ôì)ô()™Õ¹Ñ¥½¸‰Õ¥±‘ÑÑ•¹‘…¹•MÑ…Ñ¥ÍÑ¥Ì¡…ÑÑ•¹‘…¹•I½ÝÌ°µ½¹Ñ¡I½ÝÌ°¹½Ü¤ì(€½¹ÍÐµ½¹Ñ¡±ä€ôÍÕµµ…É¥é•ÑÑ•¹‘…¹•I½ÝÌ¡µ½¹Ñ¡I½ÝÌ¤ì(€½¹ÍÐµ½¹Ñ¡]½É­5¥¹ÕÑ•Ì€ô‘ÕÉ…Ñ¥½¹Q•áÑQ½5¥¹ÕÑ•Ì¡µ½¹Ñ¡±ä¹Ý½É­Q¥µ”¤ì(€½¹ÍÐ½µÁ±•Ñ•‘]½É­…åÌ€ôµ½¹Ñ¡I½ÝÌ¹™¥±Ñ•È¡™Õ¹Ñ¥½¸€¡É½Ü¤ì(€€€É•ÑÕÉ¸‘ÕÉ…Ñ¥½¹Q•áÑQ½5¥¹ÕÑ•Ì¡É½Ü¹Ý½É­Q¥µ”¤€ø€Àì(€ô¤¹±•¹Ñ ì(€½¹ÍÐÝ••­I…¹”€ô•ÑÕÉÉ•¹Ñ]••­I…¹”¡¹½Ü¤ì(€½¹ÍÐÝ••­]½É­5¥¹ÕÑ•Ì€ô…ÑÑ•¹‘…¹•I½ÝÌ¹É•‘Õ”¡™Õ¹Ñ¥½¸€¡Ñ½Ñ…°°É½Ü¤ì(€€€½¹ÍÐÑ¥µ•ÍÑ…µÀ€ô…ÑÑ•¹‘…¹•…Ñ•Q½Q¥µ•ÍÑ…µÀ¡É½Ü¹‘…Ñ”¤ì(€€€¥˜€¡Ñ¥µ•ÍÑ…µÀ€ðÝ••­I…¹”¹ÍÑ…ÉÐñðÑ¥µ•ÍÑ…µÀ€øÝ••­I…¹”¹•¹¤ì(€€€€€É•ÑÕÉ¸Ñ½Ñ…°ì(€€€ô(€€€É•ÑÕÉ¸Ñ½Ñ…°€¬‘ÕÉ…Ñ¥½¹Q•áÑQ½5¥¹ÕÑ•Ì¡É½Ü¹Ý½É­Q¥µ”¤ì(€ô°€À¤ì((€É•ÑÕÉ¸ì(€€€Ý••­]½É­Q¥µ”è™½Éµ…ÑÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì¡Ý••­]½É­5¥¹ÕÑ•Ì¤°(€€€µ½¹Ñ¡]½É­Q¥µ”èµ½¹Ñ¡±ä¹Ý½É­Q¥µ”°(€€€…Ù•É…•…¥±å]½É­Q¥µ”è™½Éµ…ÑÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì (€€€€€½µÁ±•Ñ•‘]½É­…åÌ€ü5…Ñ ¹É½Õ¹¡µ½¹Ñ¡]½É­5¥¹ÕÑ•Ì€¼½µÁ±•Ñ•‘]½É­…åÌ¤€è€À(€€€€¤(€ôì)ô()™Õ¹Ñ¥½¸•ÑÕÉÉ•¹Ñ]••­I…¹”¡Ù…±Õ”¤ì(€½¹ÍÐÕÉÉ•¹Ð€ôÍÑÉ¥ÁQ¥µ”¡Ù…±Õ”¥¹ÍÑ…¹•½˜…Ñ”€üÙ…±Õ”€è¹•Ü…Ñ” ¤¤ì(€½¹ÍÐµ½¹‘…å=™™Í•Ð€ôÕÉÉ•¹Ð¹•Ñ…ä ¤€ôôô€À€ü€Ø€èÕÉÉ•¹Ð¹•Ñ…ä ¤€´€Äì(€½¹ÍÐÍÑ…ÉÐ€ô¹•Ü…Ñ”¡ÕÉÉ•¹Ð¤ì(€ÍÑ…ÉÐ¹Í•Ñ…Ñ”¡ÕÉÉ•¹Ð¹•Ñ…Ñ” ¤€´µ½¹‘…å=™™Í•Ð¤ì(€½¹ÍÐ•¹€ô¹•Ü…Ñ”¡ÍÑ…ÉÐ¤ì(€•¹¹Í•Ñ…Ñ”¡ÍÑ…ÉÐ¹•Ñ…Ñ” ¤€¬€Ø¤ì(€•¹¹Í•Ñ!½ÕÉÌ ÈÌ°€Ôä°€Ôä°€äää¤ì((€É•ÑÕÉ¸ìÍÑ…ÉÐèÍÑ…ÉÐ¹•ÑQ¥µ” ¤°•¹è•¹¹•ÑQ¥µ” ¤ôì)ô()™Õ¹Ñ¥½¸…ÑÑ•¹‘…¹•…Ñ•Q½Q¥µ•ÍÑ…µÀ¡Ù…±Õ”¤ì(€½¹ÍÐÁ…ÉÍ•€ôÁ…ÉÍ•M¡••Ñ…Ñ•Q•áÐ¡Ù…±Õ”¤ì(€É•ÑÕÉ¸Á…ÉÍ•€ü¹•Ü…Ñ”¡Á…ÉÍ•¹å•…È°Á…ÉÍ•¹µ½¹Ñ €´€Ä°Á…ÉÍ•¹‘…ä¤¹•ÑQ¥µ” ¤€è€Àì)ô()™Õ¹Ñ¥½¸É•…Ñ•=Á•É…Ñ¥½¹…±ÉÉ½È¡µ•ÍÍ…”°•Ù•¹ÑQåÁ”°Í­¥Á=Á•É…Ñ¥½¹…±1½œ¤ì(€½¹ÍÐ•ÉÉ½È€ô¹•ÜÉÉ½È¡µ•ÍÍ…”¤ì(€•ÉÉ½È¹±½Ù•¹ÑQåÁ”€ô•Ù•¹ÑQåÁ”ñð€œœì(€•ÉÉ½È¹Í­¥Á=Á•É…Ñ¥½¹…±1½œ€ô	½½±•…¸¡Í­¥Á=Á•É…Ñ¥½¹…±1½œ¤ì(€É•ÑÕÉ¸•ÉÉ½Èì)ô()™Õ¹Ñ¥½¸…ÁÁ•¹‘=Á•É…Ñ¥½¹…±…¥±ÕÉ”¡ÍÌ°½¹Ñ•áÐ¤ì(€ÑÉäì(€€€½¹ÍÐ‘•Ñ…¥±Ì€ô½¹Ñ•áÐñðíôì(€€€½¹ÍÐ¥¹ÁÕÐ€ô‘•Ñ…¥±Ì¹¥¹ÁÕÐñðíôì(€€€½¹ÍÐ•µÁ±½å•”€ô‘•Ñ…¥±Ì¹•µÁ±½å•”ñðíôì(€€€½¹ÍÐ…ÑÕ…±Ð€ô¥¹ÁÕÐ¹…ÑÕ…±Ð¥¹ÍÑ…¹•½˜…Ñ”€˜˜€…9Õµ‰•È¹¥Í9…8¡¥¹ÁÕÐ¹…ÑÕ…±Ð¹•ÑQ¥µ” ¤¤(€€€€€€ü¥¹ÁÕÐ¹…ÑÕ…±Ð(€€€€€€è¹•Ü…Ñ” ¤ì(€€€½¹ÍÐ‰…Í•QåÁ”€ô‘•Ñ…¥±Ì¹•Ù•¹ÑQåÁ”ñð1=}Y9QL¹ÍåÍÑ•µÉÉ½Èì(€€€½¹ÍÐ•ÉÉ½ÉQ•áÐ€ô‘•Ñ…¥±Ì¹•ÉÉ½È€˜˜‘•Ñ…¥±Ì¹•ÉÉ½È¹µ•ÍÍ…”(€€€€€€üMÑÉ¥¹œ¡‘•Ñ…¥±Ì¹•ÉÉ½È¹µ•ÍÍ…”¤¹É•Á±…” ½qÌ¬½œ°€œ€œ¤¹ÑÉ¥´ ¤¹Í±¥” À°€ÄÈÀ¤(€€€€€€è€œœì(€€€½¹ÍÐÑåÁ”€ô‰…Í•QåÁ”€ôôô1=}Y9QL¹ÍåÍÑ•µÉÉ½È€˜˜•ÉÉ½ÉQ•áÐ(€€€€€€ü‰…Í•QåÁ”€¬€œ€´€œ€¬•ÉÉ½ÉQ•áÐ(€€€€€€è‰…Í•QåÁ”ì(€€€…ÁÁ•¹‘ÑÑ•¹‘…¹•1½œ¡ÍÌ°ì(€€€€€‘…Ñ•Q•áÐè™½Éµ…Ñ…Ñ”¡…ÑÕ…±Ð¤°(€€€€€•µÁ±½å••%èMÑÉ¥¹œ¡‘•Ñ…¥±Ì¹•µÁ±½å••%ñð•µÁ±½å•”¹•µÁ±½å••%ñð¥¹ÁÕÐ¹•µÁ±½å••%ñð€œœ¤¹ÑÉ¥´ ¤°(€€€€€¹…µ”èMÑÉ¥¹œ¡•µÁ±½å•”¹¹…µ”ñð€œœ¤¹ÑÉ¥´ ¤°(€€€€€ÑåÁ”°(€€€€€Í…Ù•‘Q¥µ”è¥¹ÁÕÐ¹…ÑÕ…±Ð€ü™½Éµ…ÑQ¥µ”¡…ÑÕ…±Ð¤€è€œœ°(€€€€€…ÑÕ…±Q¥µ”è™½Éµ…ÑQ¥µ”¡…ÑÕ…±Ð¤°(€€€€€‘•Ù¥”èMÑÉ¥¹œ¡‘•Ñ…¥±Ì¹‘•Ù¥”ñð¥¹ÁÕÐ¹‘•Ù¥”ñð€1½¥±½ÜA]œ¤¹ÑÉ¥´ ¤°(€€€€€É•¥ÍÑ•É•‘Ðè¹•Ü…Ñ” ¤°(€€€€€ÕÁ‘…Ñ•‘Ðè€œœ°(€€€€€ÕÁ‘…Ñ•‘	äè€œœ(€€€ô¤ì(€ô…Ñ €¡±½ÉÉ½È¤ì(€€€½¹Í½±”¹•ÉÉ½È ÑÑ•¹‘…¹”±½œÝÉ¥Ñ”™…¥±•è€œ€¬€¡±½ÉÉ½È¹µ•ÍÍ…”ñð±½ÉÉ½È¤¤ì(€ô)ô()™Õ¹Ñ¥½¸…ÁÁ•¹‘ÑÑ•¹‘…¹•1½œ¡ÍÌ°•¹ÑÉä¤ì(€½¹ÍÐÍ¡••Ð€ô•ÑÑÑ•¹‘…¹•1½M¡••Ð¡ÍÌ¤ì(€Í¡••Ð¹…ÁÁ•¹‘I½Ü¡l(€€€•¹ÑÉä¹‘…Ñ•Q•áÐ°(€€€•¹ÑÉä¹•µÁ±½å••%°(€€€•¹ÑÉä¹¹…µ”°(€€€•¹ÑÉä¹ÑåÁ”°(€€€•¹ÑÉä¹Í…Ù•‘Q¥µ”°(€€€•¹ÑÉä¹…ÑÕ…±Q¥µ”°(€€€€œœ°(€€€€œœ°(€€€•¹ÑÉä¹‘•Ù¥”°(€€€™½Éµ…Ñ…Ñ•Q¥µ”¡•¹ÑÉä¹É•¥ÍÑ•É•‘Ð¤°(€€€•¹ÑÉä¹ÕÁ‘…Ñ•‘Ð°(€€€•¹ÑÉä¹ÕÁ‘…Ñ•‘	ä(€t¤ì)ô()™Õ¹Ñ¥½¸•ÑÑÑ•¹‘…¹•1½M¡••Ð¡ÍÌ¤ì(€É•ÑÕÉ¸•ÑI•ÅÕ¥É•‘M¡••Ð¡ÍÌ°=9%¹±½M¡••Ñ9…µ”¤ì)ô()™Õ¹Ñ¥½¸•ÑI•ÅÕ¥É•‘M¡••Ð¡ÍÌ°Í¡••Ñ9…µ”¤ì(€½¹ÍÐÍ¡••Ð€ôÍÌ¹•ÑM¡••Ñ	å9…µ”¡Í¡••Ñ9…µ”¤ì((€¥˜€ …Í¡••Ð¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È¡Í¡••Ñ9…µ”€¬€œƒ².s¶*ã®–ðƒ²Âû²vƒ²"`ƒ²^²*×®.#®.¸œ¤ì(€ô((€É•ÑÕÉ¸Í¡••Ðì)ô(