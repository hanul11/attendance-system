# Attendance Operations Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize Korean holidays, surface employee-confirmed leave candidates, record correction requests in the existing attendance log, and improve administrator refresh and detail interactions.

**Architecture:** Add focused Apps Script modules for holiday and request behavior while preserving the current `Code.gs` data access and sheet contracts. Extend existing dashboard responses instead of adding extra startup calls, then enhance `Index.html` with compact dialogs and visibility-aware administrator polling.

**Tech Stack:** Google Apps Script V8, Google Sheets, CalendarApp, HTML, CSS, vanilla JavaScript, existing Node static QA script.

## Global Constraints

- Keep the `洹쇳깭?꾪솴`, `洹쇳깭 濡쒓렇`, `吏곸썝 ?щ쾲 紐낅떒`, and `怨듯쑕?? column order unchanged.
- Do not modify login, 30-minute attendance selection, attendance calculations, GPS-free behavior, or administrator ID `2023068`.
- Use `怨듯쑕?? columns A:C beginning at row 3.
- Run holiday synchronization at approximately 01:00 Asia/Seoul time.
- Do not deduct leave automatically or write correction results into `洹쇳깭?꾪솴`.
- Keep administrator polling at 60 seconds and stop it outside the visible administrator view.

---

### Task 1: Holiday synchronization and parsing

**Files:**
- Create: `apps-script/HolidaySync.gs`
- Modify: `apps-script/Config.gs`
- Modify: `release/scripts/qa-static.mjs`

**Interfaces:**
- Produces: `syncKoreanHolidaysToSheet(): Object`
- Produces: `installDailyHolidaySyncTrigger(): Object`
- Produces: `readHolidayMap_(ss: Spreadsheet): Object<string, string>`
- Produces: `expandHolidayRow_(dateValue, weekdayText, holidayName): Array<Object>`

- [ ] **Step 1: Add failing static QA checks**

Add `apps-script/HolidaySync.gs` to `codeFiles` and add checks that require the holiday sheet constant, CalendarApp lookup, 01:00 trigger, manual-row preservation note, bounded A:C read, and multi-day expansion helper.

```javascript
check("Holiday sheet config", /holidaySheetName:\s*SHEET_NAMES\.holiday/.test(configSource), "怨듯쑕??config");
check("Holiday calendar sync", /CalendarApp\.getCalendarById/.test(holidaySource), "CalendarApp lookup");
check("Holiday sync trigger hour", /\.atHour\(1\)/.test(holidaySource), "01:00 trigger");
check("Holiday bounded read", /getRange\([^)]*3[^)]*3/.test(holidaySource), "A:C from row 3");
check("Holiday row expansion", /function expandHolidayRow_/.test(holidaySource), "multi-day row parser");
```

- [ ] **Step 2: Run QA and confirm RED**

Run:

```powershell
node release/scripts/qa-static.mjs
```

Expected: FAIL for missing `HolidaySync.gs` and holiday synchronization contracts.

- [ ] **Step 3: Add holiday configuration**

Extend `SHEET_NAMES` and `CONFIG` without changing existing keys.

```javascript
holiday: '\uACF5\uD734\uC77C'
```

```javascript
holidaySheetName: SHEET_NAMES.holiday,
holidayCalendarId: 'ko.south_korea#holiday@group.v.calendar.google.com',
holidayStartRow: 3,
holidaySyncHour: 1,
```

- [ ] **Step 4: Implement `HolidaySync.gs`**

Implement these responsibilities:

```javascript
function readHolidayMap_(ss) {
  const sheet = getRequiredSheet(ss, CONFIG.holidaySheetName);
  const count = Math.max(0, sheet.getLastRow() - CONFIG.holidayStartRow + 1);
  if (!count) return {};
  const rows = sheet.getRange(CONFIG.holidayStartRow, 1, count, 3).getValues();
  return rows.reduce(function (map, row) {
    expandHolidayRow_(row[0], row[1], row[2]).forEach(function (holiday) {
      map[holiday.date] = holiday.name;
    });
    return map;
  }, {});
}
```

