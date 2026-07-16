# LOGIFLOW Apps Script 운영 구성

이 디렉터리는 LOGIFLOW 근태관리 앱의 Google Apps Script 운영 소스입니다.

## 파일 구성

- `Config.gs`: 앱 이름, 버전, Build, Web App URL, Spreadsheet ID, 시트명과 운영 상수
- `Utils.gs`: 날짜, 시간, 30분 단위 버림과 표시 변환 공통 함수
- `OperationalSettings.gs`: Script Properties 기반 알림 운영 설정
- `Code.gs`: 로그인, 근태 저장·조회, 관리자와 직원 동기화 API
- `Notifications.gs`: 향후 Firebase 알림 연동용 예약 트리거와 브리지 API
- `Index.html`: 직원·관리자 모바일 UI
- `appsscript.json`: Apps Script 런타임과 웹앱 권한 설정

## 운영 연결

- 직원 기준 시트: `직원 사번 명단`
- 근태 운영 시트: `근태현황`
- 감사 로그 시트: `근태 로그`
- 관리자 사번: `2023068`

연결값은 `Config.gs`에서 관리합니다. 시트 구조와 컬럼 순서는 변경하지 않습니다.

알림 기본값과 알림 시간은 Apps Script의 Script Properties에 저장하며 운영 설정을 위해 별도 시트나 컬럼을 만들지 않습니다.

## 운영 규칙

- 출근과 퇴근 시간은 선택한 시간을 기준으로 저장합니다.
- 30분 단위 버림 함수와 기존 조출·잔업·OT 계산은 유지합니다.
- 출퇴근, 중복 시도와 시스템 오류는 기존 `근태 로그`에 기록합니다.
- 직원 추가 시 `직원 사번 명단`을 기준으로 근태현황 직원 블록을 동기화합니다.

Release 전 정적 점검은 프로젝트의 `mobile` 디렉터리에서 `npm run qa:static`으로 수행합니다.

