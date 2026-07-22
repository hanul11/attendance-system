"use strict";

const ACTIVE_EMPLOYEE_STATUS = "재직";

const PREFERENCE_KEY_BY_KIND = Object.freeze({
  CHECKIN_NOTICE: "checkin",
  CHECKIN_REMINDER: "checkin",
  CHECKOUT_NOTICE: "checkout",
  CHECKOUT_REMINDER: "checkout"
});

const ATTENDANCE_MESSAGE_BY_KIND = Object.freeze({
  CHECKIN_NOTICE: "출근 기록을 등록해주세요.",
  CHECKIN_REMINDER: "아직 출근 기록이 등록되지 않았습니다.",
  CHECKOUT_NOTICE: "퇴근 기록을 등록해주세요.",
  CHECKOUT_REMINDER: "아직 퇴근 기록이 등록되지 않았습니다."
});

function isNotificationWorkday(dateKey, weekendDay, holidayDateKeys) {
  if (weekendDay === 0 || weekendDay === 6) return false;
  return !new Set(holidayDateKeys || []).has(dateKey);
}

function filterRecipients(kind, employees, attendanceByEmployee, preferencesByEmployee) {
  const preferenceKey = PREFERENCE_KEY_BY_KIND[kind];
  if (!preferenceKey) return [];

  const attendanceById = attendanceByEmployee || {};
  const preferencesById = preferencesByEmployee || {};

  return (employees || []).filter((employee) => {
    const employeeId = employee && employee.employeeId;
    if (!employeeId || !isActiveEmployee(employee)) return false;

    const preferences = normalizeNotificationPreferences(preferencesById[employeeId]);
    if (!preferences[preferenceKey]) return false;

    const attendance = attendanceById[employeeId] || {};
    if (kind === "CHECKIN_REMINDER") return !attendance.clockIn;
    if (kind === "CHECKOUT_REMINDER") return Boolean(attendance.clockIn) && !attendance.clockOut;
    return true;
  }).map((employee) => employee.employeeId);
}

function normalizeEmployeeStatus(value) {
  return String(value || "").trim();
}

function isActiveEmployee(employee) {
  return normalizeEmployeeStatus(employee && employee.status) === ACTIVE_EMPLOYEE_STATUS;
}

function normalizeNotificationPreferences(value) {
  const source = value || {};
  return {
    checkin: source.checkin !== false,
    checkout: source.checkout !== false
  };
}

function buildAttendanceMessage(kind) {
  return ATTENDANCE_MESSAGE_BY_KIND[kind];
}

module.exports = {
  buildAttendanceMessage,
  filterRecipients,
  isActiveEmployee,
  isNotificationWorkday,
  normalizeEmployeeStatus,
  normalizeNotificationPreferences
};
