var ATTENDANCE_REQUEST_PREFIX_ = '\uADFC\uD0DC \uC218\uC815 \uC694\uCCAD';
var ATTENDANCE_REQUEST_KINDS_ = Object.freeze(['clockIn', 'clockOut', 'leave']);

function buildLeaveCandidates_(attendanceRows, holidayMap, now) {
  const todayTimestamp = stripTime(now instanceof Date ? now : new Date()).getTime();
  const holidays = holidayMap || {};

  return (attendanceRows || []).filter(function (row) {
    const parsed = parseSheetDateText(row.date);
    if (!parsed || attendanceDateToTimestamp(row.date) >= todayTimestamp) {
      return false;
    }

    const date = new Date(parsed.year, parsed.month - 1, parsed.day);
    const day = date.getDay();
    return day !== 0
      && day !== 6
      && !holidays[row.date]
      && !row.clockIn
      && !row.clockOut
      && !row.leaveUsed;
  }).map(function (row) {
    return {
      date: row.date,
      holidayName: '',
      status: 'confirmationRequired'
    };
  });
}

function submitAttendanceCorrectionRequest(request) {
  const input = normalizeAttendanceCorrectionRequest_(request);
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, input.employeeId);

  if (!employee || employee.status !== LABELS.employed) {
    throw new Error('\uC7AC\uC9C1 \uC911\uC778 \uC9C1\uC6D0 \uC815\uBCF4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.');
  }

  const sheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  const block = findEmployeeBlock(sheet, employee.name);
  const attendanceRows = readAttendanceRows(sheet, block);
  const targetRow = attendanceRows.filter(function (row) {
    return row.date === input.targetDate;
  })[0];

  if (!targetRow) {
    throw new Error('\uC694\uCCAD\uD55C \uB0A0\uC9DC\uC758 \uADFC\uD0DC \uD589\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.');
  }

  const attendanceRowsByEmployee = {};
  attendanceRowsByEmployee[employee.employeeId] = attendanceRows;
  if (findPendingAttendanceRequest_(ss, attendanceRowsByEmployee, employee.employeeId, input.targetDate, input.kind)) {
    throw new Error('\uAC19\uC740 \uB0A0\uC9DC\uC640 \uD56D\uBAA9\uC73C\uB85C \uC811\uC218\uB41C \uC694\uCCAD\uC774 \uC774\uBBF8 \uC788\uC2B5\uB2C8\uB2E4.');
  }

  const currentValue = getAttendanceRequestCurrentValue_(targetRow, input.kind);
  appendAttendanceLog(ss, {
    dateText: input.targetDate,
    employeeId: employee.employeeId,
    name: employee.name,
    type: ATTENDANCE_REQUEST_PREFIX_ + ' [' + input.kind + '] ' + input.reason,
    savedTime: currentValue,
    actualTime: input.requestedValue,
    device: input.device || 'LogiFlow PWA',
    registeredAt: new Date(),
    updatedAt: '',
    updatedBy: ''
  });

  return {
    ok: true,
    employeeId: employee.employeeId,
    targetDate: input.targetDate,
    kind: input.kind,
    requestedValue: input.requestedValue,
    message: '\uADFC\uD0DC \uC218\uC815 \uC694\uCCAD\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'
  };
}

function readPendingAttendanceRequests_(ss, attendanceRowsByEmployee) {
  const sheet = getAttendanceLogSheet(ss);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 12).getDisplayValues();
  return values.reduce(function (requests, row, index) {
    const parsedType = parseAttendanceRequestType_(row[3]);
    if (!parsedType) {
      return requests;
    }

    const employeeId = String(row[1] || '').trim();
    const targetDate = String(row[0] || '').trim();
    const requestedValue = String(row[5] || '').trim();
    const attendanceRows = (attendanceRowsByEmployee || {})[employeeId] || [];
    const attendanceRow = attendanceRows.filter(function (item) {
      return item.date === targetDate;
    })[0];

    if (attendanceRequestIsResolved_(attendanceRow, parsedType.kind, requestedValue)) {
      return requests;
    }

    requests.push({
      row: index + 2,
      targetDate,
      employeeId,
      name: String(row[2] || '').trim(),
      kind: parsedType.kind,
      reason: parsedType.reason,
      currentValue: String(row[4] || '').trim(),
      requestedValue,
      device: String(row[8] || '').trim(),
      requestedAt: String(row[9] || '').trim(),
      status: 'pending'
    });
    return requests;
  }, []);
}

