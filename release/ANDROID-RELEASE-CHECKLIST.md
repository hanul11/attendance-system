# LOGIFLOW Android 배포 체크리스트

## Google Play 준비

- [ ] Google Play Console 개발자 계정 준비
- [ ] 패키지명 `kr.co.hanul.logiflow`로 앱 생성
- [ ] 내부 테스트 트랙과 테스터 목록 구성
- [ ] Play App Signing 활성화

## Firebase 준비

- [ ] Firebase에 Android 앱 등록
- [ ] `google-services.json`을 `mobile/android/app/`에 추가
- [ ] Firebase Authentication, Messaging, Firestore 사용 여부 확정

## Android 프로젝트

- [ ] `cd mobile && npm install`
- [ ] `npm run add:android`
- [ ] `npm run sync:android`
- [ ] `npm run open:android`
- [ ] 512x512 Play Store 아이콘과 Adaptive Icon 준비
- [ ] 앱 표시명과 Splash Screen 확인

## 서명과 산출물

- [ ] Upload Key와 Keystore 생성
- [ ] `release/android/keystore.properties.example`을 참고해 로컬 설정 생성
- [ ] Keystore와 비밀번호가 GitHub에 포함되지 않았는지 확인
- [ ] 내부 직접 설치용 서명 APK 생성
- [ ] Google Play 내부 테스트용 서명 AAB 생성
- [ ] 새 배포마다 Version Code 증가

## 운영 확인

- [ ] 실제 기기에서 로그인, 자동 로그인, 출근, 퇴근 확인
- [ ] 근태·통계·관리자·공지사항·설정 확인
- [ ] Google Sheets `근태현황` 저장 확인
- [ ] `npm run qa:static` 통과
- [ ] `npm run release:check:android:strict` 통과

