# LOGIFLOW Android/iPhone 패키징

이 디렉터리는 Firebase Hosting에 배포된 LOGIFLOW를 Capacitor 8 기반 Android APK/AAB 및 iPhone TestFlight 앱으로 패키징하기 위한 설정입니다. 기존 Apps Script와 Google Sheets 근태 로직은 변경하지 않습니다.

## 사전 준비

1. Node.js 22와 Android Studio를 설치합니다.
2. iPhone 빌드는 macOS, Xcode, Apple Developer 계정이 필요합니다.
3. `capacitor.config.json`의 Firebase Hosting Placeholder를 실제 주소로 교체합니다.
4. `firebase/README.md`에 따라 Android/iOS Firebase 설정 파일을 추가합니다.
5. 실제 앱 아이콘과 Splash 자산을 준비합니다.

## 네이티브 프로젝트 생성

아래 명령은 Firebase 프로젝트와 서명 계정 준비 후 실행합니다.

```text
cd mobile
npm install
npx cap add android
npx cap add ios
npm run sync
```

Android는 Android Studio에서 APK 또는 서명된 AAB를 생성합니다. iPhone은 Xcode에서 Bundle ID, Signing Team, Push Notifications capability를 확인한 뒤 Archive하여 TestFlight로 업로드합니다.

## 버전

공통 버전은 `build-config.json`에서 관리합니다.

- Version: `1.0.0`
- Build: `1`
- Android: versionName `1.0.0`, versionCode `1`
- iOS: MARKETING_VERSION `1.0.0`, CURRENT_PROJECT_VERSION `1`

네이티브 프로젝트 생성 후 `android-build.example.gradle`과 `ios-build.example.xcconfig`의 값을 각 플랫폼 설정에 반영합니다.

## 주의

- 운영 환경은 HTTPS만 사용합니다.
- Android 알림용 단색 투명 아이콘을 별도로 준비해야 합니다.
- iPhone FCM은 APNs 인증 키와 Push Notifications capability가 필요합니다.
- `google-services.json`, `GoogleService-Info.plist`, 서명키 및 인증서는 저장소에 커밋하지 않습니다.
- 실제 설치, 빌드, 서명, TestFlight 업로드는 이 Sprint에서 수행하지 않습니다.
