function cleanSheetDisplay(value) {
  const text = String(value || '').trim();
  return text === '-' ? '' : text;
}

function parseSheetDateText(value) {
  const match = String(value || '').trim().match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function parseIsoDateText(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

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

function computeWorkMinutes(clockInText, clockOutText) {
  const clockIn = parseTimeToMinutes(clockInText);
  const clockOut = parseTimeToMinutes(clockOutText);

  if (clockIn === null || clockOut === null || clockOut <= clockIn) {
    return 0;
  }

  const breakMinutes = clockOut >= (18 * 60 + 30) ? 90 : 60;
  return Math.max(0, clockOut - clockIn - breakMinutes);
}

function parseTimeToMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function durationTextToMinutes(value) {
  const text = String(value || '').trim();

  if (!text || text === '-') {
    return 0;
  }

  const match = text.match(/^(\d+):(\d{2})$/);

  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.round(numeric * 60) : 0;
}

function formatDurationMinutes(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return hours + ':' + String(rest).padStart(2, '0');
}

function floorToHalfHour(dateValue) {
  const result = new Date(dateValue);
  const minutes = result.getMinutes();

  result.setSeconds(0, 0);
  result.setMinutes(minutes < 30 ? 0 : 30);

  return result;
}

function timeToSheetSerial(dateValue) {
  return (dateValue.getHours() * 60 + dateValue.getMinutes()) / 1440;
}

function stripTime(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
}

function formatDate(dateValue) {
  return Utilities.formatDate(dateValue, CONFIG.timezone, 'yyyy. M. d');
}

function formatIsoDate(dateValue) {
  return Utilities.formatDate(dateValue, CONFIG.timezone, 'yyyy-MM-dd');
}

function formatTime(dateValue) {
  return Utilities.formatDate(dateValue, CONFIG.timezone, 'H:mm');
}

function formatDateTime(dateValue) {
  return Utilities.formatDate(dateValue, CONFIG.timezone, 'yyyy. M. d H:mm:ss');
}

function columnToLetter(column) {
  let value = '';
  let current = column;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - remainder) / 26);
  }

  return value;
}
