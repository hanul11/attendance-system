"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ApiError,
  createBridgeAuthorizer,
  createJsonPostHandler,
  createNotificationInstallationService,
  selectDeliverableInstallations
} = require("../lib/device-registration");

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

function createHarness(overrides = {}) {
  const installations = new Map();
  const employeePreferences = new Map();
  const preferenceWrites = [];
  const service = createNotificationInstallationService({
    verifyIdToken: async (token) => {
      assert.equal(token, "valid-id-token");
      return { uid: "anonymous-user", firebase: { sign_in_provider: "anonymous" } };
    },
    runInstallationTransaction: async (installId, operation) => {
      const outcome = await operation({
        installation: installations.get(installId) || null,
        getEmployeePreferences: async (employeeId) => employeePreferences.get(employeeId) || null
      });
      installations.set(installId, { ...(installations.get(installId) || {}), ...outcome.update });
      return outcome.result;
    },
    setEmployeePreferences: async (employeeId, preferences, updatedAt) => {
      preferenceWrites.push({ employeeId, preferences, updatedAt });
    },
    now: () => "2026-07-23T00:00:00.000Z",
    ...overrides
  });
  return { employeePreferences, installations, preferenceWrites, service };
}

test("인증되지 않은 설치 등록 요청을 거부한다", async () => {
  let writeCount = 0;
  const { service } = createHarness({
    runInstallationTransaction: async () => { writeCount += 1; }
  });

  await assert.rejects(
    service.register({ authorization: "", body: { installId: "install-1", token: "fcm-1" } }),
    (error) => error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED"
  );
  assert.equal(writeCount, 0);
});

test("Firebase 익명 사용자는 사번 없이 설치를 등록한다", async () => {
  const { installations, service } = createHarness();

  const result = await service.register({
    authorization: "Bearer valid-id-token",
    body: {
      installId: "install-1",
      token: "fcm-1",
      platform: "android",
      appVersion: "1.2.3",
      employeeId: "E-999"
    }
  });

  assert.deepEqual(result, { installId: "install-1", state: "unbound" });
  assert.deepEqual(installations.get("install-1"), {
    installId: "install-1",
    token: "fcm-1",
    platform: "android",
    appVersion: "1.2.3",
    active: true,
    employeeId: null,
    ownerUid: "anonymous-user",
    updatedAt: "2026-07-23T00:00:00.000Z"
  });
});

test("다른 Firebase 사용자는 기존 installId를 재등록할 수 없다", async () => {
  const { installations, service } = createHarness({
    verifyIdToken: async () => ({ uid: "attacker-uid" })
  });
  installations.set("install-1", {
    installId: "install-1",
    token: "owner-token",
    ownerUid: "owner-uid",
    employeeId: null,
    active: true
  });

  await assert.rejects(
    service.register({
      authorization: "Bearer attacker-token",
      body: { installId: "install-1", token: "attacker-token" }
    }),
    (error) => error instanceof ApiError && error.status === 409 && error.code === "INSTALLATION_OWNER_MISMATCH"
  );
  assert.equal(installations.get("install-1").token, "owner-token");
});

test("동일 설치 ID 재등록은 토큰을 갱신하고 기존 바인딩은 유지한다", async () => {
  const { installations, service } = createHarness();
  installations.set("install-1", {
    installId: "install-1",
    token: "old-token",
    ownerUid: "anonymous-user",
    employeeId: "E-001",
    active: true,
    preferences: { checkin: false, checkout: true }
  });

  const result = await service.register({
    authorization: "Bearer valid-id-token",
    body: { installId: "install-1", token: "new-token", platform: "ios", appVersion: "2.0.0" }
  });

  assert.equal(result.state, "bound");
  assert.equal(installations.get("install-1").token, "new-token");
  assert.equal(installations.get("install-1").employeeId, "E-001");
  assert.deepEqual(installations.get("install-1").preferences, { checkin: false, checkout: true });
});

test("비활성 설치 재등록은 토큰만 갱신하고 비활성 상태를 유지한다", async () => {
  const { installations, service } = createHarness();
  installations.set("install-1", {
    installId: "install-1",
    token: "old-token",
    ownerUid: "anonymous-user",
    employeeId: "E-001",
    active: false
  });

  await service.register({
    authorization: "Bearer valid-id-token",
    body: { installId: "install-1", token: "new-token" }
  });

  assert.equal(installations.get("install-1").token, "new-token");
  assert.equal(installations.get("install-1").active, false);
});

