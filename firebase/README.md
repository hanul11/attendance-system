# 한울 출퇴근 기록 PWA

이 폴더는 기존 Google Apps Script 근태 앱을 Android와 iPhone에서 홈 화면에 설치할 수 있도록 제공하는 Firebase Hosting용 PWA 셸입니다. 로그인, 출퇴근 저장 및 Google Sheets 연동은 기존 Apps Script 앱이 계속 담당합니다.

## 구성

```text
firebase/
  public/
    assets/icons/            Android/iPhone 설치 아이콘
    config/                  앱 및 Firebase 환경설정
    js/                      Apps Script 임베드와 Firebase 준비 코드
    index.html               PWA 시작 화면
    manifest.webmanifest     설치 정보
    service-worker.js        정적 앱 셸 캐시
    firebase-messaging-sw.js 향후 FCM용 Service Worker
  functions/                 향후 알림 연동용 구조
  firestore.rules            Firestore 기본 규칙
```

Service Worker는 같은 출처의 PWA 정적 파일만 캐시합니다. Apps Script iframe, Google Sheets 데이터, 로그인 정보 및 출퇴근 요청은 오프라인 캐시에 저장하지 않습니다.

## Android 설치

1. Chrome에서 Firebase Hosting 주소를 엽니다.
2. 브라우저 메뉴에서 `앱 설치` 또는 `홈 화면에 추가`를 선택합니다.
3. 설치 후 홈 화면의 `한울 근태` 아이콘으로 실행합니다.

## iPhone 설치

1. Safari에서 Firebase Hosting 주소를 엽니다.
2. 하단 공유 버튼을 누릅니다.
3. `홈 화면에 추가`를 선택합니다.
4. 추가된 `한울 근태` 아이콘으로 실행합니다.

iPhone Safari는 Android Chrome처럼 설치 안내 배너를 자동으로 보여주지 않을 수 있으므로 공유 메뉴를 사용해야 합니다.

## Firebase Hosting 연결

1. Firebase Console에서 프로젝트를 생성합니다.
2. `.firebaserc.example`을 기준으로 `.firebaserc`에 실제 프로젝트 ID를 설정합니다.
3. `public/config/firebase-config.js`의 Placeholder를 실제 Web App 설정으로 교체합니다.
4. Firebase CLI에서 로그인한 뒤 프로젝트 루트에서 배포합니다.

```text
firebase login
firebase deploy --only hosting
```

현재 단계에서는 실제 Firebase 프로젝트 연결과 Hosting 배포를 수행하지 않습니다.

