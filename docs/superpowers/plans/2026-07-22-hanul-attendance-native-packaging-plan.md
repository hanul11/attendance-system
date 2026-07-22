# Hanul근태관리 Android/iPhone 패키징 구현 계획

> **실행 안내:** 이 계획은 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans` 절차로 항목별 검증과 커밋을 수행한다.

**목표:** 기존 Google Apps Script 근태 웹앱의 로그인, 출퇴근, 관리자, Google Sheets 연동을 유지하면서 Android APK/AAB와 iPhone TestFlight 배포가 가능한 Capacitor 앱 구조를 완성한다.

**구조:** Capacitor 앱은 Firebase Hosting 진입 화면을 로컬 WebView로 실행하고, 운영 Apps Script 웹앱으로 이동한다. 업무 데이터와 계산은 계속 Apps Script와 Google Sheets가 담당하며 네이티브 프로젝트에는 근태 데이터를 저장하지 않는다.

**기술:** Capacitor 8, Android Gradle, iOS Xcode, Firebase Hosting, HTML/CSS/JavaScript

---

## 작업 1: 배포 설정과 앱 정체성 고정

**수정 파일**
- `mobile/capacitor.config.json`
- `mobile/build-config.json`
- `firebase/public/config/app-config.js`
- `firebase/public/manifest.webmanifest`
- `firebase/public/index.html`
- `release/scripts/qa-static.mjs`

### 1. 실패하는 정적 검증 추가

`release/scripts/qa-static.mjs`에 다음 조건을 추가한다.

```js
assertIncludes(capacitorConfig.appName, "Hanul근태관리");
assertIncludes(appConfig, "hanul-logiflow-attendance.web.app");
assertIncludes(appConfig, "AKfycbwZdQADgY3SoYdTSCBhbDhhFcJpe5H8w84kDBkldoSUKcpcQgORYawg7e8WT9vr9Io");
assertIncludes(manifest.name, "Hanul근태관리");
```

실행:

```powershell
node release/scripts/qa-static.mjs
```

예상: 기존 `LOGIFLOW`, 플레이스홀더 Firebase 주소, 이전 Apps Script URL 때문에 실패한다.

### 2. 설정값 수정

- 표시 이름을 `Hanul근태관리`로 통일한다.
- 앱 ID `kr.co.hanul.logiflow`는 유지한다.
- Firebase Hosting 주소를 `https://hanul-logiflow-attendance.web.app`로 지정한다.
- 운영 Apps Script 주소를 현재 배포 URL로 지정한다.
- 버전 `1.0.0`, 빌드 `1`은 `build-config.json`에서 관리한다.
- UTF-8이 깨진 한국어 표시 문자열만 정상화한다.

### 3. 검증 및 커밋

```powershell
node release/scripts/qa-static.mjs
```

예상: 정적 설정 검사가 통과한다.

커밋 메시지:

```text
chore(mobile): Hanul근태관리 배포 설정 통일
```

---

## 작업 2: 회사 꽃 심볼 앱 아이콘 구조 완성

**수정/생성 파일**
- `mobile/resources/icon.png`
- `mobile/resources/icon-foreground.png`
- `mobile/resources/icon-background.png`
- `mobile/resources/splash.png`
- `mobile/package.json`
- `release/scripts/qa-mobile-assets.mjs`

### 1. 에셋 검증 스크립트 작성

다음을 검사한다.

- 아이콘 원본은 1024x1024 PNG이다.
- 전경 이미지는 투명 배경을 가진다.
- 꽃 심볼이 정중앙 안전영역 안에 들어간다.
- 스플래시는 단색 배경과 꽃 심볼만 사용한다.

실행:

```powershell
node release/scripts/qa-mobile-assets.mjs
```

예상: `mobile/resources`가 없으므로 실패한다.

### 2. 에셋 생성 구조 추가

- 기존 `firebase/public/assets/icons/icon-512.png`의 꽃 심볼을 원본으로 사용한다.
- Android Adaptive Icon 전경/배경과 iOS 아이콘 원본을 분리한다.
- `@capacitor/assets`를 개발 의존성으로 추가한다.

### 3. 네이티브 에셋 생성

```powershell
Set-Location mobile
npm install
npx capacitor-assets generate
Set-Location ..
node release/scripts/qa-mobile-assets.mjs
```

예상: Android/iOS용 아이콘 및 스플래시 리소스가 생성되고 검사가 통과한다.

커밋 메시지:

