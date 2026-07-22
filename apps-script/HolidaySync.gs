var HOLIDAY_WEEKDAYS_ = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'];
var HOLIDAY_SYNC_HANDLER_ = 'syncKoreanHolidaysToSheet';

function readHolidayMap_(ss) {
  const sheet = getRequiredSheet(ss, CONFIG.holidaySheetName);
  const count = Math.max(0, sheet.getLastRow() - CONFIG.holidayStartRow + 1);

  if (!count) {
    return {};
  }

  const rows = sheet.getRange(CONFIG.holidayStartRow, 1, count, 3).getValues();
  return rows.reduce(function (map, row) {
    expandHolidayRow_(row[0], row[1], row[2]).forEach(function (holiday) {
      map[holiday.date] = holiday.name;
    });
    return map;
  }, {});
}

function expandHolidayRow_(dateValue, weekdayText, holidayName) {
  const start = parseHolidayDateValue_(dateValue);
  const name = String(holidayName || '').trim();

  if (!start || !name) {
    return [];
  }

  const range = String(weekdayText || '').replace(/\s/g, '').split('~');
  const startDay = start.getDay();
  const endDay = range.length > 1 ? HOLIDAY_WEEKDAYS_.indexOf(range[range.length - 1]) : startDay;
  const span = endDay < 0 ? 0 : (endDay - startDay + 7) % 7;
  const holidays = [];

  for (let offset = 0; offset <= span; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    holidays.push({
      date: formatDate(date),
      name,
      weekday: HOLIDAY_WEEKDAYS_[date.getDay()]
    });
  }

  return holidays;
}

function syncKoreanHolidaysToSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = getRequiredSheet(ss, CONFIG.holidaySheetName);
  const existing = readHolidayMap_(ss);
  const calendar = CalendarApp.getCalendarById(CONFIG.holidayCalendarId);

  if (!calendar) {
    throw new Error('\uB300\uD55C\uBBFC\uAD6D \uACF5\uD734\uC77C \uCE98\uB9B0\uB354\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. Google Calendar\uC5D0\uC11C \uD574\uB2F9 \uCE98\uB9B0\uB354\uB97C \uBA3C\uC800 \uCD94\uAC00\uD574 \uC8FC\uC138\uC694.');
  }

  const now = new Date();
  const rangeStart = new Date(now.getFullYear() - 1, 0, 1);
  const rangeEnd = new Date(now.getFullYear() + 2, 0, 1);
  const additionsByDate = {};

  calendar.getEvents(rangeStart, rangeEnd).forEach(function (event) {
    const eventStart = stripTime(event.getStartTime());
    const eventEnd = stripTime(event.getEndTime());
    const exclusiveEnd = eventEnd.getTime() > eventStart.getTime()
      ? eventEnd
      : new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate() + 1);

    for (let cursor = new Date(eventStart); cursor.getTime() < exclusiveEnd.getTime(); cursor.setDate(cursor.getDate() + 1)) {
      const dateKey = formatDate(cursor);
      if (!existing[dateKey] && !additionsByDate[dateKey]) {
        additionsByDate[dateKey] = {
          date: new Date(cursor),
          weekday: HOLIDAY_WEEKDAYS_[cursor.getDay()],
          name: String(event.getTitle() || '\uACF5\uD734\uC77C').trim()
        };
      }
    }
  });

  const additions = Object.keys(additionsByDate)
    .map(function (key) { return additionsByDate[key]; })
    .sort(function (left, right) { return left.date.getTime() - right.date.getTime(); });

  if (additions.length) {
    const targetRow = Math.max(sheet.getLastRow() + 1, CONFIG.holidayStartRow);
    sheet.getRange(targetRow, 1, additions.length, 3).setValues(additions.map(function (holiday) {
      return [holiday.date, holiday.weekday, holiday.name];
    }));
    sheet.getRange(targetRow, 1, additions.length, 1)
      .setNumberFormat('yyyy. m. d')
      .setNotes(additions.map(function () { return ['Google Calendar \uC790\uB3D9\uC5F0\uB3D9']; }));
  }

  return {
    ok: true,
    sheetName: CONFIG.holidaySheetName,
    addedCount: additions.length,
    syncedAt: formatDateTime(new Date())
  };
}

function installDailyHolidaySyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === HOLIDAY_SYNC_HANDLER_) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const trigger = ScriptApp.newTrigger(HOLIDAY_SYNC_HANDLER_)
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.holidaySyncHour)
    .create();

  return {
    ok: true,
    handler: HOLIDAY_SYNC_HANDLER_,
    hour: CONFIG.holidaySyncHour,
    triggerId: trigger.getUniqueId()
  };
}

function parseHolidayDateValue_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return stripTime(value);
  }

  const match = String(value || '').trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
    ? date
    : null;
}