function findPendingAttendanceRequest_(ss, attendanceRowsByEmployee, employeeId, targetDate, kind) {
  return readPendingAttendanceRequests_(ss, attendanceRowsByEmployee).filter(function (request) {
    return request.employeeId === employeeId
      && request.targetDate === targetDate
      && request.kind === kind;
  })[0] || null;
}

function normalizeAttendanceCorrectionRequest_(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();
  const targetDate = normalizeAttendanceRequestDate_(input.targetDate);
  const kind = String(input.kind || '').trim();
  const reason = sanitizeRequestReason_(input.reason);
  let requestedValue = String(input.requestedValue || '').trim();

  if (!employeeId || !targetDate) {
    throw new Error('\uC0AC\uBC88\uACFC \uC694\uCCAD \uB0A0\uC9DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.');
  }

  if (ATTENDANCE_REQUEST_KINDS_.indexOf(kind) < 0) {
    throw new Error('\uC218\uC815\uD560 \uADFC\uD0DC \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.');
  }

  if (!reason || reason.length < 2) {
    throw new Error('\uC694\uCCAD \uC0AC\uC720\uB97C 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574 \uC8FC\uC138\uC694.');
  }

  if (kind === 'clockIn' || kind === 'clockOut') {
    requestedValue = normalizeHalfHourTime_(requestedValue);
    if (!requestedValue) {
      throw new Error('\uC694\uCCAD \uC2DC\uAC04\uC744 30\uBD84 \uB2E8\uC704\uB85C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.');
    }
  } else {
    requestedValue = requestedValue === '0.5' ? '0.5' : '1';
  }

  return {
    employeeId,
    targetDate,
    kind,
    reason,
    requestedValue,
    device: String(input.device || '').trim()
  };
}

function normalizeAttendanceRequestDate_(value) {
  const sheetDate = parseSheetDateText(value);
  if (sheetDate) {
    return sheetDate.year + '. ' + sheetDate.month + '. ' + sheetDate.day;
  }

  const isoDate = parseIsoDateText(value);
  return isoDate ? formatDate(isoDate) : '';
}

function normalizeHalfHourTime_(value) {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null || minutes < 0 || minutes >= 24 * 60 || minutes % 30 !== 0) {
    return '';
  }
  return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0');
}

function sanitizeRequestReason_(value) {
  return String(value || '')
    .replace(/[\[\]\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function parseAttendanceRequestType_(value) {
  const text = String(value || '').trim();
  if (text.indexOf(ATTENDANCE_REQUEST_PREFIX_ + ' [') !== 0) {
    return null;
  }

  const match = text.match(/\[(clockIn|clockOut|leave)\]\s*(.*)$/);
  return match ? { kind: match[1], reason: String(match[2] || '').trim() } : null;
}

function attendanceRequestIsResolved_(attendanceRow, kind, requestedValue) {
  if (!attendanceRow) {
    return false;
  }
  if (kind === 'leave') {
    return Boolean(attendanceRow.leaveUsed);
  }
  return normalizeHalfHourTime_(getAttendanceRequestCurrentValue_(attendanceRow, kind)) === normalizeHalfHourTime_(requestedValue);
}

function getAttendanceRequestCurrentValue_(attendanceRow, kind) {
  if (!attendanceRow) {
    return '';
  }
  if (kind === 'clockIn') {
    return attendanceRow.clockIn || '';
  }
  if (kind === 'clockOut') {
    return attendanceRow.clockOut || '';
  }
  return attendanceRow.leaveUsed || '';
}