```text
feat(mobile): 회사 꽃 심볼 앱 아이콘 구성
```

---

## 작업 3: Android 프로젝트 생성 및 동기화

**생성/수정 파일**
- `mobile/android/**`
- `mobile/capacitor.config.json`
- `release/scripts/qa-android.mjs`

### 1. Android 구성 검증 추가

검사 항목:

- 패키지 ID `kr.co.hanul.logiflow`
- 앱 표시명 `Hanul근태관리`
- 인터넷 권한 존재
- HTTPS만 허용
- Firebase/Apps Script 도메인 이동 허용
- 버전명과 빌드 번호가 공통 설정과 일치

### 2. Android 프로젝트 생성

```powershell
Set-Location mobile
npm install
npx cap add android
npx cap sync android
Set-Location ..
```

기존 프로젝트가 있으면 `cap add`는 생략하고 `cap sync android`만 수행한다.

### 3. 구성 반영 및 정적 검증

```powershell
node release/scripts/qa-android.mjs
```

예상: 모든 Android 설정 검사가 통과한다.

### 4. 가능한 환경에서 디버그 빌드

```powershell
Set-Location mobile/android
./gradlew assembleDebug
```

예상: Android SDK/JDK가 구성된 경우 APK가 생성된다. 로컬 SDK가 없으면 코드 준비 완료와 환경 차단 사유를 구분해 보고한다.

커밋 메시지:

```text
feat(android): Hanul근태관리 네이티브 프로젝트 추가
```

---

## 작업 4: iOS 프로젝트 생성 및 TestFlight 설정 준비

**생성/수정 파일**
- `mobile/ios/**`
- `release/scripts/qa-ios.mjs`
- `mobile/README.md`

### 1. iOS 구성 검증 추가

검사 항목:

- Bundle ID `kr.co.hanul.logiflow`
- 표시명 `Hanul근태관리`
- 버전/빌드 일치
- 알림 권한 설명 문자열 존재
- WKWebView가 HTTPS 운영 URL을 사용

### 2. iOS 프로젝트 생성

macOS/Xcode 환경에서 실행할 명령을 프로젝트 문서에 고정한다.

```bash
cd mobile
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

Windows에서는 iOS 파일 구조와 설정 검증까지만 수행하며, 서명·Archive·TestFlight 업로드는 Mac에서 수행한다.

### 3. 검증 및 커밋

```powershell
node release/scripts/qa-ios.mjs
```

커밋 메시지:

```text
feat(ios): TestFlight 배포 프로젝트 구조 준비
```

---

## 작업 5: WebView 실행 흐름과 회귀 검증

**수정 파일**
- `firebase/public/js/app-bootstrap.js`
- `release/scripts/qa-native-flow.mjs`
- `release/RELEASE_CHECKLIST.md`
- `mobile/README.md`

### 1. 실행 흐름 검증 작성

검사 항목:

- 앱 시작 후 운영 Apps Script URL로 이동한다.
- iframe으로 Apps Script를 삽입하지 않는다.
- Service Worker가 Apps Script/API 요청을 캐시하거나 가로채지 않는다.
- 외부 링크 외에는 시스템 브라우저로 불필요하게 빠지지 않는다.
- 기존 로그인·GPS 없는 출퇴근·관리자 로직 파일은 변경되지 않는다.

### 2. 최소 부트스트랩 정리

앱 진입, 알림 초기화, Apps Script 이동의 순서를 명확히 분리하고 중복 이벤트 등록을 제거한다.

### 3. 최종 정적 QA

```powershell
node release/scripts/qa-static.mjs
node release/scripts/qa-mobile-assets.mjs
node release/scripts/qa-android.mjs
node release/scripts/qa-ios.mjs
node release/scripts/qa-native-flow.mjs
```

커밋 메시지:

```text
test(release): 모바일 패키징 실행 흐름 검증 추가
```

---

## 완료 기준

- Android 프로젝트가 APK/AAB 빌드 가능한 구조다.
- iOS 프로젝트가 Mac에서 서명 후 TestFlight 업로드 가능한 구조다.
- 앱 이름은 `Hanul근태관리`, 아이콘은 회사 꽃 심볼이다.
- 실행 시 운영 Apps Script 웹앱으로 이동한다.
- 기존 Apps Script 근태 및 Google Sheets 구조는 변경하지 않는다.
- 실제 배포 키, 서명 파일, Firebase 비밀값은 저장소에 커밋하지 않는다.

