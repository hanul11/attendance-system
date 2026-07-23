const NOTIFICATION_CONFIG = Object.freeze({
  timezone: 'Asia/Seoul',
  apiBaseUrlProperty: 'LOGIFLOW_NOTIFICATION_API_BASE_URL',
  bridgeSecretProperty: 'LOGIFLOW_NOTIFICATION_BRIDGE_SECRET',
  schedule: Object.freeze({
    CHECKIN_NOTICE: Object.freeze({ hour: 7, minute: 0, handler: 'scheduledCheckinNotice_' }),
    CHECKIN_REMINDER: Object.freeze({ hour: 9, minute: 0, handler: 'scheduledCheckinReminder_' }),
    CHECKOUT_NOTICE: Object.freeze({ hour: 18, minute: 0, handler: 'scheduledCheckoutNotice_' }),
    CHECKOUT_REMINDER: Object.freeze({ hour: 20, minute: 0, handler: 'scheduledCheckoutReminder_' })
  })
});

function bindCurrentNotificationInstallation(payload) {
  const installation = validateCurrentNotificationInstallation_(payload);
  return postNotificationApi_('bindNotificationInstallation', {
    installId: installation.installId,
    employeeId: installation.employee.employeeId
  });
}

function deactivateCurrentNotificationInstallation(payload) {
  const installation = validateCurrentNotificationInstallation_(payload);
  return postNotificationApi_('deactivateNotificationInstallation', {
    installId: installation.installId,
    employeeId: installation.employee.employeeId
  });
}

function validateCurrentNotificationInstallation_(payload) {
  const input = payload || {};
  const installId = String(input.installId || '').trim();
  const employeeId = String(input.employeeId || '').trim();
  if (!installId || !employeeId) {
    throw new Error('Notification installation and employee ID are required.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);
  if (!employee || employee.status !== LABELS.employed) {
    throw new Error('Only active roster employees can manage notification installations.');
  }

  return { installId: installId, employee: employee };
}

function updateNotificationPreferences(request) {
  const input = request || {};
  const employeeId = String(input.employeeId || '').trim();
  if (!employeeId) {
    throw new Error('알림 설정 사번을 확인해 주세요.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const employee = findEmployeeById(ss, employeeId);
  if (!employee || employee.status !== LABELS.employed) {
    throw new Error('재직 상태인 직원만 알림 설정을 변경할 수 있습니다.');
  }

  return postNotificationApi_('updateNotificationPreferences', {
    employeeId: employeeId,
    preferences: normalizeNotificationPreferences_(input.preferences)
  });
}

function scheduledCheckinNotice_() {
  return dispatchScheduledNotification_('CHECKIN_NOTICE', 'all');
}

function scheduledCheckinReminder_() {
  return dispatchScheduledNotification_('CHECKIN_REMINDER', 'missingCheckin');
}

function scheduledCheckoutNotice_() {
  return dispatchScheduledNotification_('CHECKOUT_NOTICE', 'all');
}

function scheduledCheckoutReminder_() {
  return dispatchScheduledNotification_('CHECKOUT_REMINDER', 'missingCheckout');
}

function setupNotificationTriggers() {
  const scheduleEntries = Object.keys(NOTIFICATION_CONFIG.schedule).map(function (key) {
    return NOTIFICATION_CONFIG.schedule[key];
  });
  const handlerNames = scheduleEntries.map(function (entry) { return entry.handler; });

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlerNames.indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  scheduleEntries.forEach(function (entry) {
    ScriptApp.newTrigger(entry.handler)
      .timeBased()
      .atHour(entry.hour)
      .nearMinute(entry.minute)
      .everyDays(1)
      .inTimezone(NOTIFICATION_CONFIG.timezone)
      .create();
  });

  return scheduleEntries.map(function (entry) {
    return { handler: entry.handler, hour: entry.hour, minute: entry.minute };
  });
}

function dispatchScheduledNotification_(notificationKey, audience) {
  const employeeIds = getNotificationRecipientIds_(audience);
  const response = postNotificationApi_('dispatchAttendanceNotification', {
    notificationKey: notificationKey,
    employeeIds: employeeIds,
    requestedAt: new Date().toISOString()
  });

  console.log(JSON.stringify({
    event: 'FCM_DISPATCH',
    notificationKey: notificationKey,
    audience: audience,
    employeeCount: employeeIds.length,
    response: response
  }));
  return response;
}

function getNotificationRecipientIds_(audience) {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const activeEmployees = readRosterEmployees(ss).filter(function (employee) {
    return employee.employeeId && employee.name && employee.status === LABELS.employed;
  });

  if (audience === 'all') {
    return activeEmployees.map(function (employee) { return employee.employeeId; });
  }

  const sheet = getRequiredSheet(ss, CONFIG.attendanceSheetName);
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), sheet.getLastColumn()).getDisplayValues();
  const blocks = getEmployeeBlocksByNameFromValues(values[0] || [], values[1] || []);
  const todayText = formatDate(new Date());
  const todayParsed = parseSheetDateText(todayText);
  const todayRow = findDateRowValues(values, todayText);

  return activeEmployees.filter(function (employee) {
    const block = blocks[employee.name];
    const attendance = block && todayRow
      ? buildAttendanceRow(todayText, todayParsed ? todayParsed.day : '', todayRow, block)
      : emptyAttendanceRow(todayText);

    if (audience === 'missingCheckin') {
      return !attendance.clockIn;
    }
    if (audience === 'missingCheckout') {
      return Boolean(attendance.clockIn) && !attendance.clockOut;
    }
    return false;
  }).map(function (employee) {
    return employee.employeeId;
  });
}

function normalizeNotificationPreferences_(preferences) {
  const source = preferences || {};
  return {
    checkin: source.checkin !== false,
    checkout: source.checkout !== false
  };
}

function postNotificationApi_(functionName, payload) {
  const properties = PropertiesService.getScriptProperties();
  const apiBaseUrl = String(properties.getProperty(NOTIFICATION_CONFIG.apiBaseUrlProperty) || '').replace(/\/$/, '');
  const bridgeSecret = String(properties.getProperty(NOTIFICATION_CONFIG.bridgeSecretProperty) || '');

  if (!apiBaseUrl || !bridgeSecret) {
    return { ok: false, configured: false, reason: 'FIREBASE_BRIDGE_NOT_CONFIGURED' };
  }

  const response = UrlFetchApp.fetch(apiBaseUrl + '/' + functionName, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-logiflow-secret': bridgeSecret },
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  let result = {};

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    result = { message: responseText };
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('알림 서버 요청에 실패했습니다. (' + statusCode + ')');
  }

  return Object.assign({ configured: true }, result);
}
