import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const codeFiles = ["apps-script/Config.gs", "apps-script/Utils.gs", "apps-script/OperationalSettings.gs", "apps-script/Code.gs", "apps-script/Notifications.gs"];
const serverSource = codeFiles.map(read).join("\n");
const html = read("apps-script/Index.html");
const releaseConfig = JSON.parse(read("release/release-config.json"));
const failures = [];
const passes = [];

function check(name, condition, detail) {
  (condition ? passes : failures).push({ name, detail });
}

function functionNames(source) {
  return [...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]);
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
  check("Operational settings defaults", defaults.gps.enabled === true && defaults.gps.allowedRadiusM === 50, "GPS enabled, 50m radius");
  check("Operational settings storage isolation", !/SpreadsheetApp|getRange|getValues|getDisplayValues/.test(read("apps-script/OperationalSettings.gs")), "Script Properties only");
  const saved = operational.saveOperationalSettings({
    adminEmployeeId: "2023068",
    gps: { enabled: false, allowedRadiusM: 100 },
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
  check("Operational settings persistence", saved.settings.gps.enabled === false && saved.settings.gps.allowedRadiusM === 100, "Saved with Script Properties mock");
  let unauthorizedRejected = false;
  try {
    operational.saveOperationalSettings({ adminEmployeeId: "1000001", gps: { enabled: true, allowedRadiusM: 50 }, notifications: {} });
  } catch (error) {
    unauthorizedRejected = /관리자/.test(error.message);
  }
  check("Operational settings admin guard", unauthorizedRejected, "Non-admin save rejected");
} catch (error) {
  check("Operational settings checks", false, error.message);
}

try {
  const gpsDistance = new Function(read("apps-script/Code.gs") + "; return getNearestGpsDistanceM_;")();
  const distance = gpsDistance(37.863368698405246, 126.81681274938418, [{
    latitude: 37.863368698405246,
    longitude: 126.81681274938418
  }]);
  check("Server GPS distance calculation", distance === 0, "Factory coordinate -> 0m");
} catch (error) {
  check("Server GPS distance calculation", false, error.message);
}

for (const result of passes) console.log(`[PASS] ${result.name}: ${result.detail}`);
for (const result of failures) console.error(`[FAIL] ${result.name}: ${result.detail}`);
console.log(`${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;

