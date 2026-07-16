var OPERATIONAL_PROPERTY_KEYS = Object.freeze({
  checkinNoticeEnabled: 'LOGIFLOW_CHECKIN_NOTICE_ENABLED',
  checkoutNoticeEnabled: 'LOGIFLOW_CHECKOUT_NOTICE_ENABLED',
  checkinReminderEnabled: 'LOGIFLOW_CHECKIN_REMINDER_ENABLED',
  checkoutReminderEnabled: 'LOGIFLOW_CHECKOUT_REMINDER_ENABLED',
  checkinNoticeTime: 'LOGIFLOW_CHECKIN_NOTICE_TIME',
  checkinReminderTime: 'LOGIFLOW_CHECKIN_REMINDER_TIME',
  checkoutNoticeTime: 'LOGIFLOW_CHECKOUT_NOTICE_TIME',
  checkoutReminderTime: 'LOGIFLOW_CHECKOUT_REMINDER_TIME'
});

var OPERATIONAL_DEFAULTS = Object.freeze({
  checkinNoticeEnabled: true,
  checkoutNoticeEnabled: true,
  checkinReminderEnabled: true,
  checkoutReminderEnabled: true,
  checkinNoticeTime: '07:00',
  checkinReminderTime: '09:00',
  checkoutNoticeTime: '18:00',
  checkoutReminderTime: '20:00'
});

function getOperationalSettings() {
  return readOperationalSettings_();
}

function saveOperationalSettings(request) {
  const input = request || {};
  const adminEmployeeId = String(input.adminEmployeeId || '').trim();
  if (adminEmployeeId !== CONFIG.adminEmployeeId) {
    throw new Error('\uAD00\uB9AC\uC790 \uACC4\uC815\uC5D0\uC11C\uB9CC \uC6B4\uC601 \uC124\uC815\uC744 \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');
  }

  const notifications = input.notifications || {};

  const values = {};
  values[OPERATIONAL_PROPERTY_KEYS.checkinNoticeEnabled] = String(normalizeRequestBoolean_(notifications.checkinNoticeEnabled));
  values[OPERATIONAL_PROPERTY_KEYS.checkoutNoticeEnabled] = String(normalizeRequestBoolean_(notifications.checkoutNoticeEnabled));
  values[OPERATIONAL_PROPERTY_KEYS.checkinReminderEnabled] = String(normalizeRequestBoolean_(notifications.checkinReminderEnabled));
  values[OPERATIONAL_PROPERTY_KEYS.checkoutReminderEnabled] = String(normalizeRequestBoolean_(notifications.checkoutReminderEnabled));
  values[OPERATIONAL_PROPERTY_KEYS.checkinNoticeTime] = normalizeOperationalTime_(notifications.checkinNoticeTime, '07:00');
  values[OPERATIONAL_PROPERTY_KEYS.checkinReminderTime] = normalizeOperationalTime_(notifications.checkinReminderTime, '09:00');
  values[OPERATIONAL_PROPERTY_KEYS.checkoutNoticeTime] = normalizeOperationalTime_(notifications.checkoutNoticeTime, '18:00');
  values[OPERATIONAL_PROPERTY_KEYS.checkoutReminderTime] = normalizeOperationalTime_(notifications.checkoutReminderTime, '20:00');

  PropertiesService.getScriptProperties().setProperties(values, false);
  return { ok: true, settings: readOperationalSettings_() };
}

function readOperationalSettings_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const values = scriptProperties.getProperties();
  const missingDefaults = buildMissingOperationalDefaults_(values);
  if (Object.keys(missingDefaults).length) {
    scriptProperties.setProperties(missingDefaults, false);
    Object.assign(values, missingDefaults);
  }
  return {
    notifications: {
      checkinNoticeEnabled: readBooleanProperty_(values, OPERATIONAL_PROPERTY_KEYS.checkinNoticeEnabled, OPERATIONAL_DEFAULTS.checkinNoticeEnabled),
      checkoutNoticeEnabled: readBooleanProperty_(values, OPERATIONAL_PROPERTY_KEYS.checkoutNoticeEnabled, OPERATIONAL_DEFAULTS.checkoutNoticeEnabled),
      checkinReminderEnabled: readBooleanProperty_(values, OPERATIONAL_PROPERTY_KEYS.checkinReminderEnabled, OPERATIONAL_DEFAULTS.checkinReminderEnabled),
      checkoutReminderEnabled: readBooleanProperty_(values, OPERATIONAL_PROPERTY_KEYS.checkoutReminderEnabled, OPERATIONAL_DEFAULTS.checkoutReminderEnabled),
      checkinNoticeTime: normalizeOperationalTime_(values[OPERATIONAL_PROPERTY_KEYS.checkinNoticeTime], OPERATIONAL_DEFAULTS.checkinNoticeTime),
      checkinReminderTime: normalizeOperationalTime_(values[OPERATIONAL_PROPERTY_KEYS.checkinReminderTime], OPERATIONAL_DEFAULTS.checkinReminderTime),
      checkoutNoticeTime: normalizeOperationalTime_(values[OPERATIONAL_PROPERTY_KEYS.checkoutNoticeTime], OPERATIONAL_DEFAULTS.checkoutNoticeTime),
      checkoutReminderTime: normalizeOperationalTime_(values[OPERATIONAL_PROPERTY_KEYS.checkoutReminderTime], OPERATIONAL_DEFAULTS.checkoutReminderTime)
    }
  };
}

function readBooleanProperty_(values, key, fallback) {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return fallback;
  return String(values[key]).toLowerCase() === 'true';
}

function normalizeRequestBoolean_(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function buildMissingOperationalDefaults_(values) {
  const defaults = {};
  Object.keys(OPERATIONAL_PROPERTY_KEYS).forEach(function (name) {
    const key = OPERATIONAL_PROPERTY_KEYS[name];
    if (Object.prototype.hasOwnProperty.call(values, key)) return;
    const defaultValue = OPERATIONAL_DEFAULTS[name];
    defaults[key] = String(defaultValue);
  });
  return defaults;
}

function normalizeOperationalTime_(value, fallback) {
  const text = String(value || '').trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

