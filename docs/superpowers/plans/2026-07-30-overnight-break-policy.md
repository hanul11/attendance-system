# Overnight Break Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply separate 18:30 daytime and next-day 06:30 overnight break thresholds while keeping server and client work-time calculations identical.

**Architecture:** Keep the existing `computeWorkMinutes` interface and change only its break-selection branch. Detect an overnight shift before adding 24 hours to checkout minutes, then use 06:30 as the extra-break threshold for overnight shifts and 18:30 for same-day shifts.

**Tech Stack:** Google Apps Script JavaScript, HTML inline JavaScript, Node.js static QA script

## Global Constraints

- Do not change Google Sheets structure or column order.
- Do not change attendance persistence, early-work, overtime, or OT formulas.
- Keep the existing 24-hour previous-row checkout association limit.
- Apply the same calculation policy on the server and in the browser.

---

### Task 1: Add Overnight Break Boundary Tests

**Files:**
- Modify: `release/scripts/qa-static.mjs:271-279`
- Test: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `computeWorkMinutes(clockInText, clockOutText): number`
- Produces: Regression coverage for daytime and overnight break boundaries

- [ ] **Step 1: Replace outdated overnight expectations and add boundary assertions**

Add assertions for these exact results:

```js
utilities.computeWorkMinutes("21:00", "06:00") === 480;
utilities.computeWorkMinutes("21:00", "06:30") === 480;
utilities.computeWorkMinutes("21:00", "07:00") === 510;
utilities.computeWorkMinutes("09:00", "18:00") === 480;
utilities.computeWorkMinutes("09:00", "18:30") === 480;
```

- [ ] **Step 2: Run the static QA and confirm the new overnight tests fail**

Run:

```powershell
node release/scripts/qa-static.mjs
```

Expected: the `21:00 -> 06:00` case fails because the current implementation subtracts 90 minutes.

### Task 2: Implement the Shared Break Policy

**Files:**
- Modify: `apps-script/Utils.gs:35-52`
- Modify: `apps-script/Index.html:2879-2895`
- Test: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: Parsed clock-in and clock-out minute values
- Produces: `computeWorkMinutes(...)` returning minutes after the correct 60- or 90-minute break

- [ ] **Step 1: Update the server calculation**

Use the pre-adjustment comparison to detect overnight work and select the threshold:

```js
const overnight = clockOut < clockIn || (clockOut === 0 && clockIn > 0);
if (overnight) clockOut += 24 * 60;

const nextDayClockOut = clockOut - 24 * 60;
const breakMinutes = overnight
  ? (nextDayClockOut >= 6 * 60 + 30 ? 90 : 60)
  : (clockOut >= 18 * 60 + 30 ? 90 : 60);
```

- [ ] **Step 2: Update the browser calculation with the same branching rule**

Keep the existing browser function signature and apply the same `overnight`, `nextDayClockOut`, and threshold calculation so optimistic UI values match server responses.

- [ ] **Step 3: Run static QA**

Run:

```powershell
node release/scripts/qa-static.mjs
```

Expected: all checks pass, including all five new boundary cases.

- [ ] **Step 4: Verify Apps Script syntax and duplicate function checks**

Confirm the static QA reports both `Inline JavaScript syntax` and `Apps Script syntax` as passing.

- [ ] **Step 5: Commit the implementation**

Commit message:

```text
fix: apply overnight break thresholds
```
