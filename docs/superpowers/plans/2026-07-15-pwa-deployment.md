# 한울 출퇴근 기록 PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Google Apps Script 근태 기능을 유지하면서 Android와 iPhone 홈 화면에 설치 가능한 `한울 출퇴근 기록` PWA를 완성한다.

**Architecture:** Firebase Hosting이 manifest, Service Worker, 앱 아이콘과 시작 화면을 제공하고 기존 Apps Script 웹앱을 전체 화면 iframe으로 실행한다. Service Worker는 정적 앱 셸만 캐시하며 로그인, GPS, 출퇴근 및 Google Sheets 데이터는 캐시하지 않는다.

**Tech Stack:** HTML, CSS, JavaScript, Web App Manifest, Service Worker, Firebase Hosting, Google Apps Script

## Global Constraints

- `apps-script/Code.gs`와 Google Sheets 구조를 변경하지 않는다.
- 기존 로그인, 자동 로그인, GPS, 출퇴근 및 관리자 기능을 변경하지 않는다.
- 앱 이름은 `한울 출퇴근 기록`, 짧은 이름은 `한울 근태`로 사용한다.
- PWA 표시 모드는 `standalone`, 방향은 `portrait-primary`로 설정한다.
- 테마 색상은 `#2563EB`, 배경 색상은 `#F7F8FA`로 유지한다.
- 실제 Firebase 프로젝트 연결과 Hosting 배포는 이번 계획에 포함하지 않는다.

---

### Task 1: PWA 계약 정적 검사

**Files:**
- Modify: `release/scripts/qa-static.mjs`
- Test: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `firebase/public/manifest.webmanifest`, `firebase/public/index.html`, `firebase/public/service-worker.js`, PNG 아이콘
- Produces: manifest, 모바일 메타 태그, 캐시 경로, 아이콘 크기를 검증하는 정적 QA

- [ ] **Step 1: 실패하는 PWA 계약 검사를 추가한다**

`qa-static.mjs`에서 manifest를 JSON으로 읽고 다음 조건을 검사한다.

```js
const manifest = JSON.parse(read("firebase/public/manifest.webmanifest"));
check("PWA app name", manifest.name === "한울 출퇴근 기록", manifest.name);
check("PWA short name", manifest.short_name === "한울 근태", manifest.short_name);
check("PWA standalone mode", manifest.display === "standalone", manifest.display);
check("PWA start URL", manifest.start_url === "/?source=pwa", manifest.start_url);
```

PNG의 IHDR를 읽어 실제 너비와 높이를 확인하는 함수를 추가하고 `192x192`, `512x512`, `512x512`, `180x180`을 검증한다. `index.html`에 manifest, Apple Touch Icon, viewport, theme-color 메타 태그가 있는지 검사한다. Service Worker가 네 아이콘과 정적 앱 셸 파일을 포함하는지 검사한다.

- [ ] **Step 2: 검사가 실패하는지 확인한다**

Run:

```powershell
& 'C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' release\scripts\qa-static.mjs
```

Expected: `PWA app name` 또는 `PWA icon assets` 검사가 실패한다.

- [ ] **Step 3: 검사 코드의 JavaScript 문법을 확인한다**

Run:

```powershell
& 'C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check release\scripts\qa-static.mjs
```

Expected: exit code `0`.

- [ ] **Step 4: 검사 변경을 커밋한다**

Commit message:

```text
test: add PWA installation contract checks
```

---

### Task 2: Manifest와 모바일 설치 메타데이터

**Files:**
- Modify: `firebase/public/manifest.webmanifest`
- Modify: `firebase/public/index.html`
- Modify: `firebase/public/config/app-config.js`

**Interfaces:**
- Consumes: 기존 Apps Script 웹앱 URL
- Produces: Android와 iPhone이 인식하는 설치 메타데이터와 시작 화면

- [ ] **Step 1: manifest의 앱 정보를 변경한다**

다음 필드를 정확히 적용한다.

```json
{
  "id": "/",
  "name": "한울 출퇴근 기록",
  "short_name": "한울 근태",
  "description": "한울생약 임직원을 위한 출퇴근 기록 앱",
  "lang": "ko-KR",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "background_color": "#F7F8FA",
  "theme_color": "#2563EB",
  "orientation": "portrait-primary"
}
```

기존 네 아이콘 경로와 `business`, `productivity` 카테고리를 유지한다.

- [ ] **Step 2: iPhone 및 Android 메타 태그를 정리한다**

