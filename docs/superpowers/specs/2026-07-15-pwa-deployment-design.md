# 한울 출퇴근 기록 PWA 배포 설계

## 목표

현재 LOGIFLOW Google Apps Script 근태관리 기능을 변경하지 않고 Android와 iPhone에서 홈 화면에 설치할 수 있는 PWA로 제공한다.

## 현재 구조

- `apps-script/Index.html`: 직원 및 관리자 모바일 UI
- `apps-script/Code.gs`: 로그인, 출퇴근, 근태조회, 통계, 관리자 API
- `apps-script/OperationalSettings.gs`: GPS와 알림 운영 설정
- Google Sheets: 직원 사번 명단, 근태현황, 근태 로그
- 브라우저 저장소: 자동 로그인 및 개인 앱 설정
- `firebase/public`: PWA와 향후 Firebase 연동을 위한 호스팅 셸 초안

## 채택 구조

Firebase Hosting이 PWA의 설치 진입점과 정적 앱 셸을 제공한다. 앱 셸은 기존 Apps Script 웹앱을 전체 화면 iframe으로 실행한다. 로그인, 출퇴근 저장, GPS 검증, 관리자 권한, Google Sheets 읽기와 쓰기는 기존 Apps Script가 계속 담당한다.

```text
Android/iPhone 홈 화면
        |
Firebase Hosting PWA
  - manifest
  - service worker
  - 앱 아이콘
  - 시작 화면
        |
Google Apps Script Web App
        |
Google Sheets
```

## PWA 구성

### Manifest

- 앱 이름: `한울 출퇴근 기록`
- 짧은 이름: `한울 근태`
- 시작 경로: `/?source=pwa`
- 표시 모드: `standalone`
- 화면 방향: `portrait-primary`
- 테마 색상: `#2563EB`
- 배경 색상: `#F7F8FA`
- 언어: `ko-KR`

### 아이콘

기존 한울 꽃 심볼을 사용해 다음 PNG를 제공한다.

- `icon-192.png`: Android 및 PWA 기본 아이콘
- `icon-512.png`: 고해상도 설치 아이콘
- `icon-maskable-512.png`: Android Maskable Icon
- `apple-touch-icon-180.png`: iPhone 홈 화면 아이콘

심볼은 정사각형 브랜드 배경 안에서 잘리지 않도록 안전영역을 유지한다.

### Service Worker

Firebase Hosting의 정적 앱 셸만 캐시한다. Google Apps Script 근태 데이터와 API 응답은 캐시하지 않는다.

- 설치 시 manifest, 시작 화면, 설정 파일, 앱 스크립트와 아이콘 캐시
- 화면 이동 요청은 네트워크 우선, 실패 시 캐시된 시작 화면 표시
- 버전이 바뀌면 이전 캐시 제거
- 출퇴근·로그인·Sheets 요청은 항상 온라인 처리

따라서 앱 셸은 오프라인에서도 열릴 수 있지만 근태 기능은 인터넷 연결이 필요하다.

## 모바일 적용

- `viewport-fit=cover`와 Safe Area 유지
- Android Chrome의 설치 배너 및 홈 화면 추가 지원
- iPhone Safari의 홈 화면에 추가 지원
- iOS 상태 표시줄과 Apple Touch Icon 메타 태그 적용
- 전체 화면 iframe에 `geolocation` 권한 유지

## 데이터 흐름

1. 사용자가 설치된 PWA를 실행한다.
2. Firebase Hosting 앱 셸이 즉시 표시된다.
3. 기존 Apps Script 웹앱을 로드한다.
4. 자동 로그인 정보는 기존 로직대로 유지된다.
5. 출퇴근 등록 시 Apps Script와 Google Sheets가 기존 방식으로 처리한다.

## 변경 범위

- 수정: `firebase/public/manifest.webmanifest`
- 수정: `firebase/public/index.html`
- 수정: `firebase/public/service-worker.js`
- 수정: `firebase/public/config/app-config.js`
- 생성: `firebase/public/assets/icons/*.png`
- 수정: PWA 정적 검증 스크립트 및 Firebase 문서

`apps-script/Code.gs`, Google Sheets 구조, 근태 계산과 GPS 검증 로직은 변경하지 않는다.

## 오류 처리

- Apps Script를 불러오지 못하면 네트워크 연결 안내를 표시한다.
- Service Worker 등록 실패는 앱 실행을 차단하지 않는다.
- 누락된 아이콘이나 manifest 오류는 정적 QA에서 차단한다.
- iframe의 GPS 권한은 기존 직원 화면의 안내 메시지를 사용한다.

## 검증 기준

- manifest JSON 문법 및 필수 필드 확인
- 모든 아이콘 파일 존재, PNG 형식과 정확한 크기 확인
- Service Worker가 모든 앱 셸 경로를 참조하는지 확인
- Firebase Hosting 앱 셸의 모바일 메타 태그 확인
- Apps Script URL과 iframe geolocation 권한 확인
- 기존 Apps Script 정적 QA 통과
- Preview, Run, Deploy는 별도 승인 전 실행하지 않는다.

## 배포 전 사용자 작업

- Firebase 프로젝트 생성 또는 기존 프로젝트 선택
- Firebase Hosting 프로젝트 ID 입력
- Firebase CLI 로그인과 Hosting 배포
- Android Chrome과 iPhone Safari 실제 기기 설치 확인