`expandHolidayRow_` must normalize Date and text values. When weekday text is `????, expand from the starting weekday through the ending weekday. Calendar events must also be expanded from inclusive start to exclusive end and appended only when the date is absent. Mark automatically added date cells with `Google Calendar ?먮룞?곕룞`; never clear or replace manual rows.

- [ ] **Step 5: Verify GREEN**

Run `node release/scripts/qa-static.mjs`.

Expected: holiday checks PASS and all existing checks remain green.

- [ ] **Step 6: Commit**

```bash
git add apps-script/HolidaySync.gs apps-script/Config.gs release/scripts/qa-static.mjs
git commit -m "feat: sync holidays from Google Calendar"
```

---

### Task 2: Leave candidates and correction request backend

**Files:**
- Create: `apps-script/AttendanceRequests.gs`
- Modify: `apps-script/Code.gs`
- Modify: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `readHolidayMap_(ss)` from Task 1
- Produces: `buildLeaveCandidates_(attendanceRows, holidayMap, now): Array<Object>`
- Produces: `submitAttendanceCorrectionRequest(request): Object`
- Produces: `readPendingAttendanceRequests_(ss, attendanceRowsByEmployee): Array<Object>`
- Extends: employee dashboard with `holidays` and `leaveCandidates`
- Extends: administrator dashboard with `pendingAttendanceRequests`

- [ ] **Step 1: Add failing backend contract tests**

Add static and executable helper tests covering:

```javascript
check("Leave candidate helper", /function buildLeaveCandidates_/.test(requestSource), "helper exists");
check("Correction request API", /function submitAttendanceCorrectionRequest/.test(requestSource), "API exists");
check("Correction request log reuse", /appendAttendanceLog/.test(requestSource), "existing log writer");
check("Correction duplicate guard", /findPendingAttendanceRequest_/.test(requestSource), "duplicate guard");
```

The executable cases must assert:

- Monday with no clock-in/out becomes a candidate on Tuesday.
- Saturday, Sunday, and dates in `holidayMap` do not become candidates.
- Partial attendance does not become an automatic leave candidate.
- Existing `leaveUsed` does not become a candidate.

- [ ] **Step 2: Run QA and confirm RED**

Expected: FAIL because request helpers and API are absent.

- [ ] **Step 3: Implement leave candidate derivation**

```javascript
function buildLeaveCandidates_(attendanceRows, holidayMap, now) {
  const todayKey = formatDate(now);
  return attendanceRows.filter(function (row) {
    const parsed = parseSheetDateText(row.date);
    if (!parsed || row.date >= todayKey) return false;
    const date = new Date(parsed.year, parsed.month - 1, parsed.day);
    const day = date.getDay();
    return day !== 0 && day !== 6 &&
      !holidayMap[row.date] &&
      !row.clockIn && !row.clockOut &&
      !row.leaveUsed;
  }).map(function (row) {
    return { date: row.date, holidayName: '', status: 'confirmationRequired' };
  });
}
```

Filter out candidates with unresolved log requests for the same employee/date before returning the dashboard payload.

- [ ] **Step 4: Implement request validation and log mapping**

Validate employee, target date, request kind (`clockIn`, `clockOut`, or `leave`), requested half-hour time when applicable, reason length, and duplicate pending request.

Map request data into existing log columns:

```javascript
appendAttendanceLog(ss, {
  dateText: input.targetDate,
  employeeId: employee.employeeId,
  name: employee.name,
  type: '洹쇳깭 ?섏젙 ?붿껌 [' + input.kind + '] ' + sanitizeRequestReason_(input.reason),
  savedTime: input.currentValue || '',
  actualTime: input.requestedValue || '',
  device: input.device || 'LogiFlow PWA',
  registeredAt: new Date(),
  updatedAt: '',
  updatedBy: ''
});
```

A request is pending until the corresponding `洹쇳깭?꾪솴` value equals `requestedValue`. For leave, resolve when `leaveUsed` is non-empty.

- [ ] **Step 5: Extend existing dashboard payloads**

Read the holiday map once in `buildEmployeeDashboard`, add holiday labels to returned rows, and include `leaveCandidates`. Add unresolved requests to `getAdminDashboard` without a second client API call.

- [ ] **Step 6: Verify GREEN**

Run `node release/scripts/qa-static.mjs`.

Expected: candidate, request, duplicate, API contract, and regression checks PASS.

- [ ] **Step 7: Commit**

```bash
git add apps-script/AttendanceRequests.gs apps-script/Code.gs release/scripts/qa-static.mjs
git commit -m "feat: add leave candidates and correction requests"
```

---

### Task 3: Employee holiday, leave candidate, and request UI

**Files:**
- Modify: `apps-script/Index.html`
- Modify: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `payload.holidays`, `payload.leaveCandidates`
- Calls: `submitAttendanceCorrectionRequest(request)`
- Produces: `renderLeaveCandidates(candidates)` and request dialog behavior

- [ ] **Step 1: Add failing DOM and API checks**

Require unique IDs for the leave-candidate notice, confirmation dialog, request kind, requested time, reason, cancel, and submit controls. Require one client call to `submitAttendanceCorrectionRequest`.

- [ ] **Step 2: Run QA and confirm RED**

Expected: FAIL for missing DOM IDs and missing client/server binding.

- [ ] **Step 3: Add compact employee UI**

Add one unframed notice below the primary attendance actions. Hide it when no candidates exist. The dialog displays target date and two commands: `?곗감 ?좎껌` and `洹쇳깭 ?섏젙 ?붿껌`. The correction form conditionally shows a 30-minute time field for clock-in/out and always requires a reason.

- [ ] **Step 4: Implement request submission state**

```javascript
async function submitAttendanceEditRequest(button) {
  if (state.attendanceRequestSaving) return;
  state.attendanceRequestSaving = true;
  setBusy(button, true);
  try {
    await callServer('submitAttendanceCorrectionRequest', buildAttendanceRequestPayload());
    showSnackbar('洹쇳깭 ?섏젙 ?붿껌???깅줉?섏뿀?듬땲??');
    closeAttendanceRequestDialog();
    await refreshEmployeeInBackground();
  } catch (error) {
    showDialog('?붿껌 ?깅줉 ?ㅽ뙣', getFriendlyError(error));
  } finally {
    state.attendanceRequestSaving = false;
    setBusy(button, false);
  }
}
```

Do not use `alert()`. Prevent duplicate clicks and keep the selected date when validation fails.

- [ ] **Step 5: Render holidays consistently**

Calendar cells use the holiday name and holiday status class from server data. Holidays must not display `誘몃벑濡? or `?곗감 ?뺤씤 ?꾩슂`.

