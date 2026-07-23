"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const {
  createBridgeAuthorizer,
  createJsonPostHandler,
  createNotificationInstallationService,
  selectDeliverableInstallations
} = require("./lib/device-registration");

initializeApp();

const bridgeSecret = defineSecret("LOGIFLOW_BRIDGE_SECRET");
const auth = getAuth();
const db = getFirestore();
const messaging = getMessaging();
const REGION = "asia-northeast3";
const MAX_MULTICAST_TOKENS = 500;
const FIRESTORE_IN_QUERY_LIMIT = 30;
const INSTALLATIONS_COLLECTION = "notificationInstallations";

const NOTIFICATION_DEFINITIONS = Object.freeze({
  CHECKIN_NOTICE: Object.freeze({
    preference: "checkin",
    title: "출근 등록 안내",
    body: "출근 기록을 등록해 주세요."
  }),
  CHECKIN_REMINDER: Object.freeze({
    preference: "checkin",
    title: "출근 미등록 안내",
    body: "아직 출근 기록이 등록되지 않았습니다."
  }),
  CHECKOUT_NOTICE: Object.freeze({
    preference: "checkout",
    title: "퇴근 등록 안내",
    body: "퇴근 기록을 등록해 주세요."
  }),
  CHECKOUT_REMINDER: Object.freeze({
    preference: "checkout",
    title: "퇴근 미등록 안내",
    body: "아직 퇴근 기록이 등록되지 않았습니다."
  })
});

function requireBridgeAuthorization(request, response) {
  const supplied = String(request.get("x-logiflow-secret") || "");
  const expected = String(bridgeSecret.value() || "");
  if (!expected || supplied !== expected) {
    response.status(403).json({ ok: false, error: "FORBIDDEN" });
    return false;
  }
  return true;
}

function normalizePreferences(value) {
  const source = value || {};
  return {
    checkin: source.checkin !== false,
    checkout: source.checkout !== false
  };
}

function getDeviceId(token) {
  return require("crypto").createHash("sha256").update(token).digest("hex");
}

const installationService = createNotificationInstallationService({
  verifyIdToken: (idToken) => auth.verifyIdToken(idToken),
  runInstallationTransaction: (installId, operation) => db.runTransaction(async (transaction) => {
    const installationReference = db.collection(INSTALLATIONS_COLLECTION).doc(installId);
    const installationSnapshot = await transaction.get(installationReference);
    const outcome = await operation({
      installation: installationSnapshot.exists ? installationSnapshot.data() : null,
      getEmployeePreferences: async (employeeId) => {
        const userReference = db.collection("notificationUsers").doc(employeeId);
        const userSnapshot = await transaction.get(userReference);
        return userSnapshot.exists ? userSnapshot.data().preferences : null;
      }
    });
    transaction.set(installationReference, outcome.update, { merge: true });
    return outcome.result;
  }),
  setEmployeePreferences: async (employeeId, preferences, updatedAt) => {
    const userReference = db.collection("notificationUsers").doc(employeeId);
    const [legacyDevices, installations] = await Promise.all([
      userReference.collection("devices").get(),
      db.collection(INSTALLATIONS_COLLECTION).where("employeeId", "==", employeeId).get()
    ]);
    const batch = db.batch();
    batch.set(userReference, { employeeId, preferences, updatedAt }, { merge: true });
    legacyDevices.docs.forEach((document) => {
      batch.set(document.ref, { preferences, updatedAt }, { merge: true });
    });
    installations.docs.forEach((document) => {
      batch.set(document.ref, { preferences, updatedAt }, { merge: true });
    });
    await batch.commit();
  },
  now: () => FieldValue.serverTimestamp()
});

const authorizeBridgeRequest = createBridgeAuthorizer(() => bridgeSecret.value());
const registerInstallationHandler = createJsonPostHandler({
  action: (input) => installationService.register(input),
  mapRequest: (request) => ({
    authorization: request.get("authorization"),
    body: request.body || {}
  })
});
const bindInstallationHandler = createJsonPostHandler({
  authorize: authorizeBridgeRequest,
  action: (input) => installationService.bind(input)
});
const deactivateInstallationHandler = createJsonPostHandler({
  authorize: authorizeBridgeRequest,
  action: (input) => installationService.deactivate(input)
});
const updatePreferencesHandler = createJsonPostHandler({
  authorize: authorizeBridgeRequest,
  action: (input) => installationService.updatePreferences(input)
});

