import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../..");
const strict = process.argv.includes("--strict");
const checks = [];

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

assertEqual("Bundle ID", config.app.bundleId, capacitor.appId, "mobile/capacitor.config.json");
assertEqual("Mobile package version", config.app.version, mobilePackage.version, "mobile/package.json");
assertEqual("Mobile build version", config.app.version, mobileBuild.version, "mobile/build-config.json");
assertEqual("iOS marketing version", config.app.version, mobileBuild.ios.marketingVersion, "mobile/build-config.json");
assertEqual("iOS build number", config.app.buildNumber, mobileBuild.ios.currentProjectVersion, "mobile/build-config.json");
assertEqual(
  "Firebase shell version",
  config.app.version,
  findValue(appConfig, /version:\s*["']([^"']+)["']/),
  "firebase/public/config/app-config.js"
);
assertEqual(
  "Apps Script UI version",
  config.app.version,
  findValue(appHtml, /const APP_META[\s\S]*?version:\s*["']([^"']+)["']/),
  "apps-script/Index.html"
);

if (/YOUR_[A-Z0-9_]+/.test(config.apple.teamId) || /YOUR_[A-Z0-9_]+/.test(config.apple.appStoreConnectAppId)) {
  add("block", "Apple signing", "Apple Team ID and App Store Connect App ID are not configured.");
} else {
  add("pass", "Apple signing", "Apple identifiers are configured.");
}

if (!config.firebase.enabled || /YOUR_FIREBASE_PROJECT_ID/.test(config.firebase.projectId + config.firebase.hostingUrl)) {
  add("block", "Firebase project", "Firebase project and Hosting URL are still placeholders.");
} else {
  add("pass", "Firebase project", config.firebase.projectId);
}

if (/YOUR_[A-Z0-9_]+/.test(firebaseConfig) || /enabled:\s*false/.test(firebaseConfig)) {
  add("block", "Firebase client config", "Firebase client initialization is disabled or contains placeholders.");
} else {
  add("pass", "Firebase client config", "Firebase client initialization is enabled.");
}

if (!exists("mobile/ios/App/App/GoogleService-Info.plist")) {
  add("block", "Firebase iOS plist", "mobile/ios/App/App/GoogleService-Info.plist is missing.");
} else {
  add("pass", "Firebase iOS plist", "GoogleService-Info.plist exists.");
}

if (!exists("mobile/ios/App/App.xcodeproj/project.pbxproj")) {
  add("block", "iOS native project", "Run npm install and npm run add:ios on macOS to create the Xcode project.");
} else {
  add("pass", "iOS native project", "Xcode project exists.");
}

const iconCandidates = [
  "mobile/resources/icon.png",
  "mobile/resources/icon-only.png",
  "mobile/resources/ios/AppIcon-1024.png"
];
if (iconCandidates.some(exists)) {
  add("pass", "App icon source", "A release icon source exists.");
} else {
  add("block", "App icon source", "Add a square 1024x1024 PNG logo source under mobile/resources.");
}

const gpsConstant = findValue(appHtml, /const VERIFIED_GPS_DISTANCE_M\s*=\s*([^;]+);/);
if (gpsConstant && /^\d+(?:\.\d+)?$/.test(gpsConstant.trim())) {
  add("block", "GPS production data", `Fixed GPS distance (${gpsConstant.trim()}m) is present in apps-script/Index.html.`);
} else {
  add("pass", "GPS production data", "No fixed GPS distance constant was detected.");
}

const levels = { pass: "PASS", warn: "WARN", block: "BLOCK" };
console.log(`LOGIFLOW Release Check - v${config.app.version} (${config.app.buildNumber})`);
console.log("=".repeat(64));
for (const check of checks) {
  console.log(`[${levels[check.level]}] ${check.name}: ${check.detail}`);
}

const blockers = checks.filter((check) => check.level === "block");
console.log("=".repeat(64));
console.log(blockers.length ? `Release blocked: ${blockers.length} item(s)` : "Release configuration ready");

if (strict && blockers.length) process.exitCode = 1;
