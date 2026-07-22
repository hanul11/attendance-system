# Hanul근태관리 개인별 푸시 알림 구현 계획

> **실행 안내:** 이 계획은 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans` 절차로 항목별 검증과 커밋을 수행한다.

**목표:** 관리자 운영 설정의 알림 종류와 시간을 따르면서, 토요일·일요일과 `공휴일` 시트에 등록된 날짜에는 발송하지 않는 Android/iPhone 개인별 FCM 알림을 구현한다.

**구조:** Apps Script가 근태현황과 운영 설정을 기준으로 수신 사번을 결정하고 Firebase Function을 안전하게 호출한다. 네이티브 앱은 기기 토큰과 설치 ID만 Firebase에 등록하며, 로그인 성공 후 Apps Script가 설치 ID를 사번에 결합한다. 근태 데이터는 Firestore로 옮기지 않는다.

**기술:** Apps Script 예약 트리거, Script Properties, Firebase Authentication(익명), Cloud Functions, Firestore, FCM, Capacitor Firebase Messaging

---

## 작업 1: 알림 핵심 규칙을 순수 함수와 테스트로 분리

**생성/수정 파일**
- `firebase/functions/lib/notification-core.js`
- `firebase/functions/test/notification-core.test.js`
- `firebase/functions/package.json`

### 1. 실패 테스트 작성

Node 내장 테스트 러너로 다음을 검증한다.

```js
test("토요일과 일요일은 발송 대상이 아니다", () => {});
test("공휴일 시트 날짜는 발송 대상이 아니다", () => {});
test("출근 미등록 알림은 출근 기록이 없는 직원만 포함한다", () => {});
test("퇴근 미등록 알림은 출근했고 퇴근하지 않은 직원만 포함한다", () => {});
test("직원 개인 설정이 OFF인 유형은 제외한다", () => {});
```

실행:

```powershell
Set-Location firebase/functions
npm test
```

예상: 핵심 모듈이 없어 실패한다.

### 2. 순수 함수 구현

`notification-core.js`에 다음 인터페이스를 구현한다.

```js
function isNotificationWorkday(dateKey, weekendDay, holidayDateKeys) {}
function filterRecipients(kind, employees, attendanceByEmployee, preferencesByEmployee) {}
function normalizeNotificationPreferences(value) {}
function buildAttendanceMessage(kind) {}
```

메시지는 한국어로 고정한다.

- 출근 안내: `출근 기록을 등록해주세요.`
- 출근 미등록: `아직 출근 기록이 등록되지 않았습니다.`
- 퇴근 안내: `퇴근 기록을 등록해주세요.`
- 퇴근 미등록: `아직 퇴근 기록이 등록되지 않았습니다.`

### 3. 테스트 및 커밋

```powershell
npm test
```

커밋 메시지:

```text
test(notifications): 개인별 알림 규칙 검증 추가
```

---

## 작업 2: 네이티브 설치 등록 API 구현

**수정 파일**
- `firebase/functions/index.js`
- `firebase/functions/package.json`
- `firebase/firestore.rules`
- `firebase/functions/test/device-registration.test.js`

### 1. 실패 테스트 작성

검사 항목:

- 인증되지 않은 등록 요청은 거부한다.
- Firebase 익명 인증 사용자는 설치 ID와 토큰을 등록할 수 있다.
- 최초 등록 상태는 `unbound`이며 사번을 임의 지정할 수 없다.
- 동일 설치 ID 재등록은 토큰을 갱신한다.
- 비활성 설치에는 알림을 보내지 않는다.

### 2. HTTPS API 구현

클라이언트용 API는 Firebase ID 토큰을 검증하고 다음 데이터만 저장한다.

```js
{
  installId,
  token,
  platform,
  appVersion,
  active: true,
  employeeId: null,
  updatedAt
}
```

Apps Script용 기존 비밀키 브리지는 유지하고, 다음 관리자 전용 작업을 추가한다.

```js
bindNotificationInstallation({ installId, employeeId })
deactivateNotificationInstallation({ installId, employeeId })
updateNotificationPreferences({ employeeId, preferences })
```

### 3. 보안 규칙

직접 Firestore 쓰기는 금지하고 Cloud Function을 통해서만 갱신한다. 직원은 다른 직원의 토큰이나 설정을 조회할 수 없다.

### 4. 테스트 및 커밋

```powershell
Set-Location firebase/functions
npm test
```

커밋 메시지:

```text
feat(notifications): 인증된 기기 설치 등록 API 추가
```

---

## 작업 3: 네이티브 앱 FCM 토큰 등록

**수정 파일**
- `firebase/public/config/firebase-config.js`
- `firebase/public/js/firebase-bootstrap.js`
- `firebase/public/js/notification-service.js`
- `firebase/public/js/app-bootstrap.js`
- `firebase/public/index.html`
- `mobile/package.json`
- `release/scripts/qa-notification-client.mjs`

### 1. 실패 검증 추가

검사 항목:

- Firebase 설정이 플레이스홀더면 네이티브 등록을 건너뛰고 앱 실행은 계속된다.
- Android/iOS에서 알림 권한은 사용자 동작 후 요청한다.
- 토큰과 UUID 기반 설치 ID를 등록한다.
- Apps Script 이동 URL에 `nativeInstallId`만 전달한다.
- Firebase 실패가 Apps Script 진입을 막지 않는다.
- iframe/postMessage 의존성이 없다.

### 2. 네이티브 등록 흐름 구현

```text
앱 시작
→ Firebase 익명 인증
→ 알림 권한 확인/요청
→ FCM 토큰 획득
→ installId와 함께 등록
→ Apps Script URL로 이동
```

브라우저/PWA 환경은 Web Push 지원 여부를 검사하고, 지원되지 않으면 조용히 앱으로 이동한다.

### 3. 검증 및 커밋

```powershell
node release/scripts/qa-notification-client.mjs
```

커밋 메시지:

```text
feat(mobile): Android iPhone FCM 토큰 등록 연결
```

---

## 작업 4: 로그인 사번과 설치 ID 안전 결합

**수정 파일**
- `apps-script/Notifications.gs`
- `apps-script/Index.html`
- `release/scripts/qa-static.mjs`

### 1. 실패 검증 추가

검사 항목:

- URL의 `nativeInstallId`는 로그인 전 사번과 결합되지 않는다.
- 로그인 성공 후 현재 로그인 사번으로만 설치를 결합한다.
- 로그아웃 시 해당 설치를 비활성화한다.
- 알림 설정 변경은 Apps Script 서버를 통해 Firebase에 반영된다.
- 기존 로그인 함수의 직원 조회 및 인증 조건은 변경되지 않는다.

### 2. Apps Script 브리지 구현

서버 함수:

```js
function bindCurrentNotificationInstallation(payload) {}
function deactivateCurrentNotificationInstallation(payload) {}
```

두 함수는 직원 명단에서 사번과 재직 상태를 다시 확인한 뒤 기존 비밀키 브리지를 호출한다.

클라이언트는 `google.script.url.getLocation`으로 설치 ID를 읽고 로그인 성공 시 결합한다. 기존 `window.parent.postMessage` 알림 등록 코드는 제거한다.

### 3. 검증 및 커밋

```powershell
node release/scripts/qa-static.mjs
```

커밋 메시지:

```text
feat(notifications): 로그인 사번과 기기 설치 연결
```

---

## 작업 5: 관리자 운영 설정 기반 동적 스케줄러

**수정 파일**
- `apps-script/Notifications.gs`
- `apps-script/OperationalSettings.gs`
- `apps-script/Config.gs`
- `release/scripts/qa-notification-scheduler.mjs`

### 1. 실패 테스트 작성

검사 항목:

- 시간은 하드코딩 값이 아니라 `getOperationalSettings()` 결과를 사용한다.
- 알림 종류별 ON/OFF를 반영한다.
- 같은 날짜와 유형은 한 번만 발송한다.
- 토요일, 일요일은 모두 건너뛴다.
- `공휴일` 시트에 있는 날짜는 모두 건너뛴다.
- 공휴일 시트의 날짜 표기 형식이 날짜 셀 또는 문자열이어도 정규화한다.

### 2. 5분 주기 단일 트리거로 변경

기존 네 개 고정 시간 트리거 대신 하나의 스케줄러를 사용한다.

```js
function notificationSchedulerTick() {
  const settings = getOperationalSettings();
  // 현재 시각과 설정 시각 비교 → 해당 유형을 하루 한 번만 발송
}
```

Script Properties에 다음과 같은 중복 방지 키를 저장한다.

```text
LOGIFLOW_NOTIFICATION_SENT_20260722_CHECKIN_NOTICE
```

관리자가 시간을 변경하면 트리거를 다시 생성하지 않아도 다음 실행부터 반영된다.

### 3. 공휴일 제외 구현

`공휴일` 시트를 읽어 오늘 날짜가 존재하면 발송을 종료한다. 시트가 없거나 읽기 오류가 발생하면 알림 발송을 강행하지 않고 오류 로그를 남긴다.

### 4. 검증 및 커밋

```powershell
node release/scripts/qa-notification-scheduler.mjs
```

커밋 메시지:

```text
feat(notifications): 운영 설정 기반 평일 알림 스케줄러 적용
```

---

## 작업 6: 개인별 미등록 대상과 알림 설정 연동

**수정 파일**
- `apps-script/Notifications.gs`
- `firebase/functions/index.js`
- `apps-script/Index.html`
- `firebase/functions/test/notification-dispatch.test.js`

### 1. 대상자 규칙 테스트

- 07시 출근 안내: 재직 직원 중 출근 알림 ON인 직원
- 09시 출근 미등록: 당일 출근 기록이 없고 출근 알림 ON인 직원
- 18시 퇴근 안내: 재직 직원 중 퇴근 알림 ON인 직원
- 20시 퇴근 미등록: 당일 출근 기록은 있으나 퇴근 기록이 없고 퇴근 알림 ON인 직원
- 주말·공휴일: 대상자 0명

### 2. 기존 조회 함수 재사용

직원 명단과 당일 근태를 각각 한 번만 읽고 사번 기준 Map으로 변환한다. 중복 `getValues()` 호출을 추가하지 않는다.

### 3. 설정 화면 연결

직원의 `출근 알림`, `퇴근 알림` 토글은 기존 디자인을 유지하고 서버 저장 성공 후 Snackbar를 표시한다. 실패 시 로컬 상태를 원래 값으로 되돌린다.

### 4. 테스트 및 커밋

```powershell
Set-Location firebase/functions
npm test
Set-Location ../..
node release/scripts/qa-notification-scheduler.mjs
```

커밋 메시지:

```text
feat(notifications): 개인별 미등록 알림 대상 연동
```

---

## 작업 7: 배포 전 통합 검증과 운영 문서

**수정 파일**
- `release/RELEASE_CHECKLIST.md`
- `mobile/README.md`
- `firebase/README.md`
- `docs/notification-operations.md`

### 1. 통합 검증

```powershell
node release/scripts/qa-static.mjs
node release/scripts/qa-notification-client.mjs
node release/scripts/qa-notification-scheduler.mjs
Set-Location firebase/functions
npm test
```

### 2. 실제 계정이 필요한 검증 목록 기록

- Firebase 프로젝트 키 입력
- Android `google-services.json`
- iOS `GoogleService-Info.plist`
- APNs 키와 Apple Developer Team
- Apps Script Script Properties의 Firebase 브리지 URL/비밀키
- 예약 트리거 최초 설치 권한 승인
- 실기기 FCM 수신 시험

### 3. 커밋

```text
docs(release): 개인별 푸시 알림 운영 절차 정리
```

---

## 완료 기준

- 관리자 화면의 알림 ON/OFF와 시간이 실제 발송 기준이다.
- 토요일, 일요일, `공휴일` 시트 날짜에는 어떤 출퇴근 알림도 발송하지 않는다.
- 출근/퇴근 미등록 알림은 조건에 해당하는 직원에게만 간다.
- 직원 개인의 출근/퇴근 알림 OFF 설정을 반영한다.
- Android FCM과 iPhone APNs 경유 FCM 구조가 준비된다.
- 로그인하지 않은 설치는 사번에 결합되지 않는다.
- 로그아웃한 설치는 비활성화된다.
- Firebase 장애가 로그인이나 출퇴근 등록을 막지 않는다.
- 비밀키와 플랫폼 서명 파일은 GitHub에 커밋하지 않는다.

