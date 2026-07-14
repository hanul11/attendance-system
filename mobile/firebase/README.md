# Native Firebase 파일 배치

Firebase Console에서 앱을 등록한 뒤 내려받은 파일을 네이티브 프로젝트에 배치합니다.

- Android: `mobile/android/app/google-services.json`
- iPhone: `mobile/ios/App/App/GoogleService-Info.plist`

두 파일은 프로젝트 및 계정 정보를 포함하므로 Git에 커밋하지 않습니다.

## Android

- Firebase Android App의 Package Name은 `kr.co.hanul.logiflow`로 등록합니다.
- 흰색 단색의 투명 배경 알림 아이콘을 Android 리소스에 추가합니다.
- Play Console 배포 전 앱 서명키와 AAB 서명을 설정합니다.

## iPhone

- Firebase iOS App의 Bundle ID는 `kr.co.hanul.logiflow`로 등록합니다.
- Apple Developer에서 APNs 인증 키를 생성해 Firebase Console에 업로드합니다.
- Xcode에서 Push Notifications 및 Background Modes의 Remote notifications를 활성화합니다.
- TestFlight 배포용 Signing Team과 Provisioning Profile을 설정합니다.
