import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const codeFiles = ["apps-script/Config.gs", "apps-script/Utils.gs", "apps-script/OperationalSettings.gs", "apps-script/HolidaySync.gs", "apps-script/AttendanceRequests.gs", "apps-script/Code.gs", "apps-script/Notifications.gs"];
const serverSource = codeFiles.map(read).join("\n");
const html = read("apps-script/Index.html");
const releaseConfig = JSON.parse(read("release/release-config.json"));
const configSource = read("apps-script/Config.gs");
const codeSource = read("apps-script/Code.gs");
const notificationSource = read("apps-script/Notifications.gs");
const holidaySource = read("apps-script/HolidaySync.gs");
const requestSource = read("apps-script/AttendanceRequests.gs");
const capacitorConfig = JSON.parse(read("mobile/capacitor.config.json"));
const appConfig = read("firebase/public/config/app-config.js");
const firebaseMessagingServiceWorker = read("firebase/public/firebase-messaging-sw.js");
const failures = [];
const passes = [];

check("Holiday sheet config", /holidaySheetName:\s*SHEET_NAMES\.holiday/.test(configSource), "Holiday sheet constant");
check("Holiday calendar sync", /CalendarApp\.getCalendarById/.test(holidaySource), "CalendarApp lookup");
check("Holiday sync trigger hour", /\.atHour\(CONFIG\.holidaySyncHour\)/.test(holidaySource) && /holidaySyncHour:\s*1/.test(configSource), "01:00 trigger");
check("Holiday bounded read", /getRange\(CONFIG\.holidayStartRow,\s*1,\s*count,\s*3\)/.test(holidaySource), "A:C from row 3");
check("Holiday manual rows preserved", /Google Calendar/.test(holidaySource) && !/\.clear\(/.test(holidaySource), "Append-only calendar synchronization");
check("Holiday row expansion", /function expandHolidayRow_/.test(holidaySource), "Multi-day row parser");
check("Leave candidate helper", /function buildLeaveCandidates_/.test(requestSource), "Helper exists");
check("Correction request API", /function submitAttendanceCorrectionRequest/.test(requestSource), "API exists");
check("Correction request log reuse", /appendAttendanceLog/.test(requestSource), "Existing attendance log writer");
check("Correction duplicate guard", /function findPendingAttendanceRequest_/.test(requestSource), "Duplicate pending request guard");
const employeeRequestIds = [
  "leaveCandidateNotice",
  "leaveCandidateReviewBtn",
  "attendanceRequestModal",
  "attendanceRequestDate",
  "attendanceRequestKind",
  "attendanceRequestTime",
  "attendanceRequestReason",
  "attendanceRequestCancel",
  "attendanceRequestSubmit"
];
check("Employee request UI", employeeRequestIds.every((id) => new RegExp(`id=["']${id}["']`).test(html)), "Leave candidate and correction request controls");
check("Employee request API binding", /callServer\(["']submitAttendanceCorrectionRequest["']/.test(html), "Client submits request to Apps Script");
check("Admin pending request UI", /id=["']adminPendingRequestCount["']/.test(html) && /id=["']adminPendingRequestRows["']/.test(html) && /function renderPendingAttendanceRequests/.test(html), "Pending request count and list");
check("Admin 60-second refresh", /function startAdminAutoRefresh/.test(html) && /60000/.test(html), "Visible administrator polling interval");
check("Admin immediate refresh", /startAdminAutoRefresh\(\{\s*refreshNow:\s*true\s*\}\)/.test(html) && /settings\.refreshNow/.test(html), "Refresh immediately when the administrator view opens or resumes");
check("Statistics work info two-column layout", /\.stats-info-card\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(html), "Average clock-in and clock-out share one row");
check("Admin refresh visibility guard", /document\.visibilityState\s*!==\s*["']visible["']/.test(html) && /state\.activeView\s*!==\s*["']admin["']/.test(html), "Pause outside visible admin view");
check("Admin refresh in-flight guard", /state\.adminLoading/.test(html), "No overlapping administrator requests");
check("Admin dialog focus and scroll", /adminDetailTrigger/.test(html) && /modal-open/.test(html) && /\.focus\(\)/.test(html), "Scroll lock and focus restoration");
check("Holiday calendar date tone", /holiday-date/.test(html) && /row\?\.holidayName/.test(html), "Holiday dates receive a dedicated calendar tone");
check("Holiday name date display", /function holidayDateDisplayHtml/.test(html) && /holiday-date-name/.test(html), "Formatted attendance dates include the holiday name");
check("Holiday map client state", /holidays:\s*\{\}/.test(html) && /function setHolidayMap/.test(html), "Holiday sheet data is retained independently of attendance rows");
check("Holiday-only calendar rows", /function mergeHolidayRowsForMonth/.test(html) && /mergeHolidayRowsForMonth\(monthRows,\s*year,\s*month\)/.test(html), "Every holiday in the selected month is rendered");
check("Monthly holiday response binding", /setHolidayMap\(response\?\.holidays\s*\|\|\s*\{\}\)/.test(html), "Month changes refresh holiday data");
check("Distinct attendance legend palette", ["#15803d", "#ea580c", "#7c3aed", "#2563eb", "#dc2626", "#64748b"].every((color) => html.includes(color)), "Six clearly separated status colors");

const serverLoginSource = codeSource.match(/function login\(request\)[\s\S]*?(?=\nfunction changePassword)/)?.[0] || "";
const clientLoginSource = html.match(/async function login\(\)[\s\S]*?(?=\n    async function forgotPassword)/)?.[0] || "";
const clientLogoutSource = html.match(/async function logout\(\)[\s\S]*?(?=\n    function showToast)/)?.[0] || "";
const clientBootstrapSource = html.match(/function bootstrap\(\)[\s\S]*?(?=\n    function csvCell)/)?.[0] || "";
const notificationBindingSource = html.match(/function getNotificationPreferences\(\)[\s\S]*?(?=\n    function updateAutoLoginSetting)/)?.[0] || "";
const nativeInstallIdSource = html.match(/function readNativeInstallId\(\)[\s\S]*?(?=\n    function bindCurrentNotificationInstallation)/)?.[0] || "";
const queueNotificationBindSource = html.match(/function queueCurrentNotificationInstallationBind\(\)[\s\S]*?(?=\n    function queueCurrentNotificationInstallationCleanup)/)?.[0] || "";
const queueNotificationCleanupSource = html.match(/function queueCurrentNotificationInstallationCleanup\(\)[\s\S]*?(?=\n    async function persistNotificationPreferences)/)?.[0] || "";
const bindInstallationSource = notificationSource.match(/function bindCurrentNotificationInstallation\(payload\)[\s\S]*?(?=\nfunction deactivateCurrentNotificationInstallation)/)?.[0] || "";
const deactivateInstallationSource = notificationSource.match(/function deactivateCurrentNotificationInstallation\(payload\)[\s\S]*?(?=\nfunction validateCurrentNotificationInstallation_)/)?.[0] || "";
const validateInstallationSource = notificationSource.match(/function validateCurrentNotificationInstallation_\(payload\)[\s\S]*?(?=\nfunction updateNotificationPreferences)/)?.[0] || "";

check(
  "Native notification install ID location lookup",
  /google\.script\.url\.getLocation\s*\(/.test(nativeInstallIdSource) && /parameter\?\.nativeInstallId/.test(nativeInstallIdSource),
  "Read only nativeInstallId from the Apps Script URL location"
);
check(
  "Native notification install ID single source",
  [...html.matchAll(/state\.nativeInstallId\s*=/g)].length === 1
    && [...html.matchAll(/parameter\?\.nativeInstallId/g)].length === 1
    && !/(?:URLSearchParams|location\.(?:search|href)|document\.referrer)[^\n]*nativeInstallId|nativeInstallId[^\n]*(?:URLSearchParams|location\.(?:search|href)|document\.referrer)/.test(html),
  "getLocation is the only source assigned to state.nativeInstallId"
);
check(
  "Notification installation binds after successful login",
  /state\.user\s*=\s*response\.user[\s\S]*queueCurrentNotificationInstallationBind\(\)/.test(clientLoginSource)
    && /const employeeId = state\.user\?\.employeeId/.test(queueNotificationBindSource)
    && !/queueCurrentNotificationInstallationBind/.test(clientBootstrapSource),
  "Bind the URL installation only after state.user is populated by login"
);
check(
  "Notification bind promise tracked and serialized",
  /notificationBindPromise:\s*null/.test(html)
    && /let notificationCleanupChain = Promise\.resolve\(\)/.test(html)
    && /const previousCleanup = notificationCleanupChain/.test(queueNotificationBindSource)
    && /state\.notificationBindPromise\s*=\s*previousCleanup/.test(queueNotificationBindSource)
    && /notificationCleanupChain\s*=\s*previousCleanup/.test(queueNotificationCleanupSource),
  "Track each bind Promise in state and start it after the shared cleanup chain"
);
check(
  "Notification installation server bridge",
  /function bindCurrentNotificationInstallation\(payload\)/.test(notificationSource)
    && /function deactivateCurrentNotificationInstallation\(payload\)/.test(notificationSource)
    && /postNotificationApi_\(['"]bindNotificationInstallation['"]/.test(notificationSource)
    && /postNotificationApi_\(['"]deactivateNotificationInstallation['"]/.test(notificationSource),
  "Apps Script bridge functions call Firebase installation endpoints"
);
check(
  "Notification installation employee revalidation",
  /validateCurrentNotificationInstallation_\(payload\)/.test(bindInstallationSource)
    && /validateCurrentNotificationInstallation_\(payload\)/.test(deactivateInstallationSource)
    && /findEmployeeById\(ss,\s*employeeId\)/.test(validateInstallationSource)
    && /employee\.status\s*!==\s*LABELS\.employed/.test(validateInstallationSource)
    && /employeeId:\s*installation\.employee\.employeeId/.test(bindInstallationSource)
    && /employeeId:\s*installation\.employee\.employeeId/.test(deactivateInstallationSource),
  "Employee roster identity and active status are checked before forwarding"
);
check(
  "Notification bridge secret header",
  /headers:\s*\{\s*['"]x-logiflow-secret['"]:\s*bridgeSecret\s*\}/.test(notificationSource),
  "Existing Script Properties bridge secret is retained"
);
check(
  "Notification installation deactivates without blocking logout",
  /queueCurrentNotificationInstallationCleanup\(\);\s*performLogout\(\)/.test(clientLogoutSource)
    && !/await\s+queueCurrentNotificationInstallationCleanup/.test(clientLogoutSource),
  "Queue remote cleanup and complete local logout immediately"
);
check(
  "Notification logout cleanup ordering",
  /const employeeId = state\.user\?\.employeeId/.test(queueNotificationCleanupSource)
    && /const installId = state\.nativeInstallId/.test(queueNotificationCleanupSource)
    && /const pendingBind = state\.notificationBindPromise/.test(queueNotificationCleanupSource)
    && /const previousCleanup = notificationCleanupChain/.test(queueNotificationCleanupSource)
    && queueNotificationCleanupSource.indexOf("return installIdReady") < queueNotificationCleanupSource.indexOf("Promise.resolve(pendingBind)")
    && queueNotificationCleanupSource.indexOf("Promise.resolve(pendingBind)") < queueNotificationCleanupSource.indexOf("deactivateCurrentNotificationInstallation"),
  "Resolve nativeInstallId, settle the pending bind, then deactivate captured IDs"
);
check(
  "Notification preferences keep Apps Script server path",
  /callServer\(['"]updateNotificationPreferences['"]/.test(notificationBindingSource)
    && /persistNotificationPreferences\(\)\.catch/.test(notificationBindingSource),
  "Personal toggles persist through updateNotificationPreferences"
);
check(
  "Legacy notification iframe bridge removed",
  !/window\.parent\.postMessage|handleNotificationHostMessage|requestNotificationRegistration|registerNotificationDevice/.test(html)
    && !/function registerNotificationDevice\(/.test(notificationSource),
  "No iframe or postMessage notification registration remains in Apps Script HTML"
);
check(
  "Login roster verification contract",
  /SpreadsheetApp\.openById\(CONFIG\.spreadsheetId\)/.test(serverLoginSource)
    && /findEmployeeById\(ss,\s*employeeId\)/.test(serverLoginSource)
    && /if\s*\(!employee\)/.test(serverLoginSource)
    && /employee\.status\s*!==\s*LABELS\.employed/.test(serverLoginSource)
    && !/nativeInstallId|bindCurrentNotificationInstallation/.test(serverLoginSource),
  "Existing employee lookup and employed-status login checks remain isolated"
);

function check(name, condition, detail) {
  (condition ? passes : failures).push({ name, detail });
}

function assertIncludes(name, value, expected) {
  check(name, String(value).includes(expected), String(value));
}

assertIncludes("Capacitor app name", capacitorConfig.appName, "Hanul근태관리");
assertIncludes("Firebase Hosting URL", appConfig, "hanul-logiflow-attendance.web.app");
assertIncludes("Apps Script deployment URL", appConfig, "AKfycbwZdQADgY3SoYdTSCBhbDhhFcJpe5H8w84kDBkldoSUKcpcQgORYawg7e8WT9vr9Io");
assertIncludes("Firebase background notification fallback title", firebaseMessagingServiceWorker, 'data.title || "Hanul근태관리"');

function functionNames(source) {
  return [...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]);
}

function pngDimensions(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

try {
  const manifest = JSON.parse(read("firebase/public/manifest.webmanifest"));
  const pwaHtml = read("firebase/public/index.html");
  const serviceWorker = read("firebase/public/service-worker.js");
  assertIncludes("PWA manifest app name", manifest.name, "Hanul근태관리");
  const expectedIcons = [
    ["firebase/public/assets/icons/icon-192.png", 192, 192],
    ["firebase/public/assets/icons/icon-512.png", 512, 512],
    ["firebase/public/assets/icons/icon-maskable-512.png", 512, 512],
    ["firebase/public/assets/icons/apple-touch-icon-180.png", 180, 180]
  ];

  check("PWA app name", manifest.name === "Hanul근태관리", manifest.name);
  check("PWA short name", manifest.short_name === "Hanul근태관리", manifest.short_name);
  check("PWA standalone mode", manifest.display === "standalone", manifest.display);
  check("PWA start URL", manifest.start_url === "/?source=pwa", manifest.start_url);
  check("PWA mobile metadata", [
    /name=["']viewport["'][^>]*viewport-fit=cover/i,
    /name=["']theme-color["'][^>]*#2563eb/i,
    /rel=["']manifest["'][^>]*\/manifest\.webmanifest/i,
    /rel=["']apple-touch-icon["'][^>]*sizes=["']180x180["'][^>]*\/assets\/icons\/apple-touch-icon-180\.png/i
  ].every((pattern) => pattern.test(pwaHtml)), "Viewport, theme, manifest and Apple icon metadata");

  for (const [relativePath, width, height] of expectedIcons) {
    const dimensions = pngDimensions(relativePath);
    check(
      `PWA icon ${path.basename(relativePath)}`,
      dimensions?.width === width && dimensions?.height === height,
      dimensions ? `${dimensions.width}x${dimensions.height}` : "Missing or invalid PNG"
    );
    check("Service Worker icon cache " + path.basename(relativePath), serviceWorker.includes("/" + relativePath.replace("firebase/public/", "").replaceAll("\\", "/")), relativePath);
  }
} catch (error) {
  check("PWA installation contract", false, error.message);
}

try {
  const appConstants = new Function(read("apps-script/Config.gs") + "; return APP_CONSTANTS;")();
  check("Config app version", appConstants.VERSION === releaseConfig.app.version, `${appConstants.VERSION}`);
  check("Config build number", String(appConstants.BUILD) === String(releaseConfig.app.buildNumber), `${appConstants.BUILD}`);
  check("Config web app URL", appConstants.WEB_APP_URL === releaseConfig.backend.appsScriptUrl, appConstants.WEB_APP_URL);
  check("Config sheet ID", Boolean(appConstants.GOOGLE_SHEET_ID && !appConstants.GOOGLE_SHEET_ID.startsWith("YOUR_")), "Google Sheet ID configured");
} catch (error) {
  check("Config contract", false, error.message);
}

const serverFunctions = functionNames(serverSource);
const functionCounts = serverFunctions.reduce((counts, name) => {
  counts[name] = (counts[name] || 0) + 1;
  return counts;
}, {});
const duplicateServerFunctions = Object.entries(functionCounts).filter(([, count]) => count > 1);
check("Server function declarations", duplicateServerFunctions.length === 0, duplicateServerFunctions.length ? JSON.stringify(duplicateServerFunctions) : "No duplicate function declarations");

const calledServerFunctions = [...new Set([...html.matchAll(/callServer\(["']([A-Za-z0-9_]+)["']/g)].map((match) => match[1]))];
const missingServerFunctions = calledServerFunctions.filter((name) => !serverFunctions.includes(name));
check("Client/server API contract", missingServerFunctions.length === 0, missingServerFunctions.length ? `Missing: ${missingServerFunctions.join(", ")}` : `${calledServerFunctions.length} APIs resolved`);

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = Object.entries(ids.reduce((counts, id) => {
  counts[id] = (counts[id] || 0) + 1;
  return counts;
}, {})).filter(([, count]) => count > 1);
check("HTML element IDs", duplicateIds.length === 0, duplicateIds.length ? JSON.stringify(duplicateIds) : `${ids.length} unique IDs`);

const referencedIds = [...new Set([...html.matchAll(/\$\(["']([^"']+)["']\)/g)].map((match) => match[1]))];
const missingIds = referencedIds.filter((id) => !ids.includes(id));
check("DOM binding contract", missingIds.length === 0, missingIds.length ? `Missing: ${missingIds.join(", ")}` : `${referencedIds.length} bindings resolved`);

try {
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].forEach((match) => new Function(match[1]));
  check("Inline JavaScript syntax", true, "Inline scripts parsed");
} catch (error) {
  check("Inline JavaScript syntax", false, error.message);
}

try {
  new Function(serverSource);
  check("Apps Script syntax", true, `${codeFiles.length} files parsed`);
} catch (error) {
  check("Apps Script syntax", false, error.message);
}

try {
  const utilities = new Function(read("apps-script/Utils.gs") + "; return { floorToHalfHour, computeWorkMinutes };")();
  const early = utilities.floorToHalfHour(new Date(2026, 6, 15, 8, 29));
  const half = utilities.floorToHalfHour(new Date(2026, 6, 15, 8, 30));
  check("30-minute floor rule", early.getHours() === 8 && early.getMinutes() === 0 && half.getMinutes() === 30, "08:29 -> 08:00, 08:30 -> 08:30");
  check("Work-time calculation", utilities.computeWorkMinutes("9:00", "18:00") === 480, "09:00-18:00 minus 60 minutes = 480 minutes");
} catch (error) {
  check("Attendance utility checks", false, error.message);
}

try {
  const requestHelpers = new Function(
    "formatDate", "parseSheetDateText", "attendanceDateToTimestamp", "stripTime",
    requestSource + "; return { buildLeaveCandidates_ };"
  )(
    (value) => `${value.getFullYear()}. ${value.getMonth() + 1}. ${value.getDate()}`,
    (value) => {
      const match = String(value).match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
      return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
    },
    (value) => {
      const match = String(value).match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
      return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() : 0;
    },
    (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate())
  );
  const rows = [
    { date: "2026. 7. 20", clockIn: "", clockOut: "", leaveUsed: "" },
    { date: "2026. 7. 18", clockIn: "", clockOut: "", leaveUsed: "" },
    { date: "2026. 7. 17", clockIn: "", clockOut: "", leaveUsed: "" },
    { date: "2026. 7. 16", clockIn: "8:30", clockOut: "", leaveUsed: "" },
    { date: "2026. 7. 15", clockIn: "", clockOut: "", leaveUsed: "1" }
  ];
  const candidates = requestHelpers.buildLeaveCandidates_(rows, { "2026. 7. 17": "Holiday" }, new Date(2026, 6, 21));
  check("Leave candidate weekday rules", JSON.stringify(candidates.map((row) => row.date)) === JSON.stringify(["2026. 7. 20"]), "Only prior empty weekday is a candidate");
} catch (error) {
  check("Leave candidate weekday rules", false, error.message);
}

try {
  const helperSource = html.match(/function ceilToHalfHour[\s\S]*?(?=\n    function formatAttendanceChoiceTime)/)?.[0] || "";
  const buildChoices = new Function(helperSource + "; return buildAttendanceTimeChoices;")();
  const choiceText = (date) => buildChoices(date).map((value) => `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`);
  check("Attendance choices at 10:58", JSON.stringify(choiceText(new Date(2026, 6, 16, 10, 58))) === JSON.stringify(["10:30", "11:00", "11:30"]), "10:30 / 11:00 / 11:30");
  check("Attendance choices at 18:12", JSON.stringify(choiceText(new Date(2026, 6, 16, 18, 12))) === JSON.stringify(["18:00", "18:30", "19:00"]), "18:00 / 18:30 / 19:00");
  const midnightChoices = buildChoices(new Date(2026, 6, 16, 23, 58));
  check("Attendance choices across midnight", midnightChoices[0].getDate() === 16 && midnightChoices[1].getDate() === 17 && midnightChoices[2].getDate() === 17, "23:30 / next day 00:00 / 00:30");
} catch (error) {
  check("Attendance time choice checks", false, error.message);
}

const activeGpsSource = [
  read("apps-script/Code.gs"),
  read("apps-script/Config.gs"),
  read("apps-script/OperationalSettings.gs"),
  html,
  read("firebase/public/index.html")
].join("\n");
check("GPS-free active source", !/navigator\.geolocation|gpsDistanceM|gpsVerified|gpsLatitude|gpsLongitude|gpsLocations|LOGIFLOW_GPS_|allow=["']geolocation["']/i.test(activeGpsSource), "No active GPS permission, request, storage or configuration code");
check("No attendance registration window", !/assertClockInRegistrationWindow|attendancePolicy|출근 등록 가능 시간이 아닙니다/.test(activeGpsSource), "Clock-in and clock-out available 24 hours");
check("Selected attendance time persistence", !/floorToHalfHour\s*\(\s*input\.actualAt\s*\)/.test(read("apps-script/Code.gs")) && /const savedAt = new Date\(input\.actualAt\)/.test(read("apps-script/Code.gs")), "Server stores selected time without flooring");

try {
  const normalizeSource = read("apps-script/Code.gs").match(/function normalizeAttendanceRequest[\s\S]*?(?=\nfunction readRosterEmployees)/)?.[0] || "";
  const normalize = new Function(normalizeSource + "; return normalizeAttendanceRequest;")();
  const midnight = normalize({ employeeId: "2023068", type: "clockIn", actualAt: "2026-07-16T00:00:00+09:00" });
  const late = normalize({ employeeId: "2023068", type: "clockOut", actualAt: "2026-07-16T23:30:00+09:00" });
  let invalidMinuteRejected = false;
  try {
    normalize({ employeeId: "2023068", type: "clockIn", actualAt: "2026-07-16T10:31:00+09:00" });
  } catch (error) {
    invalidMinuteRejected = /30분/.test(error.message);
  }
  check("24-hour half-hour server policy", midnight.actualAt.getMinutes() === 0 && late.actualAt.getMinutes() === 30 && invalidMinuteRejected, "00:00 and 23:30 accepted; 10:31 rejected");
} catch (error) {
  check("24-hour half-hour server policy", false, error.message);
}

try {
  const properties = {};
  const scriptProperties = {
    getProperties: () => ({ ...properties }),
    setProperties: (values) => Object.assign(properties, values)
  };
  const operational = new Function(
    "PropertiesService",
    read("apps-script/Config.gs") + "\n" + read("apps-script/OperationalSettings.gs")
      + "; return { getOperationalSettings, saveOperationalSettings };"
  )({ getScriptProperties: () => scriptProperties });
  const defaults = operational.getOperationalSettings();
  check("Operational notification defaults", defaults.notifications.checkinNoticeEnabled === true && defaults.notifications.checkoutNoticeEnabled === true, "Check-in and checkout notifications enabled");
  check("Operational settings storage isolation", !/SpreadsheetApp|getRange|getValues|getDisplayValues/.test(read("apps-script/OperationalSettings.gs")), "Script Properties only");
  const saved = operational.saveOperationalSettings({
    adminEmployeeId: "2023068",
    notifications: {
      checkinNoticeEnabled: true,
      checkinReminderEnabled: false,
      checkoutNoticeEnabled: true,
      checkoutReminderEnabled: false,
      checkinNoticeTime: "07:00",
      checkinReminderTime: "09:00",
      checkoutNoticeTime: "18:00",
      checkoutReminderTime: "20:00"
    }
  });
  check("Operational settings persistence", saved.settings.notifications.checkinReminderEnabled === false && saved.settings.notifications.checkoutReminderEnabled === false, "Notification settings saved with Script Properties mock");
  let unauthorizedRejected = false;
  try {
    operational.saveOperationalSettings({ adminEmployeeId: "1000001", notifications: {} });
  } catch (error) {
    unauthorizedRejected = /관리자/.test(error.message);
  }
  check("Operational settings admin guard", unauthorizedRejected, "Non-admin save rejected");
} catch (error) {
  check("Operational settings checks", false, error.message);
}

for (const result of passes) console.log(`[PASS] ${result.name}: ${result.detail}`);
for (const result of failures) console.error(`[FAIL] ${result.name}: ${result.detail}`);
console.log(`${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