- [ ] **Step 6: Verify GREEN and commit**

Run `node release/scripts/qa-static.mjs`, then:

```bash
git add apps-script/Index.html release/scripts/qa-static.mjs
git commit -m "feat: add employee attendance request workflow"
```

---

### Task 4: Administrator polling, pending requests, and detail dialog

**Files:**
- Modify: `apps-script/Index.html`
- Modify: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `adminPayload.pendingAttendanceRequests`
- Produces: `startAdminAutoRefresh()`, `stopAdminAutoRefresh()`, `renderPendingAttendanceRequests()`

- [ ] **Step 1: Add failing administrator interaction checks**

Require a 60,000 ms interval, `document.visibilityState` guard, active administrator-view guard, in-flight request guard, pending-request counter/list, fixed dialog positioning, body scroll lock, and focus restoration.

- [ ] **Step 2: Run QA and confirm RED**

Expected: FAIL for missing polling and request UI contracts.

- [ ] **Step 3: Implement visibility-aware polling**

```javascript
function startAdminAutoRefresh() {
  stopAdminAutoRefresh();
  if (state.role !== 'admin' || state.activeView !== 'admin') return;
  state.adminRefreshTimer = window.setInterval(function () {
    if (document.visibilityState !== 'visible' || state.adminLoading || isAdminDetailOpen()) return;
    refreshAdmin(null, { silent: true });
  }, 60000);
}

function stopAdminAutoRefresh() {
  if (!state.adminRefreshTimer) return;
  window.clearInterval(state.adminRefreshTimer);
  state.adminRefreshTimer = null;
}
```

Start and stop the timer from the existing view transition, logout, and `visibilitychange` paths. Silent refresh keeps previous content and emits at most one Snackbar per failure cycle.

- [ ] **Step 4: Render pending requests**

Add a compact administrator section above the employee list. Display pending count, employee, target date, request kind, requested value, and reason. Selecting a request opens the employee detail dialog without scrolling the page.

- [ ] **Step 5: Harden the existing employee detail dialog**

Keep the overlay `position: fixed`, position the card near 25-30 percent of the viewport, lock body scrolling, retain the triggering employee button, and restore focus on close. Preserve outside click, close button, and Escape behavior.

- [ ] **Step 6: Verify GREEN and commit**

Run `node release/scripts/qa-static.mjs`, then:

```bash
git add apps-script/Index.html release/scripts/qa-static.mjs
git commit -m "feat: improve administrator attendance monitoring"
```

---

### Task 5: Final regression verification and documentation

**Files:**
- Modify: `apps-script/README.md`
- Modify: `release/README.md`
- Modify: `release/scripts/validate-release.mjs`

**Interfaces:**
- Verifies all interfaces from Tasks 1-4.

- [ ] **Step 1: Document setup**

Document adding the South Korea holiday calendar, running `syncKoreanHolidaysToSheet`, running `installDailyHolidaySyncTrigger`, approving Calendar read permission, and redeploying a new Apps Script web-app version.

- [ ] **Step 2: Extend release validation**

Require the new Apps Script modules, no duplicate functions, all client/server APIs resolved, no sheet-column additions, 60-second administrator polling, and 01:00 holiday trigger.

- [ ] **Step 3: Run all verification**

```powershell
node release/scripts/qa-static.mjs
node release/scripts/validate-release.mjs
node --check release/scripts/qa-static.mjs
node --check release/scripts/validate-release.mjs
```

Expected: static QA reports zero failures. Release validation may continue to report only previously documented external Firebase, Apple, or Android account/configuration blockers.

- [ ] **Step 4: Review the final diff**

Confirm no changes to attendance formulas, sheet column order, login, administrator ID, GPS-free behavior, or 30-minute attendance registration.

- [ ] **Step 5: Commit**

```bash
git add apps-script/README.md release/README.md release/scripts/validate-release.mjs
git commit -m "docs: document attendance operations workflow"
```

