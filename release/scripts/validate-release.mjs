import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../..");
const strict = process.argv.includes("--strict");
const platformArgument = process.argv.find((value) => value.startsWith("--platform="));
const platform = platformArgument ? platformArgument.split("=")[1] : "all";
const supportedPlatforms = new Set(["all", "ios", "android"]);
const checks = [];

if (!supportedPlatforms.has(platform)) {
  throw new Error("Platform must be one of: all, ios, android");
}

function includesPlatform(target) {
  return platform === "all" || platform === target;
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function add(level, name, detail) {
  checks.push({ level, name, detail });
}

function assertEqual(name, expected, actual, source) {
  if (String(expected) === String(actual)) {
    add("pass", name, `${source}: ${actual}`);
  } else {
    add("block", name, `${source}: expected ${expected}, found ${actual}`);
  }
}

function findValue(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

const config = readJson("release/release-config.json");
const mobileBuild = readJson("mobile/build-config.json");
const mobilePackage = readJson("mobile/package.json");
const capacitor = readJson("mobile/capacitor.config.json");
const appConfig = read("firebase/public/config/app-config.js");
const firebaseConfig = read("firebase/public/config/firebase-config.js");
const appHtml = read("apps-script/Index.html");
const serverFiles = ["Config.gs", "Utils.gs", "OperationalSettings.gs", "HolidaySync.gs", "AttendanceRequests.gs", "Code.gs", "Notifications.gs"];
const serverSource = serverFiles
  .map((fileName) => read(`apps-script/${fileName}`))
  .join("\n");
const holidaySource = read("apps-script/HolidaySync.gs");
const requestSource = read("apps-script/AttendanceRequests.gs");

assertEqual("App package ID", config.app.bundleId, capacitor.appId, "mobile/capacitor.config.json");
assertEqual("Mobile package version", config.app.version, mobilePackage.version, "mobile/package.json");
assertEqual("Mobile build version", config.app.version, mobileBuild.version, "mobile/build-config.json");
assertEqual("Firebase shell version", config.app.version, findValue(appConfig, /version:\s*["']([^"']+)["']/), "firebase/public/config/app-config.js");
assertEqual("Apps Script UI version", config.app.version, findValue(appHtml, /const APP_META[\s\S]*?version:\s*["']([^"']+)["']/), "apps-script/Index.html");

if (includesPlatform("ios")) {
  assertEqual("iOS marketing version", config.app.version, mobileBuild.ios.marketingVersion, "mobile/build-config.json");
  assertEqual("iOS build number", config.app.buildNumber, mobileBuild.ios.currentProjectVersion, "mobile/build-config.json");
  if (/YOUR_[A-Z0-9_]+/.test(config.apple.teamId) || /YOUR_[A-Z0-9_]+/.test(config.apple.appStoreConnectAppId)) {
    add("block", "Apple signing", "Apple Team ID and App Store Connect App ID are not configured.");
  } else {
    add("pass", "Apple signing", "Apple identifiers are configured.");
  }
  add(exists("mobile/ios/App/App/GoogleService-Info.plist") ? "pass" : "block", "Firebase iOS plist", exists("mobile/ios/App/App/GoogleService-Info.plist") ? "GoogleService-Info.plist exists." : "mobile/ios/App/App/GoogleService-Info.plist is missing.");
  add(exists("mobile/ios/App/App.xcodeproj/project.pbxproj") ? "pass" : "block", "iOS native project", exists("mobile/ios/App/App.xcodeproj/project.pbxproj") ? "Xcode project exists." : "Run npm install and npm run add:ios on macOS.");
}

if (includesPlatform("android")) {
  assertEqual("Android package name", config.app.bundleId, config.googlePlay.packageName, "release/release-config.json");
  assertEqual("Android version name", config.app.version, mobileBuild.android.versionName, "mobile/build-config.json");
  assertEqual("Android version code", config.app.buildNumber, mobileBuild.android.versionCode, "mobile/build-config.json");
  if (/YOUR_[A-Z0-9_]+/.test(config.googlePlay.playConsoleAppId)) {
    add("block", "Google Play app", "Google Play Console app information is not configured.");
  } else {
    add("pass", "Google Play app", config.googlePlay.playConsoleAppId);
  }
  add(exists("mobile/android/app/google-services.json") ? "pass" : "block", "Firebase Android config", exists("mobile/android/app/google-services.json") ? "google-services.json exists." : "mobile/android/app/google-services.json is missing.");
  const hasAndroidProject = exists("mobile/android/app/build.gradle") || exists("mobile/android/app/build.gradle.kts");
  add(hasAndroidProject ? "pass" : "block", "Android native project", hasAndroidProject ? "Android Studio project exists." : "Run npm install and npm run add:android.");
  add(exists("mobile/android/keystore.properties") ? "pass" : "block", "Android upload signing", exists("mobile/android/keystore.properties") ? "Local signing properties exist." : "Create mobile/android/keystore.properties and an upload keystore locally.");
}

if (!config.firebase.enabled || /YOUR_FIREBASE_PROJECT_ID/.test(config.firebase.projectId + config.firebase.hostingUrl)) {
  add("block", "Firebase project", "Firebase project and Hosting URL are still placeholders.");
} else {
  add("pass", "Firebase project", config.firebase.projectId);
}

if (/YOUR_[A-Z0-9_]+/.test(firebaseConfig) || /enabled:\s*false/.test(firebaseConfig)) {
  add("block", "Firebase client config", "Firebase initialization is disabled or contains placeholders.");
} else {
  add("pass", "Firebase client config", "Firebase initialization is enabled.");
}

const iconCandidates = [
  "firebase/public/assets/icons/icon-512.png",
  "mobile/resources/icon.png",
  "mobile/resources/icon-only.png",
  "mobile/resources/ios/AppIcon-1024.png",
  "mobile/resources/android/play-store-icon-512.png"
];
add(iconCandidates.some(exists) ? "pass" : "block", "App icon source", iconCandidates.some(exists) ? "A release icon source exists." : "Add release icon sources under mobile/resources.");

const activeGpsPattern = /navigator\.geolocation|gpsDistanceM|gpsVerified|gpsLatitude|gpsLongitude|gpsLocations|LOGIFLOW_GPS_/i;
if (activeGpsPattern.test(appHtml + serverSource)) {
  add("block", "GPS-free attendance", "Active GPS code remains in the production attendance source.");
} else {
  add("pass", "GPS-free attendance", "No active GPS permission, request, storage or configuration code was detected.");
}

add(serverFiles.every((fileName) => exists(`apps-script/${fileName}`)) ? "pass" : "block", "Apps Script modules", "Holiday and attendance-request modules are present.");
add(/CalendarApp\.getCalendarById/.test(holidaySource) && /\.atHour\(CONFIG\.holidaySyncHour\)/.test(holidaySource) ? "pass" : "block", "Holiday synchronization", "Calendar lookup and 01:00 configured trigger are present.");
add(/function submitAttendanceCorrectionRequest/.test(requestSource) && /appendAttendanceLog/.test(requestSource) ? "pass" : "block", "Attendance correction requests", "Requests reuse the existing attendance log.");
add(!/setValue|setValues|insertColumn|deleteColumn/.test(requestSource) ? "pass" : "block", "Attendance request data isolation", "Request module does not write to attendance cells or alter columns.");
add(/function startAdminAutoRefresh/.test(appHtml) && /60000/.test(appHtml) && /document\.visibilityState/.test(appHtml) ? "pass" : "block", "Administrator monitoring", "Visibility-aware 60-second refresh is configured.");

const functionNames = [...serverSource.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]);
const duplicateFunctions = Object.entries(functionNames.reduce((counts, name) => {
  counts[name] = (counts[name] || 0) + 1;
  return counts;
}, {})).filter(([, count]) => count > 1);
add(duplicateFunctions.length ? "block" : "pass", "Apps Script function declarations", duplicateFunctions.length ? JSON.stringify(duplicateFunctions) : "No duplicate declarations.");

const calledServerFunctions = [...new Set([...appHtml.matchAll(/callServer\(["']([A-Za-z0-9_]+)["']/g)].map((match) => match[1]))];
const missingServerFunctions = calledServerFunctions.filter((name) => !functionNames.includes(name));
add(missingServerFunctions.length ? "block" : "pass", "Client/server API contract", missingServerFunctions.length ? `Missing: ${missingServerFunctions.join(", ")}` : `${calledServerFunctions.length} APIs resolved.`);

const levels = { pass: "PASS", warn: "WARN", block: "BLOCK" };
console.log(`LOGIFLOW Release Check - ${platform} - v${config.app.version} (${config.app.buildNumber})`);
console.log("=".repeat(72));
for (const check of checks) console.log(`[${levels[check.level]}] ${check.name}: ${check.detail}`);
const blockers = checks.filter((check) => check.level === "block");
console.log("=".repeat(72));
console.log(blockers.length ? `Release blocked: ${blockers.length} item(s)` : "Release configuration ready");
if (strict && blockers.length) process.exitCode = 1;
