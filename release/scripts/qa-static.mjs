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
const holidaySource = read("apps-script/HolidaySync.gs");
const requestSource = read("apps-script/AttendanceRequests.gs");
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
check("Admin refresh visibility guard", /document\.visibilityState\s*!==\s*["']visible["']/.test(html) && /state\.activeView\s*!==\s*["']admin["']/.test(html), "Pause outside visible admin view");
check("Admin refresh in-flight guard", /state\.adminLoading/.test(html), "No overlapping administrator requests");
check("Admin dialog focus and scroll", /adminDetailTrigger/.test(html) && /modal-open/.test(html) && /\.focus\(\)/.test(html), "Scroll lock and focus restoration");

function check(name, condition, detail) {
  (condition ? passes : failures).push({ name, detail });
}

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
  const expectedIcons = [
    ["firebase/public/assets/icons/icon-192.png", 192, 192],
    ["firebase/public/assets/icons/icon-512.png", 512, 512],
    ["firebase/public/assets/icons/icon-maskable-512.png", 512, 512],
    ["firebase/public/assets/icons/apple-touch-icon-180.png", 180, 180]
  ];

  check("PWA app name", manifest.name === "한울 출퇴근 기록", manifest.name);
  check("PWA short name", manifest.short_name === "한울 근태", manifest.short_name);
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
