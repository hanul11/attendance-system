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
  gpsFailed: 'GPS \uC778\uC99D \uC2E4\uD328',
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
    throw new Error('사번을 입력해 주세요.');
  }

  let ss = null;
  let employee = null;

  try {
    ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
    employee = findEmployeeById(ss, employeeId);

    if (!employee) {
      throw createOperationalError('등록된 사번을 찾을 수 없습니다.', LOG_EVENTS.unknownEmployeeLogin);
    }

    if (employee.status !== LABELS.employed) {
      throw createOperationalError('재직 상태인 직원만 로그인할 수 있습니다.', '', true);
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
    throw new Error('현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.');
  }

  if (newPassword.length < 4) {
    throw new Error('새 비밀번호는 4자리 이상으로 입력해 주세요.');
  }

  if (!isValidNewPassword(newPassword)) {
    throw new Error('새 비밀번호는 영문과 숫자를 모두 포함해 주세요.');
  }

  if (newPassword === currentPassword) {
    throw new Error('새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = getRosterSheet(ss);
  const indexes = getRosterIndexes(sheet, true);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('등록된 사번을 찾을 수 없습니다.');
  }

  if (!verifyEmployeePassword(employee, currentPassword).ok) {
    throw new Error('현재 비밀번호가 일치하지 않습니다.');
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
    throw new Error('초기화를 요청할 사번을 입력해 주세요.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('등록된 사번을 찾을 수 없습니다.');
  }

  const sheet = ensurePasswordResetSheet(ss);
  sheet.appendRow([
    formatDateTime(new Date()),
    employee.employeeId,
    employee.name,
    employee.department,
    '대기',
    '',
    ''
  ]);

  return {
    ok: true,
    message: '관리자에게 비밀번호 초기화 요청을 보냈습니다.'
  };
}

function resetEmployeePassword(request) {
  const input = request || {};
  const adminEmployeeId = String(input.adminEmployeeId || '').trim();
  const targetEmployeeId = String(input.employeeId || '').trim();

  if (adminEmployeeId !== CONFIG.adminEmployeeId) {
    throw new Error('관리자 계정에서만 초기화할 수 있습니다.');
  }

  if (!targetEmployeeId) {
    throw new Error('초기화할 사번을 확인해 주세요.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = getRosterSheet(ss);
  const indexes = getRosterIndexes(sheet, true);
  const employee = findEmployeeById(ss, targetEmployeeId);

  if (!employee) {
    throw new Error('등록된 사번을 찾을 수 없습니다.');
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
      throw createOperationalError('등록된 사번을 찾을 수 없습니다.', '', true);
    }

    if (employee.status !== LABELS.employed) {
      throw createOperationalError('재직 상태인 직원만 출퇴근 등록이 가능합니다.', '', true);
    }

    const operationalSettings = readOperationalSettings_();
    if (operationalSettings.gps.enabled && (!Number.isFinite(input.gpsLatitude) || !Number.isFinite(input.gpsLongitude))) {
      throw createOperationalError('현재 위치를 확인한 후 다시 시도해 주세요.', LOG_EVENTS.gpsFailed);
    }

    if (operationalSettings.gps.enabled) {
      input.gpsDistanceM = getNearestGpsDistanceM_(input.gpsLatitude, input.gpsLongitude, operationalSettings.gps.locations);
    }

    if (operationalSettings.gps.enabled && input.gpsDistanceM > operationalSettings.gps.allowedRadiusM) {
      throw createOperationalError('회사 반경 내에서만 출퇴근 등록이 가능합니다.', LOG_EVENTS.gpsFailed);
    }

    const attendanceSheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
    let employeeBlock = findEmployeeBlockOrNull(attendanceSheet, employee.name);

    if (!employeeBlock) {
      syncRosterToAttendanceSheetInSpreadsheet(ss);
      employeeBlock = findEmployeeBlock(attendanceSheet, employee.name);
    }

    const savedAt = floorToHalfHour(input.actualAt);
    const workDate = new Date(savedAt);
    const targetRow = findOrCreateDateRow(attendanceSheet, workDate);
    const targetColumn = input.type === 'clockIn'
      ? employeeBlock.clockInColumn
      : employeeBlock.clockOutColumn;
    const targetCell = attendanceSheet.getRange(targetRow, targetColumn);

    if (targetCell.getDisplayValue()) {
      throw createOperationalError(
        input.type === 'clockIn'
          ? '해당 일자는 이미 출근 등록이 완료되었습니다.'
          : '해당 일자는 이미 퇴근 등록이 완료되었습니다.',
        input.type === 'clockIn' ? LOG_EVENTS.duplicateClockIn : LOG_EVENTS.duplicateClockOut
      );
    }

    targetCell
      .setValue(timeToSheetSerial(savedAt))
      .setNumberFormat('h:mm');

    appendAttendanceLog(ss, {
      dateText: formatDate(workDate),
      employeeId: employee.employeeId,
      name: employee.name,
      type: input.type === 'clockIn' ? LOG_EVENTS.clockIn : LOG_EVENTS.clockOut,
      savedTime: formatTime(savedAt),
      actualTime: formatTime(input.actualAt),
      gpsDistanceM: operationalSettings.gps.enabled ? input.gpsDistanceM : '',
      gpsVerified: operationalSettings.gps.enabled ? 'Y' : 'OFF',
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
      actualTime: formatTime(input.actualAt),
      gpsDistanceM: operationalSettings.gps.enabled ? input.gpsDistanceM : '',
      gpsEnabled: operationalSettings.gps.enabled,
      gpsAllowedRadiusM: operationalSettings.gps.allowedRadiusM
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
    throw new Error('등록된 사번을 찾을 수 없습니다.');
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
  const rows = filterAttendanceRowsByMonth(attendanceRows, year, month);
  const today = rows.filter(function (row) {
    return row.date === todayText;
  })[0] || emptyAttendanceRow(todayText);
  const summary = summarizeAttendanceRows(rows);
  const operationalSettings = readOperationalSettings_();

  return {
    employee,
    today,
    rows,
    summary,
    statistics: buildAttendanceStatistics(attendanceRows, rows, now),
    gps: {
      enabled: operationalSettings.gps.enabled,
      site: '',
      distanceM: null,
      allowedRadiusM: operationalSettings.gps.allowedRadiusM,
      locations: operationalSettings.gps.locations,
      verified: !operationalSettings.gps.enabled
    },
    operationalSettings,
    generatedAt: formatDateTime(new Date())
  };
}

function getMonthlyAttendance(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();
  const year = Number(input.year);
  const month = Number(input.month);

  if (!employeeId || !year || !month) {
    throw new Error('조회할 사번과 월을 확인해 주세요.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('등록된 사번을 찾을 수 없습니다.');
  }

  const sheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  const block = findEmployeeBlock(sheet, employee.name);
  const attendanceRows = readAttendanceRows(sheet, block);
  const rows = filterAttendanceRowsByMonth(attendanceRows, year, month);

  return {
    ok: true,
    employee,
    year,
    month,
    rows,
    summary: summarizeAttendanceRows(rows),
    statistics: buildAttendanceStatistics(attendanceRows, rows, new Date())
  };
}

function getAttendanceByRange(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();
  const startDate = parseIsoDateText(input.startDate);
  const endDate = parseIsoDateText(input.endDate);

  if (!employeeId || !startDate || !endDate) {
    throw new Error('조회할 사번과 기간을 확인해 주세요.');
  }

  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('시작일은 종료일보다 늦을 수 없습니다.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);

  if (!employee) {
    throw new Error('등록된 사번을 찾을 수 없습니다.');
  }

  const sheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  const block = findEmployeeBlock(sheet, employee.name);
  const attendanceRows = readAttendanceRows(sheet, block);
  const rows = filterAttendanceRowsByRange(attendanceRows, startDate, endDate);

  return {
    ok: true,
    employee,
    startDate: formatIsoDate(startDate),
    endDate: formatIsoDate(endDate),
    rows,
    summary: summarizeAttendanceRows(rows),
    statistics: buildAttendanceStatistics(attendanceRows, rows, endDate)
  };
}

function getAdminDashboard(request) {
  const input = request || {};
  const filters = {
    department: String(input.department || '').trim(),
    name: String(input.name || '').trim(),
    employeeId: String(input.employeeId || '').trim(),
    status: String(input.status || '').trim()
  };
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  const roster = readRosterEmployees(ss);
  const todayText = formatDate(new Date());
  const todayParsed = parseSheetDateText(todayText);
  const attendanceValues = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), sheet.getLastColumn()).getDisplayValues();
  const existingNames = getExistingEmployeeNamesFromHeader(attendanceValues[0] || []);
  const employeeBlocksByName = getEmployeeBlocksByNameFromValues(attendanceValues[0] || [], attendanceValues[1] || []);
  const todayRow = findDateRowValues(attendanceValues, todayText);
  const lastLogsByEmployeeId = getLastLogsByEmployeeId(ss);
  const departments = Array.from(new Set(roster
    .map(function (employee) { return employee.department; })
    .filter(Boolean))).sort();
  const rows = roster
    .filter(function (employee) {
      if (filters.department && filters.department !== '전체 부서' && employee.department !== filters.department) return false;
      if (filters.name && employee.name.indexOf(filters.name) < 0) return false;
      if (filters.employeeId && employee.employeeId.indexOf(filters.employeeId) < 0) return false;
      if (filters.status && filters.status !== '전체' && employee.status !== filters.status) return false;
      return true;
    })
    .map(function (employee) {
      const block = employee.name ? employeeBlocksByName[employee.name] : null;
      const day = block && todayRow ? buildAttendanceRow(todayText, todayParsed ? todayParsed.day : '', todayRow, block) : emptyAttendanceRow(todayText);
      const lastLog = employee.employeeId ? lastLogsByEmployeeId[employee.employeeId] : null;

      return {
        row: employee.row,
        department: employee.department,
        name: employee.name,
        employeeId: employee.employeeId,
        status: employee.status,
        clockIn: day.clockIn,
        clockOut: day.clockOut,
        early: day.early,
        overtime: day.overtime,
        ot: day.ot,
        leaveUsed: day.leaveUsed,
        gpsDistanceM: lastLog ? lastLog.gpsDistanceM : '',
        sheetsStatus: block ? '완료' : '대기'
      };
    });
  const activeEmployees = roster.filter(function (employee) {
    return employee.employeeId && employee.name && employee.status === LABELS.employed;
  });
  const todayRows = activeEmployees.map(function (employee) {
    const block = employeeBlocksByName[employee.name];
    return block && todayRow ? buildAttendanceRow(todayText, todayParsed ? todayParsed.day : '', todayRow, block) : emptyAttendanceRow(todayText);
  });
  const clockInCount = todayRows.filter(function (row) { return row.clockIn; }).length;
  const clockOutCount = todayRows.filter(function (row) { return row.clockOut; }).length;
  const pendingSync = activeEmployees.filter(function (employee) {
    return !existingNames.has(employee.name);
  });
  const attention = buildAdminAttention(rows, pendingSync);
  const passwordResetRequests = readOpenPasswordResetRequests(ss);

  return {
    ok: true,
    today: todayText,
    departments,
    rows,
    pendingSync,
    attention,
    passwordResetRequests,
    operationalSettings: readOperationalSettings_(),
    summary: {
      totalEmployees: activeEmployees.length,
      clockInCount,
      clockOutCount,
      absentCount: Math.max(activeEmployees.length - clockInCount, 0),
      attendanceRate: activeEmployees.length ? Math.round(clockInCount / activeEmployees.length * 1000) / 10 : 0
    },
    generatedAt: formatDateTime(new Date())
  };
}

function buildAdminAttention(rows, pendingSync) {
  const attention = [];

  if (pendingSync.length) {
    attention.push({
      badge: 'SYNC',
      title: '명단 동기화 필요',
      detail: pendingSync.length + '명의 직원이 ' + CONFIG.attendanceSheetName + ' 시트에 아직 반영되지 않았습니다.',
      status: '동기화'
    });
  }

  rows.forEach(function (row) {
    if (row.status !== LABELS.employed) {
      if (row.sheetsStatus === '완료') {
        attention.push({
          badge: 'OFF',
          title: row.name + ' 퇴사자 컬럼 확인',
          detail: '퇴사 처리된 직원입니다. 필요 시 ' + CONFIG.attendanceSheetName + ' 시트 컬럼 숨김 대상으로 관리합니다.',
          status: '확인'
        });
      }
      return;
    }

    if (!row.clockIn) {
      attention.push({
        badge: 'IN',
        title: row.name + ' 출근 미등록',
        detail: row.department + ' · ' + row.employeeId,
        status: '미등록'
      });
      return;
    }

    if (!row.clockOut) {
      attention.push({
        badge: 'OUT',
        title: row.name + ' 퇴근 미등록',
        detail: row.department + ' · ' + row.employeeId + ' · 출근 ' + row.clockIn,
        status: '대기'
      });
    }
  });

  return attention;
}

function getExistingEmployeeNamesFromHeader(names) {
  const existing = new Set();

  names.forEach(function (name) {
    const normalized = String(name || '').trim();
    if (normalized) {
      existing.add(normalized);
    }
  });

  return existing;
}

function getEmployeeBlocksByNameFromValues(names, headers) {
  const blocksByName = {};

  for (let index = 0; index < names.length; index += 1) {
    const employeeName = String(names[index] || '').trim();

    if (!employeeName) {
      continue;
    }

    const startColumn = index + 1;
    const headerSlice = headers.slice(index, index + 6);
    const clockInOffset = headerSlice.indexOf(LABELS.clockIn);
    const clockOutOffset = headerSlice.indexOf(LABELS.clockOut);

    if (clockInOffset < 0 || clockOutOffset < 0) {
      continue;
    }

    blocksByName[employeeName] = {
      startColumn,
      clockInColumn: startColumn + clockInOffset,
      clockOutColumn: startColumn + clockOutOffset
    };
  }

  return blocksByName;
}

function findDateRowValues(values, dateText) {
  for (let rowIndex = 2; rowIndex <= values.length; rowIndex += 1) {
    const row = values[rowIndex - 1];
    if (String(row[0] || '').trim() === dateText) {
      return row;
    }
  }

  return null;
}

function updateEmployeeStatus(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();
  const status = String(input.status || '').trim();

  if (!employeeId) {
    throw new Error('사번을 확인해 주세요.');
  }

  if (status !== LABELS.employed && status !== '퇴사') {
    throw new Error('재직상태는 재직 또는 퇴사만 사용할 수 있습니다.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = getRosterSheet(ss);
  const indexes = getRosterIndexes(sheet);
  const employees = readRosterEmployees(ss);
  const employee = employees.filter(function (item) {
    return item.employeeId === employeeId;
  })[0];

  if (!employee) {
    throw new Error('등록된 사번을 찾을 수 없습니다.');
  }

  sheet.getRange(employee.row, indexes.status + 1).setValue(status);
  SpreadsheetApp.flush();

  return {
    ok: true,
    employeeId,
    name: employee.name,
    status
  };
}

function normalizeAttendanceRequest(request) {
  const input = request || {};
  const type = String(input.type || '').trim();
  const employeeId = String(input.employeeId || '').trim();
  const password = String(input.password || '').trim();
  const actualAt = input.actualAt ? new Date(input.actualAt) : new Date();
  const gpsText = input.gpsDistanceM === null || input.gpsDistanceM === undefined || input.gpsDistanceM === ''
    ? ''
    : String(input.gpsDistanceM).trim();
  const gpsDistanceM = gpsText === '' ? null : Number(gpsText);
  const latitudeText = input.gpsLatitude === null || input.gpsLatitude === undefined || input.gpsLatitude === '' ? '' : String(input.gpsLatitude).trim();
  const longitudeText = input.gpsLongitude === null || input.gpsLongitude === undefined || input.gpsLongitude === '' ? '' : String(input.gpsLongitude).trim();
  const gpsLatitude = latitudeText === '' ? null : Number(latitudeText);
  const gpsLongitude = longitudeText === '' ? null : Number(longitudeText);

  if (!employeeId) {
    throw new Error('사번을 입력해 주세요.');
  }

  if (type !== 'clockIn' && type !== 'clockOut') {
    throw new Error('출근 또는 퇴근 유형을 확인해 주세요.');
  }

  if (Number.isNaN(actualAt.getTime())) {
    throw new Error('등록 시간을 확인해 주세요.');
  }

  if (gpsDistanceM !== null && !Number.isFinite(gpsDistanceM)) {
    throw new Error('GPS 거리 정보를 확인해 주세요.');
  }

  if (gpsLatitude !== null && !Number.isFinite(gpsLatitude)) {
    throw new Error('GPS 위도 정보를 확인해 주세요.');
  }

  if (gpsLongitude !== null && !Number.isFinite(gpsLongitude)) {
    throw new Error('GPS 경도 정보를 확인해 주세요.');
  }

  return {
    employeeId,
    password,
    type,
    actualAt,
    gpsDistanceM,
    gpsLatitude,
    gpsLongitude,
    device: String(input.device || '').trim()
  };
}

function getNearestGpsDistanceM_(latitude, longitude, locations) {
  const distances = (locations || []).map(function (location) {
    const earthRadiusM = 6371000;
    const toRadians = function (value) { return value * Math.PI / 180; };
    const latitudeDelta = toRadians(Number(location.latitude) - latitude);
    const longitudeDelta = toRadians(Number(location.longitude) - longitude);
    const a = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
      + Math.cos(toRadians(latitude)) * Math.cos(toRadians(Number(location.latitude)))
      * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
    return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  });
  if (!distances.length) throw new Error('등록된 사업장 위치가 없습니다.');
  return Math.round(Math.min.apply(null, distances));
}

function readRosterEmployees(ss) {
  const sheet = getRosterSheet(ss);
  const lastColumn = Math.max(sheet.getLastColumn(), 4);
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastColumn).getDisplayValues();
  const indexes = getRosterIndexesFromHeaders(values[0] || [], sheet.getName());
  const employees = [];

  for (let row = 2; row <= values.length; row += 1) {
    const employeeId = String(values[row - 1][indexes.employeeId] || '').trim();
    const name = String(values[row - 1][indexes.name] || '').trim();

    if (!employeeId && !name) {
      continue;
    }

    employees.push({
      row,
      department: String(values[row - 1][indexes.department] || '').trim(),
      name,
      employeeId,
      status: String(values[row - 1][indexes.status] || '').trim(),
      passwordHash: indexes.passwordHash >= 0 ? String(values[row - 1][indexes.passwordHash] || '').trim() : '',
      passwordChangeRequired: indexes.passwordChangeRequired >= 0 ? String(values[row - 1][indexes.passwordChangeRequired] || '').trim() : ''
    });
  }

  return employees;
}

function getRosterIndexes(sheet, ensureSecurityColumns) {
  if (ensureSecurityColumns) {
    ensureRosterSecurityColumns(sheet);
  }

  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 4)).getDisplayValues()[0];
  return getRosterIndexesFromHeaders(headers, sheet.getName());
}

function getRosterIndexesFromHeaders(headers, sheetName) {
  const indexes = {
    department: headers.indexOf(LABELS.department),
    name: headers.indexOf(LABELS.name),
    employeeId: headers.indexOf(LABELS.employeeId),
    status: headers.indexOf(LABELS.status),
    passwordHash: headers.indexOf(LABELS.passwordHash),
    passwordChangeRequired: headers.indexOf(LABELS.passwordChangeRequired),
    passwordResetAt: headers.indexOf(LABELS.passwordResetAt)
  };

  Object.keys(indexes).forEach(function (key) {
    if (key === 'passwordHash' || key === 'passwordChangeRequired' || key === 'passwordResetAt') {
      return;
    }

    if (indexes[key] < 0) {
      throw new Error(sheetName + ' 시트의 필수 컬럼을 확인해 주세요.');
    }
  });

  return indexes;
}

function getRosterSheet(ss) {
  for (let index = 0; index < CONFIG.rosterSheetCandidates.length; index += 1) {
    const sheet = ss.getSheetByName(CONFIG.rosterSheetCandidates[index]);
    if (sheet) {
      return sheet;
    }
  }

  throw new Error('직원관리(Master) 또는 직원 사번 명단 시트를 찾을 수 없습니다.');
}

function ensureRosterSecurityColumns(sheet) {
  const requiredHeaders = [LABELS.passwordHash, LABELS.passwordChangeRequired, LABELS.passwordResetAt];
  let headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 4)).getDisplayValues()[0];

  requiredHeaders.forEach(function (header) {
    if (headers.indexOf(header) >= 0) {
      return;
    }

    const targetColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, targetColumn).setValue(header);
    headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 4)).getDisplayValues()[0];
  });
}

