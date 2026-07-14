# LOGIFLOW Firebase 연결 가이드

이 디렉터리는 기존 Google Apps Script 근태 앱을 유지하면서 Firebase Hosting, Firestore, Cloud Messaging을 연결하기 위한 배포 구조입니다. Firebase 값은 모두 Placeholder이며, 실제 프로젝트를 연결하기 전에는 알림을 요청하거나 발송하지 않습니다.

## 구성

```text
firebase/
  functions/                 FCM 토큰 저장 및 알림 발송 API
  public/
    config/                  앱 및 Firebase 환경설정
    js/                      Apps Script 임베드 및 FCM 브리지
    assets/icons/            PWA/알림 아이콘 위치
    index.html               Firebase Hosting 진입 화면
    manifest.webmanifest     PWA 설치 정보
    service-worker.js        앱 셸 캐시
    firebase-messaging-sw.js 백그라운드 웹 알림
  firestore.rules            클라이언트 직접 접근 차단 규칙
```

## Firebase 프로젝트 연결

1. Firebase Console에서 Web, Android, iOS 앱을 생성합니다.
2. `.firebaserc.example`의 프로젝트 ID를 채워 `.firebaserc`로 저장합니다.
3. `public/config/firebase-config.js`의 Placeholder를 Web App 값으로 교체하고 `enabled`를 `true`로 바꿉니다.
4. `public/config/app-config.js`와 `apps-script/Index.html`의 Firebase Hosting 도메인 Placeholder를 실제 도메인으로 교체합니다.
5. Web Push 인증서의 VAPID 공개 키를 `firebase-config.js`에 입력합니다.
6. Functions 비밀값을 등록합니다.

```text
firebase functions:secrets:set LOGIFLOW_BRIDGE_SECRET
```

7. Apps Script의 스크립트 속성에 아래 값을 등록합니다.

```text
LOGIFLOW_NOTIFICATION_API_BASE_URL=https://asia-northeast3-YOUR_PROJECT_ID.cloudfunctions.net
LOGIFLOW_NOTIFICATION_BRIDGE_SECRET=Functions와 동일한 비밀값
```

8. Apps Script 편집기에서 `setupNotificationTriggers`를 한 번 실행해 07:00, 09:00, 18:00, 20:00 예약 트리거를 생성합니다.

Apps Script 시간 기반 트리거는 Google 정책상 지정 분 전후로 실행될 수 있습니다. 분 단위의 절대 정시 발송이 필요하면 추후 Cloud Scheduler로 전환합니다.

## Firestore 구조

알림 정보는 `notificationUsers/{employeeId}/devices/{tokenHash}`에 저장됩니다. 브라우저는 Firestore에 직접 쓰지 않으며, Apps Script가 직원 재직 상태를 확인한 뒤 비밀값으로 보호된 Cloud Function에 전달합니다. 현재 Firestore 규칙은 클라이언트 직접 접근을 차단합니다.

## 배포 전 필수 자산

- `public/assets/icons/icon-192.png`
- `public/assets/icons/icon-512.png`
- `public/assets/icons/icon-maskable-512.png`
- `public/assets/icons/apple-touch-icon-180.png`

실제 Firebase 배포, Functions 비밀값 등록, 트리거 실행은 이 Sprint에서 수행하지 않습니다.