async function collectDevices(employeeIds, preferenceKey) {
  const snapshots = [];
  const employeePreferencesById = {};
  for (let offset = 0; offset < employeeIds.length; offset += FIRESTORE_IN_QUERY_LIMIT) {
    const employeeIdBatch = employeeIds.slice(offset, offset + FIRESTORE_IN_QUERY_LIMIT);
    const userReferences = employeeIdBatch.map((employeeId) => (
      db.collection("notificationUsers").doc(employeeId)
    ));
    const [legacyDevices, installations, userSnapshots] = await Promise.all([
      db.collectionGroup("devices").where("employeeId", "in", employeeIdBatch).get(),
      db.collection(INSTALLATIONS_COLLECTION).where("employeeId", "in", employeeIdBatch).get(),
      db.getAll(...userReferences)
    ]);
    snapshots.push(legacyDevices, installations);
    userSnapshots.forEach((snapshot) => {
      const data = snapshot.exists ? snapshot.data() : null;
      employeePreferencesById[snapshot.id] = data ? data.preferences : null;
    });
  }
  const installations = [];

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((document) => {
      const data = document.data();
      installations.push({ ...data, reference: document.ref });
    });
  });
  return selectDeliverableInstallations(installations, preferenceKey, employeePreferencesById);
}

async function sendBatches(devices, definition, notificationKey) {
  let successCount = 0;
  let failureCount = 0;

  for (let offset = 0; offset < devices.length; offset += MAX_MULTICAST_TOKENS) {
    const batch = devices.slice(offset, offset + MAX_MULTICAST_TOKENS);
    const result = await messaging.sendEachForMulticast({
      tokens: batch.map((device) => device.token),
      notification: {
        title: definition.title,
        body: definition.body
      },
      data: {
        title: definition.title,
        body: definition.body,
        notificationKey: notificationKey,
        url: "/?route=home&source=notification"
      },
      android: {
        priority: "high",
        notification: { sound: "default" }
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default" } }
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          icon: "/assets/icons/icon-192.png",
          badge: "/assets/icons/icon-192.png",
          tag: notificationKey
        },
        fcmOptions: { link: "/?route=home&source=notification" }
      }
    });

    successCount += result.successCount;
    failureCount += result.failureCount;
    const removals = [];
    result.responses.forEach((response, index) => {
      const code = response.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
        removals.push(batch[index].reference.delete());
      }
    });
    await Promise.all(removals);
  }

  return { successCount, failureCount };
}

exports.registerNotificationDevice = onRequest({ region: REGION, secrets: [bridgeSecret] }, async (request, response) => {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  if (!requireBridgeAuthorization(request, response)) return;

  const body = request.body || {};
  const employeeId = String(body.employeeId || "").trim();
  const token = String(body.token || "").trim();
  if (!employeeId || !token) return response.status(400).json({ ok: false, error: "INVALID_DEVICE" });

  const preferences = normalizePreferences(body.preferences);
  const userReference = db.collection("notificationUsers").doc(employeeId);
  const deviceReference = userReference.collection("devices").doc(getDeviceId(token));
  const now = FieldValue.serverTimestamp();

  await Promise.all([
    userReference.set({ employeeId, preferences, updatedAt: now }, { merge: true }),
    deviceReference.set({
      employeeId,
      token,
      preferences,
      platform: String(body.platform || ""),
      appVersion: String(body.appVersion || ""),
      active: true,
      updatedAt: now
    }, { merge: true })
  ]);
  return response.json({ ok: true });
});

exports.registerNotificationInstallation = onRequest({ region: REGION, cors: true }, registerInstallationHandler);

exports.bindNotificationInstallation = onRequest(
  { region: REGION, secrets: [bridgeSecret] },
  bindInstallationHandler
);

exports.deactivateNotificationInstallation = onRequest(
  { region: REGION, secrets: [bridgeSecret] },
  deactivateInstallationHandler
);

exports.updateNotificationPreferences = onRequest(
  { region: REGION, secrets: [bridgeSecret] },
  updatePreferencesHandler
);

exports.dispatchAttendanceNotification = onRequest({ region: REGION, secrets: [bridgeSecret], timeoutSeconds: 120 }, async (request, response) => {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  if (!requireBridgeAuthorization(request, response)) return;

  const body = request.body || {};
  const notificationKey = String(body.notificationKey || "").trim();
  const employeeIds = Array.from(new Set((body.employeeIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  const definition = NOTIFICATION_DEFINITIONS[notificationKey];
  if (!definition) return response.status(400).json({ ok: false, error: "INVALID_NOTIFICATION" });
  if (!employeeIds.length) return response.json({ ok: true, targetCount: 0, successCount: 0, failureCount: 0 });

  const devices = await collectDevices(employeeIds, definition.preference);
  const result = await sendBatches(devices, definition, notificationKey);
  return response.json({ ok: true, targetCount: devices.length, ...result });
});