function verifyEmployeePassword(employee, password) {
  const safePassword = String(password || '').trim();

  if (!safePassword) {
    return { ok: false, mustChangePassword: false };
  }

  const storedHash = String(employee.passwordHash || '').trim();
  const defaultPassword = employee.employeeId;
  const mustChangePassword = shouldChangePassword(employee);

  if (!storedHash) {
    return {
      ok: safePassword === defaultPassword,
      mustChangePassword: true
    };
  }

  return {
    ok: storedHash === hashPassword(employee.employeeId, safePassword),
    mustChangePassword
  };
}

function shouldChangePassword(employee) {
  const flag = String(employee.passwordChangeRequired || '').trim().toUpperCase();
  return !employee.passwordHash || flag === 'Y' || flag === 'YES' || flag === 'TRUE' || flag === '필요';
}

function isValidNewPassword(password) {
  const value = String(password || '').trim();
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

function hashPassword(employeeId, password) {
  const raw = String(employeeId || '') + ':' + String(password || '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);

  return bytes.map(function (byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function ensurePasswordResetSheet(ss) {
  let sheet = ss.getSheetByName(CONFIG.passwordResetSheetName);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.passwordResetSheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['요청일시', LABELS.employeeId, LABELS.name, LABELS.department, '상태', '처리일시', '처리자']);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readOpenPasswordResetRequests(ss) {
  const sheet = ensurePasswordResetSheet(ss);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
  const requests = [];

  values.forEach(function (row, index) {
    if (String(row[4] || '').trim() !== '대기') {
      return;
    }

    requests.push({
      row: index + 2,
      requestedAt: row[0],
      employeeId: row[1],
      name: row[2],
      department: row[3],
      status: row[4]
    });
  });

  return requests;
}

function closePasswordResetRequests(ss, employeeId, adminEmployeeId) {
  const sheet = ensurePasswordResetSheet(ss);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();

  values.forEach(function (row, index) {
    const targetRow = index + 2;
    if (String(row[1] || '').trim() === employeeId && String(row[4] || '').trim() === '대기') {
      sheet.getRange(targetRow, 5, 1, 3).setValues([['완료', formatDateTime(new Date()), adminEmployeeId]]);
    }
  });
}

function findEmployeeById(ss, employeeId) {
  const employees = readRosterEmployees(ss);

  for (let index = 0; index < employees.length; index += 1) {
    if (employees[index].employeeId === employeeId) {
      return employees[index];
    }
  }

  return null;
}

function getExistingEmployeeNames(sheet) {
  const lastColumn = sheet.getLastColumn();
  const names = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const existing = new Set();

  names.forEach(function (name) {
    const normalized = String(name || '').trim();
    if (normalized) {
      existing.add(normalized);
    }
  });

  return existing;
}

function addEmployeeBlock(sheet, employee) {
  const templateStart = findLastEmployeeBlockStart(sheet);
  const targetStart = templateStart + 6;
  const requiredLastColumn = targetStart + 5;

  if (requiredLastColumn > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredLastColumn - sheet.getMaxColumns());
  }

  const maxRows = sheet.getMaxRows();
  const templateRange = sheet.getRange(1, templateStart, maxRows, 6);
  const targetRange = sheet.getRange(1, targetStart, maxRows, 6);
  templateRange.copyTo(targetRange, { contentsOnly: false });

  sheet.getRange(1, targetStart, 1, 6).breakApart().mergeAcross().setValue(employee.name);
  sheet.getRange(2, targetStart, 1, 6).setValues([[
    LABELS.clockIn,
    LABELS.clockOut,
    LABELS.early,
    LABELS.overtime,
    LABELS.ot,
    LABELS.leaveUsed
  ]]);

  if (maxRows > 2) {
    sheet.getRange(3, targetStart, maxRows - 2, 2).clearContent();
    sheet.getRange(3, targetStart + 5, maxRows - 2, 1).clearContent();
  }

  for (let offset = 0; offset < 6; offset += 1) {
    sheet.setColumnWidth(targetStart + offset, sheet.getColumnWidth(templateStart + offset));
  }

  return {
    startColumn: targetStart,
    clockInColumn: targetStart,
    clockOutColumn: targetStart + 1
  };
}

function findLastEmployeeBlockStart(sheet) {
  const lastColumn = sheet.getLastColumn();
  const names = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];

  for (let index = names.length - 1; index >= 1; index -= 1) {
    if (String(names[index] || '').trim()) {
      return index + 1;
    }
  }

  throw new Error('복사할 직원 컬럼 블록을 찾을 수 없습니다.');
}

function findEmployeeBlock(sheet, employeeName) {
  const block = findEmployeeBlockOrNull(sheet, employeeName);

  if (!block) {
    throw new Error(employeeName + ' 직원 컬럼을 ' + CONFIG.attendanceSheetName + ' 시트에서 찾을 수 없습니다.');
  }

  return block;
}

function findEmployeeBlockOrNull(sheet, employeeName) {
  const lastColumn = sheet.getLastColumn();
  const headerRows = sheet.getRange(1, 1, 2, lastColumn).getDisplayValues();
  const names = headerRows[0] || [];
  const headers = headerRows[1] || [];

  for (let index = 0; index < names.length; index += 1) {
    if (String(names[index] || '').trim() === employeeName) {
      const startColumn = index + 1;
      const headerSlice = headers.slice(index, index + 6);
      const clockInOffset = headerSlice.indexOf(LABELS.clockIn);
      const clockOutOffset = headerSlice.indexOf(LABELS.clockOut);

      if (clockInOffset < 0 || clockOutOffset < 0) {
        throw new Error(employeeName + ' 직원의 출근/퇴근 컬럼을 찾을 수 없습니다.');
      }

      return {
        startColumn,
        clockInColumn: startColumn + clockInOffset,
        clockOutColumn: startColumn + clockOutOffset
      };
    }
  }

  return null;
}

function findOrCreateDateRow(sheet, dateValue) {
  const targetText = formatDate(dateValue);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const dateValues = sheet.getRange(1, 1, lastRow, 1).getDisplayValues();

  for (let row = 2; row <= dateValues.length; row += 1) {
    if (String(dateValues[row - 1][0] || '').trim() === targetText) {
      return row;
    }
  }

  for (let row = 3; row <= lastRow; row += 1) {
    if (!String(dateValues[row - 1][0] || '').trim()) {
      sheet.getRange(row, 1)
        .setValue(stripTime(dateValue))
        .setNumberFormat('yyyy. m. d');
      return row;
    }
  }

  const newRow = lastRow + 1;
  sheet.getRange(newRow, 1)
    .setValue(stripTime(dateValue))
    .setNumberFormat('yyyy. m. d');
  return newRow;
}

function readAttendanceRows(sheet, block) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const requiredColumns = block.startColumn + 5;
  const values = sheet.getRange(1, 1, lastRow, requiredColumns).getDisplayValues();
  const rows = [];

  for (let rowIndex = 2; rowIndex <= values.length; rowIndex += 1) {
    const row = values[rowIndex - 1];
    const dateText = String(row[0] || '').trim();
    const parsed = parseSheetDateText(dateText);

    if (!parsed) {
      continue;
    }

    rows.push(buildAttendanceRow(dateText, parsed.day, row, block));
  }

  return rows.sort(function (left, right) {
    return attendanceDateToTimestamp(left.date) - attendanceDateToTimestamp(right.date);
  });
}

function filterAttendanceRowsByMonth(rows, year, month) {
  return rows.filter(function (row) {
    const parsed = parseSheetDateText(row.date);
    return parsed && parsed.year === year && parsed.month === month;
  });
}

function filterAttendanceRowsByRange(rows, startDate, endDate) {
  const startTimestamp = stripTime(startDate).getTime();
  const endTimestamp = stripTime(endDate).getTime();

  return rows.filter(function (row) {
    const timestamp = attendanceDateToTimestamp(row.date);
    return timestamp >= startTimestamp && timestamp <= endTimestamp;
  });
}

function buildAttendanceRow(dateText, day, row, block) {
  const start = block.startColumn - 1;
  const clockIn = cleanSheetDisplay(row[start]);
  const clockOut = cleanSheetDisplay(row[start + 1]);
  const early = cleanSheetDisplay(row[start + 2]);
  const overtime = cleanSheetDisplay(row[start + 3]);
  const ot = cleanSheetDisplay(row[start + 4]);
  const leaveUsed = cleanSheetDisplay(row[start + 5]);

  return {
    date: dateText,
    day,
    clockIn,
    clockOut,
    early,
    overtime,
    ot,
    leaveUsed,
    workTime: formatDurationMinutes(computeWorkMinutes(clockIn, clockOut))
  };
}

function emptyAttendanceRow(dateText) {
  const parsed = parseSheetDateText(dateText);

  return {
    date: dateText,
    day: parsed ? parsed.day : '',
    clockIn: '',
    clockOut: '',
    early: '',
    overtime: '',
    ot: '',
    leaveUsed: '',
    workTime: '0:00'
  };
}

function summarizeAttendanceRows(rows) {
  const totals = rows.reduce(function (summary, row) {
    const hasWork = Boolean(row.clockIn || row.clockOut);
    summary.workDays += hasWork ? 1 : 0;
    summary.workMinutes += durationTextToMinutes(row.workTime);
    summary.earlyMinutes += durationTextToMinutes(row.early);
    summary.overtimeMinutes += durationTextToMinutes(row.overtime);
    summary.otMinutes += durationTextToMinutes(row.ot);
    summary.leaveUsed += Number(row.leaveUsed || 0) || 0;
    return summary;
  }, {
    workDays: 0,
    workMinutes: 0,
    earlyMinutes: 0,
    overtimeMinutes: 0,
    otMinutes: 0,
    leaveUsed: 0
  });

  return {
    workDays: totals.workDays,
    workTime: formatDurationMinutes(totals.workMinutes),
    early: formatDurationMinutes(totals.earlyMinutes),
    overtime: formatDurationMinutes(totals.overtimeMinutes),
    ot: formatDurationMinutes(totals.otMinutes),
    leaveUsed: String(Math.round(totals.leaveUsed * 10) / 10),
    leaveRemain: String(Math.max(0, Math.round((15 - totals.leaveUsed) * 10) / 10))
  };
}

function buildAttendanceStatistics(attendanceRows, monthRows, now) {
  const monthly = summarizeAttendanceRows(monthRows);
  const monthWorkMinutes = durationTextToMinutes(monthly.workTime);
  const completedWorkDays = monthRows.filter(function (row) {
    return durationTextToMinutes(row.workTime) > 0;
  }).length;
  const weekRange = getCurrentWeekRange(now);
  const weekWorkMinutes = attendanceRows.reduce(function (total, row) {
    const timestamp = attendanceDateToTimestamp(row.date);
    if (timestamp < weekRange.start || timestamp > weekRange.end) {
      return total;
    }
    return total + durationTextToMinutes(row.workTime);
  }, 0);

  return {
    weekWorkTime: formatDurationMinutes(weekWorkMinutes),
    monthWorkTime: monthly.workTime,
    averageDailyWorkTime: formatDurationMinutes(
      completedWorkDays ? Math.round(monthWorkMinutes / completedWorkDays) : 0
    )
  };
}

function getCurrentWeekRange(value) {
  const current = stripTime(value instanceof Date ? value : new Date());
  const mondayOffset = current.getDay() === 0 ? 6 : current.getDay() - 1;
  const start = new Date(current);
  start.setDate(current.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start: start.getTime(), end: end.getTime() };
}

function attendanceDateToTimestamp(value) {
  const parsed = parseSheetDateText(value);
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day).getTime() : 0;
}

function getLastLogsByEmployeeId(ss) {
  const sheet = getAttendanceLogSheet(ss);
  const lastRow = sheet.getLastRow();
  const logsByEmployeeId = {};

  if (lastRow < 2) {
    return logsByEmployeeId;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 12).getDisplayValues();

  values.forEach(function (row) {
    const employeeId = String(row[1] || '').trim();
    if (!employeeId) {
      return;
    }

    logsByEmployeeId[employeeId] = {
      date: row[0],
      type: row[3],
      gpsDistanceM: row[6],
      gpsVerified: row[7],
      registeredAt: row[9]
    };
  });

  return logsByEmployeeId;
}

function createOperationalError(message, eventType, skipOperationalLog) {
  const error = new Error(message);
  error.logEventType = eventType || '';
  error.skipOperationalLog = Boolean(skipOperationalLog);
  return error;
}

function appendOperationalFailure(ss, context) {
  try {
    const details = context || {};
    const input = details.input || {};
    const employee = details.employee || {};
    const actualAt = input.actualAt instanceof Date && !Number.isNaN(input.actualAt.getTime())
      ? input.actualAt
      : new Date();
    const baseType = details.eventType || LOG_EVENTS.systemError;
    const errorText = details.error && details.error.message
      ? String(details.error.message).replace(/\s+/g, ' ').trim().slice(0, 120)
      : '';
    const type = baseType === LOG_EVENTS.systemError && errorText
      ? baseType + ' - ' + errorText
      : baseType;
    const hasGps = input.gpsDistanceM !== null && input.gpsDistanceM !== '' && Number.isFinite(Number(input.gpsDistanceM));
    const operationalSettings = readOperationalSettings_();

    appendAttendanceLog(ss, {
      dateText: formatDate(actualAt),
      employeeId: String(details.employeeId || employee.employeeId || input.employeeId || '').trim(),
      name: String(employee.name || '').trim(),
      type,
      savedTime: input.actualAt ? formatTime(floorToHalfHour(actualAt)) : '',
      actualTime: formatTime(actualAt),
      gpsDistanceM: hasGps ? Number(input.gpsDistanceM) : '',
      gpsVerified: operationalSettings.gps.enabled
        ? (hasGps ? (Number(input.gpsDistanceM) <= operationalSettings.gps.allowedRadiusM ? 'Y' : 'N') : 'N')
        : 'OFF',
      device: String(details.device || input.device || 'LogiFlow PWA').trim(),
      registeredAt: new Date(),
      updatedAt: '',
      updatedBy: ''
    });
  } catch (logError) {
    console.error('Attendance log write failed: ' + (logError.message || logError));
  }
}

function appendAttendanceLog(ss, entry) {
  const sheet = getAttendanceLogSheet(ss);
  sheet.appendRow([
    entry.dateText,
    entry.employeeId,
    entry.name,
    entry.type,
    entry.savedTime,
    entry.actualTime,
    entry.gpsDistanceM,
    entry.gpsVerified,
    entry.device,
    formatDateTime(entry.registeredAt),
    entry.updatedAt,
    entry.updatedBy
  ]);
}

function getAttendanceLogSheet(ss) {
  return getRequiredSheet(ss, CONFIG.logSheetName);
}

function getRequiredSheet(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(sheetName + ' 시트를 찾을 수 없습니다.');
  }

  return sheet;
}
