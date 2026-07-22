# Attendance Operations Improvements Design

## Scope

This design adds four related operational improvements without changing the
existing `洹쇳깭?꾪솴` sheet layout or attendance calculation formulas:

1. Synchronize holidays from Google Calendar into the existing `怨듯쑕?? sheet.
2. Show missing workdays as employee-confirmed leave candidates.
3. Refresh the administrator dashboard automatically and improve employee detail display.
4. Record employee attendance correction requests in the existing `洹쇳깭 濡쒓렇` sheet.

## Confirmed Rules

- Google Calendar synchronization runs daily at approximately 01:00 Asia/Seoul time.
- The `怨듯쑕?? sheet remains the application's source of truth for holidays.
- Existing columns remain `A: date`, `B: weekday`, and `C: holiday name`.
- Multi-day holiday events are expanded into one row per date.
- Existing manually entered company holidays are preserved.
- Weekends and holidays never become missing-attendance or leave candidates.
- A weekday with no clock-in and no clock-out becomes a leave candidate on the next day.
- Leave candidates do not deduct leave automatically.
- The employee must choose either leave application or attendance correction request.
- Correction requests are recorded in the existing `洹쇳깭 濡쒓렇` sheet.
- Administrators review requests in the app, but edit attendance in the sheet manually.
- The administrator dashboard refreshes every 60 seconds only while visible.

## Architecture

### Holiday Synchronization

Add an Apps Script holiday synchronization module that reads the subscribed
South Korea holiday calendar through `CalendarApp`. It retrieves the current
and following year, expands multi-day all-day events, and appends dates missing
from the `怨듯쑕?? sheet.

Automatically inserted date cells receive the note `Google Calendar ?먮룞?곕룞`.
Manual rows have no such note and are never deleted or overwritten. The app
reads the resulting holiday map together with attendance data so all screens
use the same holiday source.

### Leave Candidates

The employee dashboard response includes unresolved missing workdays before
today. A candidate is created only when all conditions are true:

- The date is a weekday.
- The date is not in the `怨듯쑕?? sheet.
- Both clock-in and clock-out are empty.
- No existing unresolved correction request exists for that employee and date.
- No leave value is already recorded for that date.

The home screen shows one compact `?곗감 ?뺤씤 ?꾩슂` notice. Selecting it opens
a dialog with the date and two commands: `?곗감 ?좎껌` and `洹쇳깭 ?섏젙 ?붿껌`.
Neither command directly modifies `洹쇳깭?꾪솴` in this scope.

### Correction Requests

The existing `洹쇳깭 濡쒓렇` column order remains unchanged. A correction request
maps its data onto existing columns: target date in the date column, request
kind and short reason in the event-type column, current value in saved time,
requested value in actual time, request device in device, and request timestamp
in registered time. GPS columns remain blank.

Duplicate unresolved requests for the same employee, target date, and request
kind are rejected. A request is considered resolved when the corresponding
attendance or leave value in `洹쇳깭?꾪솴` matches the requested value. The
administrator dashboard reads unresolved log entries and displays a request
count and request list. Processing remains a manual sheet workflow; the app
does not directly overwrite attendance cells.

### Administrator Refresh

Start a 60-second refresh timer when the administrator view becomes active.
Stop it when the user changes tabs, the page becomes hidden, the administrator
modal is open, or the user logs out. Reuse the current in-flight request guard
so timers cannot create duplicate API calls.

Refresh failures keep the last successful data on screen and show one Snackbar.
The next scheduled refresh may retry normally.

### Employee Detail Dialog

Reuse the existing administrator employee-detail dialog. Keep it fixed to the
viewport and place the card near the upper 25 to 30 percent of the visible
screen. Opening the dialog must not scroll the page. Lock background scrolling
while open, return focus to the selected employee card on close, and support
outside click, close button, and Escape.

## Data Flow

1. The scheduled holiday trigger updates `怨듯쑕?? at approximately 01:00.
2. Dashboard APIs read attendance rows and a cached holiday map in one request.
3. The server derives leave candidates and returns them with the dashboard payload.
4. The employee submits a correction request.
5. The server validates employee, date, duplicate state, and request fields.
6. The server appends the request to `洹쇳깭 濡쒓렇`.
7. The administrator refresh response includes unresolved request summaries.

## Error Handling

- Missing holiday calendar: retain existing sheet data and log the sync failure.
- Holiday synchronization partial failure: do not clear manual rows or existing holidays.
- Duplicate correction request: show a clear already-requested message.
- Dashboard refresh failure: retain previous data and show a Snackbar.
- Invalid target date or requested time: reject before writing the log.
- Non-administrator request access: reject on the server.

## Performance

- Cache the holiday map for the current app request cycle.
- Read bounded `怨듯쑕?? columns A:C only.
- Load attendance rows once per dashboard request.
- Prevent concurrent administrator refresh calls.
- Pause periodic refresh outside the visible administrator view.

## Verification

- Holiday parsing tests for Date cells, text dates, and multi-day events.
- Leave-candidate tests for weekday, weekend, holiday, existing leave, and partial attendance.
- Duplicate correction-request validation tests.
- Administrator authorization tests for request reads.
- Timer tests for start, stop, visibility change, and in-flight request protection.
- Dialog checks for fixed positioning, no page scroll, close paths, and focus return.
- Regression checks for login, attendance registration, monthly attendance, statistics,
  administrator dashboard, and existing sheet column contracts.

## Out Of Scope

- Automatic leave deduction.
- Automatic modification of `洹쇳깭?꾪솴` after administrator review.
- New spreadsheet tabs or changes to existing sheet column order.
- Push notifications for correction requests.

