# LOGIFLOW Mobile Packaging

이 폴더는 향후 Capacitor를 이용해 Android WebView와 iPhone WKWebView 패키지를 생성하기 위한 준비 구조입니다. 이번 Sprint에서는 Capacitor 의존성 설치, Android/iOS 네이티브 프로젝트 생성, 서명, 빌드를 수행하지 않습니다.

## 준비 순서

1. `capacitor.config.example.json`을 `capacitor.config.json`으로 복사합니다.
2. 앱 ID와 운영 URL을 확정합니다.
3. Firebase Hosting 전환 전에는 기존 Apps Script Web App URL을 사용합니다.
4. Firebase Hosting 전환 후 `server.url`을 Hosting 운영 주소로 변경합니다.
5. 아이콘과 스플래시 원본이 확정되면 Android Adaptive Icon과 iOS App Icon 세트를 생성합니다.
6. Android와 iOS 프로젝트를 생성한 뒤 GPS 권한 문구와 네트워크 허용 목록을 검토합니다.

## 호환성 원칙

- HTTPS만 사용합니다.
- Android와 iOS의 Safe Area는 기존 앱의 `viewport-fit=cover`와 CSS 환경 변수를 유지합니다.
- Apps Script, Google Sheets, GPS 및 근태 계산 로직은 웹 앱에 남겨 단일 소스로 운영합니다.
- FCM과 Firestore는 Firebase 설정이 승인되기 전까지 비활성 상태로 유지합니다.