`index.html`에서 다음 값을 적용한다.

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2563EB">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="한울 근태">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon-180.png">
<title>한울 출퇴근 기록</title>
```

시작 화면 제목을 `한울 출퇴근 기록`, 보조 문구를 `스마트 근태관리`로 변경한다. iframe의 `allow="geolocation"`과 Apps Script 연결 방식은 유지한다.

- [ ] **Step 3: 앱 설정 이름을 manifest와 맞춘다**

`app-config.js`의 `appName`만 다음과 같이 변경한다.

```js
appName: "한울 출퇴근 기록"
```

기존 `apiUrl`, `launchMode`, `trustedAppOrigins`는 변경하지 않는다.

- [ ] **Step 4: 정적 QA를 실행한다**

Expected: 앱 이름, manifest 및 모바일 메타 검사는 통과하고 아이콘 검사는 아직 실패한다.

- [ ] **Step 5: manifest 변경을 커밋한다**

Commit message:

```text
feat: configure Hanul attendance PWA metadata
```

---

### Task 3: 한울 앱 아이콘 자산

**Files:**
- Create: `firebase/public/assets/icons/icon-192.png`
- Create: `firebase/public/assets/icons/icon-512.png`
- Create: `firebase/public/assets/icons/icon-maskable-512.png`
- Create: `firebase/public/assets/icons/apple-touch-icon-180.png`
- Modify: `firebase/public/assets/icons/README.md`

**Interfaces:**
- Consumes: `outputs/hanul-company-logo-transparent.png`의 한울 꽃 심볼
- Produces: manifest와 iPhone 홈 화면에서 사용하는 정확한 크기의 PNG 아이콘

- [ ] **Step 1: 원본 꽃 심볼의 형태와 색상을 확인한다**

원본의 좌측 꽃 심볼만 사용하고 `hanul` 글자는 포함하지 않는다. 꽃 심볼을 다시 그리거나 색을 변경하지 않는다.

- [ ] **Step 2: 네 아이콘을 생성한다**

모든 아이콘은 정사각형 `#F7F8FA` 배경을 사용한다. 일반 아이콘은 심볼이 캔버스의 약 72%를 차지하게 중앙 배치한다. Maskable Icon은 핵심 심볼이 중앙 66% 안전영역 안에 들어가게 배치한다.

Expected dimensions:

```text
icon-192.png              192 x 192
icon-512.png              512 x 512
icon-maskable-512.png     512 x 512
apple-touch-icon-180.png  180 x 180
```

- [ ] **Step 3: 아이콘 문서를 실제 적용 상태로 변경한다**

`README.md`에서 “이미지는 생성하지 않는다” 문구를 제거하고 각 파일의 배경색, 안전영역, 용도를 기록한다.

- [ ] **Step 4: 정적 QA를 실행한다**

Expected: 네 PNG의 존재와 실제 크기 검사가 모두 통과한다.

- [ ] **Step 5: 아이콘을 커밋한다**

Commit message:

```text
feat: add Hanul PWA icon assets
```

---

### Task 4: Service Worker 캐시 안정화

**Files:**
- Modify: `firebase/public/service-worker.js`
- Test: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: manifest, 앱 셸 JavaScript, 네 아이콘
- Produces: 정적 셸 캐시와 네트워크 우선 화면 이동 처리

- [ ] **Step 1: 캐시 버전을 갱신하고 아이콘 경로를 추가한다**

```js
const CACHE_NAME = "hanul-attendance-shell-v1";
```

`APP_SHELL`에 다음을 포함한다.

```js
"/assets/icons/icon-192.png",
"/assets/icons/icon-512.png",
"/assets/icons/icon-maskable-512.png",
"/assets/icons/apple-touch-icon-180.png"
```

- [ ] **Step 2: 정적 파일의 실패 응답을 캐시에 저장하지 않도록 한다**

동일 출처 GET 요청에 대해 캐시 우선으로 응답하되 네트워크 응답이 성공한 경우에만 동적 캐시를 갱신한다. Apps Script iframe URL과 Google Sheets 요청은 다른 출처이므로 캐시 처리 대상에서 제외한다.

- [ ] **Step 3: 전체 정적 QA를 실행한다**

Run:

```powershell
& 'C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' release\scripts\qa-static.mjs
```

Expected: 모든 검사가 통과하고 `0 failed`가 출력된다.

- [ ] **Step 4: Release 검사에서 PWA 관련 차단이 없는지 확인한다**

Run:

```powershell
& 'C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' release\scripts\validate-release.mjs
```

Expected: `App icon source`와 `GPS production data`가 PASS다. Firebase 계정과 스토어 서명 Placeholder는 별도 BLOCK으로 남을 수 있다.

- [ ] **Step 5: 캐시 변경을 커밋한다**

Commit message:

```text
feat: complete PWA shell caching
```

---

### Task 5: 문서와 최종 검증

**Files:**
- Modify: `firebase/README.md`
- Modify: `release/README.md`

**Interfaces:**
- Consumes: 완성된 PWA 구조
- Produces: Android/iPhone 설치 및 Firebase Hosting 배포 절차

- [ ] **Step 1: Android 설치 방법을 기록한다**

Chrome에서 Hosting URL을 열고 메뉴의 `앱 설치` 또는 `홈 화면에 추가`를 선택하는 절차를 기록한다.

- [ ] **Step 2: iPhone 설치 방법을 기록한다**

Safari에서 Hosting URL을 열고 공유 메뉴의 `홈 화면에 추가`를 선택하는 절차를 기록한다. iPhone에서는 설치 배너가 자동 표시되지 않는다는 점을 명시한다.

- [ ] **Step 3: Firebase 연결 전 남은 설정을 기록한다**

Firebase 프로젝트 ID, `.firebaserc`, `firebase-config.js`, Firebase CLI 로그인과 `firebase deploy --only hosting`을 사용자 작업으로 구분한다.

- [ ] **Step 4: 최종 정적 검증을 실행한다**

Expected:

```text
qa-static.mjs: 0 failed
validate-release.mjs: PWA 아이콘 PASS, Firebase 계정 Placeholder만 BLOCK
```

- [ ] **Step 5: 문서와 최종 결과를 커밋한다**

Commit message:

```text
docs: add PWA installation and deployment guide
```

- [ ] **Step 6: GitHub PR을 스쿼시 병합한다**

Squash commit message:

```text
feat: prepare Hanul attendance PWA
```

