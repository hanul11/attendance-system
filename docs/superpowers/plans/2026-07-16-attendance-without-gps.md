# GPS-Free Attendance Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove GPS and clock-in time restrictions while saving the employee's selected half-hour attendance time unchanged.

**Architecture:** Keep the existing Apps Script and Google Sheets contracts. Remove GPS from active client/server/settings paths, preserve the two legacy log columns as blank values, and retain the existing three-option time dialog as the only attendance time input.

**Tech Stack:** Google Apps Script, HtmlService HTML/CSS/JavaScript, Google Sheets, Node.js static QA.

## Global Constraints

- Do not change employee, attendance, or attendance-log sheet column order.
- Preserve login, administration, duplicate prevention, password, attendance query, and statistics behavior.
- Clock-in and clock-out must be available 24 hours a day.
- The selected half-hour time must be stored without server-side rounding or flooring.
- Historical GPS data must not be rewritten.

---

### Task 1: Policy Regression Tests

**Files:**
- Modify: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: active source text from `apps-script/*.gs`, `apps-script/Index.html`, and `firebase/public/index.html`.
- Produces: static checks for no active GPS, no attendance window policy, exact selected-time persistence, and three-option time choices.

- [ ] Add failing checks that reject `navigator.geolocation`, GPS request fields, GPS operational settings, `floorToHalfHour(input.actualAt)`, `attendancePolicy`, and `assertClockInRegistrationWindow`.
- [ ] Add time-choice checks for `10:58`, `18:12`, and midnight rollover.
- [ ] Run `node release/scripts/qa-static.mjs` and confirm failures describe the old GPS and flooring behavior.
- [ ] Commit with `test: define GPS-free attendance policy`.

### Task 2: Server and Operational Settings

**Files:**
- Modify: `apps-script/Code.gs`
- Modify: `apps-script/Config.gs`
- Modify: `apps-script/OperationalSettings.gs`

**Interfaces:**
- Consumes: `{ employeeId, type, actualAt, device }` attendance request.
- Produces: unchanged attendance response fields except GPS response fields are removed; existing log columns 7 and 8 receive empty strings.

- [ ] Remove GPS failure events, input parsing, distance calculations, validation, response fields, and admin payload fields.
- [ ] Replace `const savedAt = floorToHalfHour(input.actualAt);` with a cloned valid selected date.
- [ ] Keep duplicate checks and use the selected date for date-row resolution.
- [ ] Write blank strings for both legacy GPS log columns on success and failure.
- [ ] Remove GPS locations from `CONFIG` and GPS Script Properties while preserving notification settings.
- [ ] Run the policy QA and Apps Script syntax checks.
- [ ] Commit with `refactor: remove GPS from attendance backend`.

### Task 3: Employee and Administrator UI

**Files:**
- Modify: `apps-script/Index.html`

**Interfaces:**
- Consumes: employee and operational payloads without a `gps` object.
- Produces: attendance request `{ employeeId, type, actualAt, device }`.

- [ ] Remove GPS cards, chips, administrator GPS controls, state fields, rendering functions, permission requests, and GPS error mapping.
- [ ] Keep the existing time dialog and `buildAttendanceTimeChoices()` behavior.
- [ ] Remove GPS gating from button enabled states and modal opening.
- [ ] Submit only employee ID, type, selected ISO time, and device.
- [ ] Update privacy copy to remove GPS references.
- [ ] Run DOM binding, inline syntax, and policy QA checks.
- [ ] Commit with `feat: enable GPS-free attendance time selection`.

### Task 4: PWA and Documentation Cleanup

**Files:**
- Modify: `firebase/public/index.html`
- Modify: `apps-script/README.md`
- Modify: `firebase/README.md`
- Modify: `release/README.md`
- Modify: `release/ANDROID-RELEASE-CHECKLIST.md`
- Modify: `release/TESTFLIGHT-CHECKLIST.md`
- Modify: `release/scripts/validate-release.mjs`

**Interfaces:**
- Consumes: existing Firebase PWA redirect shell.
- Produces: PWA with no geolocation permission declaration and release guidance without GPS requirements.

- [ ] Remove `allow="geolocation"` from the PWA iframe.
- [ ] Remove GPS setup and device verification instructions from active documentation and release validation.
- [ ] Run a repository scan limited to active files to ensure GPS and attendance-window code are absent.
- [ ] Run the complete static QA and release validation.
- [ ] Commit with `chore: remove GPS from PWA release guidance`.

### Task 5: Final Verification

**Files:**
- Verify all modified files.

- [ ] Run `node release/scripts/qa-static.mjs` and require zero failures.
- [ ] Run `node release/scripts/validate-release.mjs` and review every result.
- [ ] Run JavaScript syntax checks for active client, server, and PWA files.
- [ ] Confirm no active request contains GPS fields and no server path calls `floorToHalfHour(input.actualAt)`.
- [ ] Push all functional commits to GitHub and report the final commit hash.

