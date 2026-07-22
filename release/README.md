# LOGIFLOW Release 준비

이 폴더는 기존 Google Apps Script 및 Google Sheets 근태 로직을 유지하면서 PWA, iPhone, Android 배포에 필요한 설정과 검증 자료를 관리합니다.

## 정적 QA

프로젝트 루트에서 다음 검증을 실행합니다.

```text
node release/scripts/qa-static.mjs
```

검증 항목에는 Apps Script API 연결, 중복 함수, DOM 연결, JavaScript 문법, 30분 단위 버림 규칙, 운영 설정, PWA manifest, 모바일 메타데이터, Service Worker 캐시 경로 및 설치 아이콘 크기가 포함됩니다.

공휴일 운영 전에는 Calendar 권한 승인과 `installDailyHolidaySyncTrigger` 실행이 필요합니다. 직원의 근태 수정 요청은 기존 `근태 로그`에만 접수되며, 관리자는 요청을 확인한 뒤 `근태현황`을 수동으로 반영합니다.

## Release 설정 점검

```text
node release/scripts/validate-release.mjs
node release/scripts/validate-release.mjs --platform=ios
node release/scripts/validate-release.mjs --platform=android
```

Firebase 프로젝트, Apple 서명, Google Play 등록 정보처럼 실제 계정이 필요한 항목은 설정 전까지 `BLOCK`으로 표시될 수 있습니다.

## PWA 배포 순서

1. `release/release-config.json`의 버전과 빌드 번호를 확인합니다.
2. Firebase 프로젝트 ID와 Web App 설정을 입력합니다.
3. 정적 QA가 모두 통과하는지 확인합니다.
4. Firebase CLI로 Hosting만 배포합니다.
5. Android Chrome과 iPhone Safari에서 설치 후 로그인과 출퇴근 연결을 실제 기기로 확인합니다.
6. 관리자 화면에서 수정 요청 목록, 60초 자동 갱신, 직원 상세창을 확인합니다.

PWA 설치는 HTTPS Hosting 주소에서만 정상 동작합니다. `file://` 주소나 Apps Script 편집기 미리보기 주소는 설치용 운영 주소로 사용하지 않습니다.

## 사용자 계정이 필요한 후속 작업

- Firebase 프로젝트 생성 및 Hosting 배포
- 실제 Android 기기에서 Chrome 설치 확인
- 실제 iPhone에서 Safari 홈 화면 추가 확인
- Apple Developer 및 Google Play 계정을 사용하는 네이티브 패키징 작업
