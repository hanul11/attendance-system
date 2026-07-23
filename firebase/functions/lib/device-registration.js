"use strict";

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function requiredString(value, code) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new ApiError(400, code);
  return normalized;
}

function normalizeInstallId(value) {
  const installId = requiredString(value, "INVALID_INSTALLATION");
  if (installId.length > 200 || installId.includes("/")) {
    throw new ApiError(400, "INVALID_INSTALLATION");
  }
  return installId;
}

function normalizePreferences(value) {
  const source = value || {};
  return {
    checkin: source.checkin !== false,
    checkout: source.checkout !== false
  };
}

function readBearerToken(authorization) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization || "").trim());
  if (!match) throw new ApiError(401, "UNAUTHENTICATED");
  return match[1].trim();
}

function createBridgeAuthorizer(readExpectedSecret) {
  return (request) => {
    const expected = String(readExpectedSecret() || "");
    const supplied = String(request.get("x-logiflow-secret") || "");
    return Boolean(expected && supplied === expected);
  };
}

function createJsonPostHandler({ action, authorize, mapRequest, logError }) {
  const readInput = mapRequest || ((request) => request.body || {});
  const reportError = logError || console.error;

  return async (request, response) => {
    if (request.method !== "POST") {
      return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }
    if (authorize) {
      try {
        if (!authorize(request)) {
          return response.status(403).json({ ok: false, error: "FORBIDDEN" });
        }
      } catch (error) {
        return response.status(403).json({ ok: false, error: "FORBIDDEN" });
      }
    }

    try {
      const result = await action(readInput(request));
      return response.json({ ok: true, ...(result || {}) });
    } catch (error) {
      if (error instanceof ApiError) {
        return response.status(error.status).json({ ok: false, error: error.code });
      }
      reportError("Notification API request failed", error);
      return response.status(500).json({ ok: false, error: "INTERNAL" });
    }
  };
}

function createNotificationInstallationService(dependencies) {
  const {
    verifyIdToken,
    runInstallationTransaction,
    setEmployeePreferences,
    now
  } = dependencies;

  async function register({ authorization, body }) {
    const idToken = readBearerToken(authorization);
    let identity;
    try {
      identity = await verifyIdToken(idToken);
    } catch (error) {
      throw new ApiError(401, "UNAUTHENTICATED");
    }
    if (!identity || !identity.uid) throw new ApiError(401, "UNAUTHENTICATED");

    const source = body || {};
    const installId = normalizeInstallId(source.installId);
    const token = requiredString(source.token, "INVALID_INSTALLATION");
    return runInstallationTransaction(installId, async ({ installation }) => {
      if (installation && installation.ownerUid && installation.ownerUid !== identity.uid) {
        throw new ApiError(409, "INSTALLATION_OWNER_MISMATCH");
      }
      const employeeId = installation && installation.employeeId
        ? String(installation.employeeId)
        : null;
      const active = installation ? installation.active !== false : true;

      return {
        update: {
          installId,
          token,
          platform: String(source.platform || "").trim(),
          appVersion: String(source.appVersion || "").trim(),
          active,
          employeeId,
          ownerUid: identity.uid,
          updatedAt: now()
        },
        result: { installId, state: employeeId ? "bound" : "unbound" }
      };
    });
  }

  async function bind(input) {
    const source = input || {};
    const installId = normalizeInstallId(source.installId);
    const employeeId = requiredString(source.employeeId, "INVALID_EMPLOYEE");
    return runInstallationTransaction(installId, async ({ installation, getEmployeePreferences }) => {
      if (!installation) throw new ApiError(404, "INSTALLATION_NOT_FOUND");
      const preferences = normalizePreferences(await getEmployeePreferences(employeeId));
      return {
        update: {
          employeeId,
          active: true,
          preferences,
          updatedAt: now()
        },
        result: { installId, employeeId, preferences }
      };
    });
  }

  async function deactivate(input) {
    const source = input || {};
    const installId = normalizeInstallId(source.installId);
    const employeeId = requiredString(source.employeeId, "INVALID_EMPLOYEE");
    return runInstallationTransaction(installId, async ({ installation }) => {
      if (!installation) throw new ApiError(404, "INSTALLATION_NOT_FOUND");
      if (String(installation.employeeId || "") !== employeeId) {
        throw new ApiError(409, "INSTALLATION_EMPLOYEE_MISMATCH");
      }
      return {
        update: { active: false, updatedAt: now() },
        result: { installId, employeeId }
      };
    });
  }

  async function updatePreferences(input) {
    const source = input || {};
    const employeeId = requiredString(source.employeeId, "INVALID_EMPLOYEE");
    const preferences = normalizePreferences(source.preferences);
    await setEmployeePreferences(employeeId, preferences, now());
    return { employeeId, preferences };
  }

  return { bind, deactivate, register, updatePreferences };
}

function selectDeliverableInstallations(installations, preferenceKey, employeePreferencesById) {
  const selectedByToken = new Map();
  const authoritativePreferences = employeePreferencesById || {};
  (installations || []).forEach((installation) => {
    const token = String(installation && installation.token || "").trim();
    if (!token || installation.active === false || !installation.employeeId) return;
    const preferences = normalizePreferences(authoritativePreferences[installation.employeeId]);
    if (preferences[preferenceKey] === false) return;
    if (!selectedByToken.has(token)) selectedByToken.set(token, installation);
  });
  return Array.from(selectedByToken.values());
}

module.exports = {
  ApiError,
  createBridgeAuthorizer,
  createJsonPostHandler,
  createNotificationInstallationService,
  normalizePreferences,
  selectDeliverableInstallations
};
