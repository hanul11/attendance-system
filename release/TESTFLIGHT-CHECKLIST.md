# LOGIFLOW TestFlight 체크리스트

## 1. Apple 준비

- [ ] Apple Developer Program 계정 준비
- [ ] App Store Connect에서 LOGIFLOW 앱 생성
- [ ] Bundle ID를 `kr.co.hanul.logiflow`로 등록
- [ ] `release/release-config.json`에 Team ID와 App Store Connect App ID 입력
- [ ] 내부 테스터 그룹과 테스트 담당자 등록

## 2. Firebase 준비

- [ ] Firebase 프로젝트 생성
- [ ] Firebase Hosting 배포 URL 확정
- [ ] iOS 앱을 Bundle ID `kr.co.hanul.logiflow`로 등록
- [ ] `GoogleService-Info.plist`를 `mobile/ios/App/App/`에 추가
- [ ] APNs 인증 키를 Firebase Cloud Messaging에 등록
- [ ] Firebase 설정 Placeholder를 실제 값으로 교체하고 활성화

## 3. 앱 자산

- [ ] 투명 여백이 과하지 않은 1024x1024 PNG 앱 아이콘 준비
- [ ] iPhone Splash Screen 확인
- [ ] 앱 이름 LOGIFLOW와 한글 표시명 확인

## 4. macOS / Xcode

- [ ] Node.js와 Xcode 설치
- [ ] `cd mobile && npm install`
- [ ] `npm run add:ios`
- [ ] `npm run sync:ios`
- [ ] `npm run open:ios`
- [ ] Signing Team과 Automatic Signing 설정
- [ ] Push Notifications capability 추가
- [ ] Background Modes의 Remote notifications 활성화
- [ ] 실제 기기에서 로그인, 출근, 퇴근 확인

## 5. 운영 확인

- [ ] 운영 Apps Script URL 확인
- [ ] 근태현황 읽기/쓰기 확인
- [ ] 관리자 계정 `2023068` 확인
- [ ] Firebase 알림 토큰 등록과 알림 ON/OFF 확인
- [ ] `npm run release:check:strict` 통과

## 6. TestFlight 제출

- [ ] Version과 Build Number 증가 확인
- [ ] Xcode Archive 생성
- [ ] App Store Connect 업로드 및 처리 완료 확인
- [ ] 수출 규정, 개인정보 처리, 테스트 정보 입력
- [ ] 내부 테스터에게 Build 배포
- [ ] 설치, 자동 로그인, 출퇴근 저장, 알림 진입 최종 확인