test("동시 deactivate 이후 register transaction 재시도는 비활성 상태를 보존한다", async () => {
  const installations = new Map([["install-1", {
    installId: "install-1",
    token: "old-token",
    ownerUid: "anonymous-user",
    employeeId: "E-001",
    active: true
  }]]);
  const versions = new Map([["install-1", 0]]);
  let releaseRegisterCommit;
  let registerReachedCommit;
  const registerAtCommit = new Promise((resolve) => { registerReachedCommit = resolve; });
  const releaseRegister = new Promise((resolve) => { releaseRegisterCommit = resolve; });

  const runInstallationTransaction = async (installId, operation) => {
    for (let attempt = 1; ; attempt += 1) {
      const version = versions.get(installId) || 0;
      const current = installations.get(installId);
      const outcome = await operation({
        installation: current ? { ...current } : null,
        getEmployeePreferences: async () => null
      });
      if (outcome.update.token === "new-token" && attempt === 1) {
        registerReachedCommit();
        await releaseRegister;
      }
      if ((versions.get(installId) || 0) !== version) continue;
      installations.set(installId, { ...(current || {}), ...outcome.update });
      versions.set(installId, version + 1);
      return outcome.result;
    }
  };
  const service = createNotificationInstallationService({
    verifyIdToken: async () => ({ uid: "anonymous-user" }),
    runInstallationTransaction,
    setEmployeePreferences: async () => {},
    now: () => "2026-07-23T00:00:00.000Z"
  });

  const registration = service.register({
    authorization: "Bearer valid-id-token",
    body: { installId: "install-1", token: "new-token" }
  });
  await registerAtCommit;
  await service.deactivate({ installId: "install-1", employeeId: "E-001" });
  releaseRegisterCommit();
  await registration;

  assert.equal(installations.get("install-1").token, "new-token");
  assert.equal(installations.get("install-1").active, false);
});

test("관리자 작업은 설치를 바인딩하고 일치하는 직원의 설치만 비활성화한다", async () => {
  const { installations, service } = createHarness();
  installations.set("install-1", { installId: "install-1", employeeId: null, active: true });

  await service.bind({ installId: "install-1", employeeId: "E-001" });
  assert.equal(installations.get("install-1").employeeId, "E-001");

  await assert.rejects(
    service.deactivate({ installId: "install-1", employeeId: "E-002" }),
    (error) => error instanceof ApiError && error.status === 409 && error.code === "INSTALLATION_EMPLOYEE_MISMATCH"
  );
  assert.equal(installations.get("install-1").active, true);

  await service.deactivate({ installId: "install-1", employeeId: "E-001" });
  assert.equal(installations.get("install-1").active, false);
});

test("bind는 직원의 기존 OFF preferences를 새 설치에 상속한다", async () => {
  const { employeePreferences, installations, service } = createHarness();
  installations.set("install-1", {
    installId: "install-1",
    ownerUid: "anonymous-user",
    employeeId: null,
    active: true
  });
  employeePreferences.set("E-001", { checkin: false, checkout: true });

  await service.bind({ installId: "install-1", employeeId: "E-001" });

  assert.deepEqual(installations.get("install-1").preferences, {
    checkin: false,
    checkout: true
  });
});

test("관리자 환경설정은 누락 값을 기본 ON으로 정규화한다", async () => {
  const { preferenceWrites, service } = createHarness();

  const result = await service.updatePreferences({
    employeeId: "E-001",
    preferences: { checkin: false }
  });

  assert.deepEqual(result.preferences, { checkin: false, checkout: true });
  assert.deepEqual(preferenceWrites, [{
    employeeId: "E-001",
    preferences: { checkin: false, checkout: true },
    updatedAt: "2026-07-23T00:00:00.000Z"
  }]);
});

test("비활성·미바인딩·설정 OFF 설치에는 알림을 보내지 않는다", () => {
  const selected = selectDeliverableInstallations([
    { token: "active", active: true, employeeId: "E-001", preferences: { checkin: true } },
    { token: "inactive", active: false, employeeId: "E-001", preferences: { checkin: true } },
    { token: "unbound", active: true, employeeId: null, preferences: { checkin: true } },
    { token: "opted-out", active: true, employeeId: "E-002", preferences: { checkin: false } },
    { token: "active", active: true, employeeId: "E-003", preferences: { checkin: true } }
  ], "checkin", {
    "E-001": { checkin: true },
    "E-002": { checkin: false },
    "E-003": { checkin: true }
  });

  assert.deepEqual(selected.map((installation) => installation.token), ["active"]);
});

test("직원 OFF가 설치 복사본 ON보다 우선해 bind/update 경합 중 발송을 막는다", () => {
  const selected = selectDeliverableInstallations([{
    token: "stale-installation-copy",
    active: true,
    employeeId: "E-001",
    preferences: { checkin: true, checkout: true }
  }], "checkin", {
    "E-001": { checkin: false, checkout: true }
  });

  assert.deepEqual(selected, []);
});

test("bridge 비밀키 설정이 누락되면 HTTP action을 거부한다", async () => {
  let actionCount = 0;
  const handler = createJsonPostHandler({
    authorize: createBridgeAuthorizer(() => ""),
    action: async () => { actionCount += 1; },
    logError: () => {}
  });
  const response = createResponse();

  await handler({ method: "POST", get: () => "", body: {} }, response);

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.payload, { ok: false, error: "FORBIDDEN" });
  assert.equal(actionCount, 0);
});

test("bridge 비밀키가 일치하지 않으면 HTTP action을 거부한다", async () => {
  let actionCount = 0;
  const handler = createJsonPostHandler({
    authorize: createBridgeAuthorizer(() => "configured-secret"),
    action: async () => { actionCount += 1; },
    logError: () => {}
  });
  const response = createResponse();

  await handler({ method: "POST", get: () => "wrong-secret", body: {} }, response);

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.payload, { ok: false, error: "FORBIDDEN" });
  assert.equal(actionCount, 0);
});
