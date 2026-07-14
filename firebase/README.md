# LOGIFLOW Firebase 준비 구조

이 디렉터리는 다음 Sprint에서 Firebase Hosting, Cloud Messaging, Firestore를 연결하기 위한 비활성 준비 구조입니다. 현재 Apps Script 앱과 Google Sheets 연동에는 영향을 주지 않습니다.

## 현재 포함 범위

- Firebase Hosting 기본 설정
- PWA Web App Manifest
- FCM 서비스 워커 진입점
- Firebase Web 설정 예시
- 기본 차단 상태의 Firestore 보안 규칙

## 다음 Sprint 연결 순서

1. Firebase 프로젝트와 Web App을 생성합니다.
2. `.firebaserc.example`을 `.firebaserc`로 복사한 뒤 실제 프로젝트 ID를 입력합니다.
3. `firebase-config.example.js`를 실제 설정 파일로 교체합니다.
4. 현재 Apps Script UI를 Hosting용 정적 앱 구조로 이전하고 `index.html`을 추가합니다.
5. Apps Script Web App을 근태 API로 유지하고 허용 출처와 인증 정책을 확정합니다.
6. FCM 토큰 저장 컬렉션과 사용자별 알림 설정 규칙을 설계합니다.
7. Android와 iOS 설치형 PWA에서 알림 권한, 백그라운드 수신, 알림 클릭 이동을 검증합니다.

실제 Firebase 프로젝트 정보, FCM 토큰, VAPID 키는 저장소에 커밋하지 않습니다. 현재 상태에서는 푸시 알림을 요청하거나 발송하지 않습니다.
