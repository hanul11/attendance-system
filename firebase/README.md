# LOGIFLOW Firebase and PWA Preparation

이 폴더는 기존 Google Apps Script 근태 앱을 유지하면서 Firebase Hosting, PWA, FCM, Firestore 및 모바일 패키징을 단계적으로 연결하기 위한 준비 구조입니다.

## 구조

```text
firebase/
  public/
    assets/icons/       앱 아이콘 규격 및 향후 PNG 위치
    assets/splash/      iPhone 시작 이미지 규격 및 향후 PNG 위치
    config/             앱, Firebase, API 환경설정
    js/                 PWA 및 Firebase 초기화 진입점
    index.html          설치형 앱 시작 화면
    manifest.webmanifest
    service-worker.js   PWA 캐시 및 단일 Service Worker 진입점
    firebase-messaging-sw.js
  firestore.rules       기본 차단 상태의 Firestore 규칙
```

## 현재 동작

- Firebase Hosting 시작 화면은 `config/app-config.js`의 Apps Script URL로 이동합니다.
- Service Worker는 동일 출처의 앱 시작 파일만 캐시합니다.
- 기존 Apps Script와 Google Sheets의 로그인, GPS, 출퇴근 및 근태 계산 로직은 변경하지 않습니다.
- Firebase 설정은 `enabled: false`이며 실제 SDK, FCM 토큰, Firestore 연결을 수행하지 않습니다.
- 아이콘과 iPhone Splash 이미지는 규격과 경로만 준비되어 있습니다.

## Firebase 연결 절차

1. Firebase 프로젝트와 Web App을 생성합니다.
2. `.firebaserc.example`의 프로젝트 ID를 채워 `.firebaserc`로 저장합니다.
3. `public/config/firebase-config.js`에 Web App 설정값을 입력합니다.
4. Firebase SDK 연결 코드를 `public/js/firebase-bootstrap.js`에 추가합니다.
5. 기능 검증 후 `enabled`를 `true`로 변경합니다.
6. FCM 토큰 저장 구조와 알림 동의 정책을 확정한 뒤 Messaging을 연결합니다.
7. Firestore 컬렉션 설계와 권한 정책이 확정되기 전에는 현재의 전체 차단 규칙을 유지합니다.

## 배포 전 필수 자산

`manifest.webmanifest`는 설치 구조를 완성하기 위해 아래 경로를 참조합니다. 실제 배포 전에 반드시 PNG 파일을 추가해야 합니다.

- `public/assets/icons/icon-192.png`
- `public/assets/icons/icon-512.png`
- `public/assets/icons/icon-maskable-512.png`
- `public/assets/icons/apple-touch-icon-180.png`

현재 Sprint에서는 Preview, Run, Deploy 및 네이티브 빌드를 수행하지 않습니다.
