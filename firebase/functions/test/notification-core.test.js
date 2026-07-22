"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAttendanceMessage,
  filterRecipients,
  isActiveEmployee,
  isNotificationWorkday,
  normalizeEmployeeStatus,
  normalizeNotificationPreferences
} = require("../lib/notification-core");

const employees = [
  { employeeId: "E-001", status: "재직" },
  { employeeId: "E-002", status: "재직" },
  { employeeId: "E-003", status: "재직" }
];

test("토요일과 일요일은 발송 대상이 아니다", () => {
  assert.equal(isNotificationWorkday("2026-07-25", 6, []), false);
  assert.equal(isNotificationWorkday("2026-07-26", 0, []), false);
  assert.equal(isNotificationWorkday("2026-07-27", 1, []), true);
});

test("공휴일 시트 날짜는 발송 대상이 아니다", () => {
  assert.equal(isNotificationWorkday("2026-08-17", 1, ["2026-08-17"]), false);
  assert.equal(isNotificationWorkday("2026-08-18", 2, ["2026-08-17"]), true);
});

test("재직자만 모든 알림 종류의 발송 대상으로 선택한다", () => {
  const roster = [
    { employeeId: "E-001", status: " 재직 " },
    { employeeId: "E-002", status: "퇴사" },
    { employeeId: "E-003" }
  ];
  const attendanceByEmployee = {
    "E-001": { clockIn: "08:55" },
    "E-002": { clockIn: "08:55" }
  };

  assert.equal(normalizeEmployeeStatus(" 재직 "), "재직");
  assert.equal(isActiveEmployee({ status: "재직" }), true);
  assert.equal(isActiveEmployee({ status: "퇴사" }), false);
  assert.equal(isActiveEmployee({}), false);
  assert.deepEqual(filterRecipients("CHECKIN_NOTICE", roster, attendanceByEmployee, {}), ["E-001"]);
  assert.deepEqual(filterRecipients("CHECKOUT_NOTICE", roster, attendanceByEmployee, {}), ["E-001"]);
  assert.deepEqual(filterRecipients("CHECKIN_REMINDER", roster, {}, {}), ["E-001"]);
  assert.deepEqual(filterRecipients("CHECKOUT_REMINDER", roster, attendanceByEmployee, {}), ["E-001"]);
});

test("출근 미등록 알림은 출근 기록이 없는 직원만 포함한다", () => {
  const attendanceByEmployee = {
    "E-001": { clockIn: "08:55" },
    "E-002": { clockIn: "" },
    "E-003": {}
  };

  assert.deepEqual(
    filterRecipients("CHECKIN_REMINDER", employees, attendanceByEmployee, {}),
    ["E-002", "E-003"]
  );
});

test("퇴근 미등록 알림은 출근했고 퇴근하지 않은 직원만 포함한다", () => {
  const attendanceByEmployee = {
    "E-001": { clockIn: "08:55", clockOut: "18:02" },
    "E-002": { clockIn: "09:03", clockOut: "" },
    "E-003": { clockIn: "" }
  };

  assert.deepEqual(
    filterRecipients("CHECKOUT_REMINDER", employees, attendanceByEmployee, {}),
    ["E-002"]
  );
});

test("직원 개인 설정이 OFF인 유형은 제외한다", () => {
  const preferencesByEmployee = {
    "E-001": { checkin: false },
    "E-002": { checkout: false }
  };

  assert.deepEqual(
    filterRecipients("CHECKIN_NOTICE", employees, {}, preferencesByEmployee),
    ["E-002", "E-003"]
  );
  assert.deepEqual(
    filterRecipients("CHECKOUT_NOTICE", employees, {}, preferencesByEmployee),
    ["E-001", "E-003"]
  );
});

test("개인 설정은 누락된 값만 기본 ON으로 정규화한다", () => {
  assert.deepEqual(normalizeNotificationPreferences(), { checkin: true, checkout: true });
  assert.deepEqual(normalizeNotificationPreferences({ checkin: false }), { checkin: false, checkout: true });
});

test("알림 유형별 한국어 메시지를 정확히 만든다", () => {
  assert.equal(buildAttendanceMessage("CHECKIN_NOTICE"), "출근 기록을 등록해주세요.");
  assert.equal(buildAttendanceMessage("CHECKIN_REMINDER"), "아직 출근 기록이 등록되지 않았습니다.");
  assert.equal(buildAttendanceMessage("CHECKOUT_NOTICE"), "퇴근 기록을 등록해주세요.");
  assert.equal(buildAttendanceMessage("CHECKOUT_REMINDER"), "아직 퇴근 기록이 등록되지 않았습니다.");
});
