# Attendance Wheel Time Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출퇴근 시간을 시·분 스크롤로 선택하고, 미래 30분 제한과 자정 이후 퇴근의 출근 행 연결 및 잔업 계산을 지원한다.

**Architecture:** 브라우저는 다음 30분 단위 기본값과 선택 제한을 담당하고 기존 `registerAttendance` API에 선택 시각을 전달한다. 서버는 퇴근 요청에서 당일 또는 전날의 최근 미완료 출근 행을 선택하며, 자정 이후 시간은 시트 표시를 유지하면서 수식 계산에 필요한 24시간 초과 serial 값으로 저장한다.

**Tech Stack:** Google Apps Script, HtmlService, HTML, CSS, JavaScript, Google Sheets

## Global Constraints

- 실행, Preview, 테스트 실행 및 배포는 이 코드 수정 단계에서 수행하지 않는다.
- Google Sheets 시트 구조와 열 순서를 변경하지 않는다.
- 로그인, 중복 등록 방지, 근태 로그, 관리자 및 GPS 제거 상태를 유지한다.
- 분 선택값은 `00`과 `30`만 허용한다.
- 미래 선택은 버튼 클릭 시각에서 최대 30분 후까지 허용한다.
- 18:30 이후 추가 휴게는 자동 차감하지 않고 기존 총 휴게 1시간 30분을 유지한다.

---

### Task 1: 회귀 검증 코드 추가

**Files:**
- Modify: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `ceilToHalfHour`, `computeWorkMinutes`
- Produces: 시간 올림, 미래 제한, 자정 계산을 확인하는 정적 검증 항목

- [ ] **Step 1: 기본 선택 규칙 검증 추가**

`08:12 -> 08:30`, `08:20 -> 08:30`, `08:48 -> 09:00`, `23:50 -> 다음 날 00:00`을 검증한다.

- [ ] **Step 2: 자정 근무시간 검증 추가**

`computeWorkMinutes("9:00", "0:00") === 810` 및 `computeWorkMinutes("9:00", "3:00") === 990`을 검증한다.

- [ ] **Step 3: 코드만 저장**

이 단계에서는 검증 스크립트를 실행하지 않는다.

---

### Task 2: 시·분 스크롤 선택 UI

**Files:**
- Modify: `apps-script/Index.html`

**Interfaces:**
- Consumes: 출근·퇴근 버튼 이벤트와 `submitAttendance(type, button, selectedAt)`
- Produces: `buildSelectedAttendanceDate(): Date`, `isAttendanceTimeAllowed(selectedAt, openedAt): boolean`

- [ ] **Step 1: 기존 3개 라디오 선택 마크업과 CSS 교체**

시간 `00~23`과 분 `00/30`을 각각 세로 스크롤하는 두 개의 선택 열을 만들고 중앙 선택선을 표시한다. 기존 모달, 취소 버튼, 확인 버튼 구조는 유지한다.

- [ ] **Step 2: 다음 30분 단위 기본값 계산**

기존 `ceilToHalfHour(dateValue)`를 사용하되 정각과 30분은 현재 값을 유지하고 나머지는 다음 30분으로 올린다.

- [ ] **Step 3: 선택 시각 조립 및 제한 검증**

선택한 시·분으로 당일 Date를 만들고, `00:00` 기본값이 자정을 넘긴 경우에만 다음 날짜 Date로 만든다. 선택값이 모달을 연 시각보다 30분을 초과하면 `현재 시각에서 30분 후까지만 선택할 수 있습니다.` Snackbar를 표시한다.

- [ ] **Step 4: 기존 저장 흐름 연결**

유효한 선택값만 기존 `submitAttendance()`로 전달한다. 저장 중 중복 클릭 방지, 성공 Snackbar 및 실패 Snackbar는 변경하지 않는다.

- [ ] **Step 5: 코드만 저장**

이 단계에서는 브라우저 실행이나 Preview를 수행하지 않는다.

---

### Task 3: 자정 이후 퇴근 행 연결

**Files:**
- Modify: `apps-script/Code.gs`

**Interfaces:**
- Consumes: `savedAt: Date`, `employeeBlock.clockInColumn`, `employeeBlock.clockOutColumn`
- Produces: `resolveAttendanceTarget_(sheet, employeeBlock, type, savedAt): { row: number, workDate: Date }`

- [ ] **Step 1: 퇴근 대상 행 선택 함수 추가**

출근은 선택 시각의 날짜 행을 사용한다. 퇴근은 먼저 선택 날짜의 출근 있음·퇴근 없음 행을 확인하고, 없으면 전날 행에서 출근 있음·퇴근 없음이며 선택 시각과 출근 시각 차이가 24시간 이내인 행을 선택한다.

- [ ] **Step 2: 기존 `registerAttendance()`에 대상 결과 적용**

`findOrCreateDateRow(attendanceSheet, workDate)` 직접 호출을 `resolveAttendanceTarget_()` 결과로 교체한다. 로그의 날짜와 응답 날짜는 선택 시각 날짜가 아니라 실제 출근 행의 `workDate`를 사용한다.

- [ ] **Step 3: 자정 이후 시트 serial 저장**

퇴근 선택일이 출근 행 다음 날이면 `timeToAttendanceSheetSerial(savedAt, workDate)`가 `00:00 -> 1.0`, `03:00 -> 1.125`를 반환하도록 한다. 셀 표시 형식은 기존 `h:mm`을 유지하여 화면에는 `0:00`, `3:00`으로 보이게 한다.

- [ ] **Step 4: 기존 중복 방지 유지**

선택된 출근 행의 퇴근 셀에 값이 있으면 기존 중복 퇴근 오류와 근태 로그를 그대로 사용한다. 24시간 내 미완료 출근이 없으면 기존 선택 날짜 행 처리로 돌아가 현재 동작을 보존한다.

- [ ] **Step 5: 코드만 저장**

이 단계에서는 Apps Script Run 또는 배포를 수행하지 않는다.

---

### Task 4: 자정 근무 계산 보완

**Files:**
- Modify: `apps-script/Utils.gs`
- Modify: `apps-script/Index.html`

**Interfaces:**
- Consumes: `clockInText: string`, `clockOutText: string`
- Produces: 자정 이후를 포함한 `computeWorkMinutes(clockInText, clockOutText): number`

- [ ] **Step 1: 서버 공통 계산 보완**

퇴근 분이 출근 분보다 작거나 같고 퇴근값이 존재하면 퇴근 분에 1440분을 더한다. 퇴근이 18:30 이후 또는 다음 날이면 휴게 90분을 차감한다.

- [ ] **Step 2: 브라우저 표시 계산을 동일하게 보완**

`Index.html`의 동일 계산 함수에도 같은 자정 보정과 90분 휴게 규칙을 적용해 홈·근태 상세 표시가 서버와 일치하도록 한다.

- [ ] **Step 3: 코드만 저장**

이 단계에서는 검증 및 배포를 실행하지 않는다.

---

### Task 5: 후속 앱 전환 단계 분리

**Files:**
- No code changes in this task

**Interfaces:**
- Consumes: 코드 수정이 완료된 Apps Script 웹앱
- Produces: 단계별 앱 패키징 진행 순서

- [ ] **Step 1: 웹앱 코드 검증**

사용자 승인 후 별도 단계에서 정적 검증만 실행한다.

- [ ] **Step 2: Apps Script 운영 반영**

사용자 승인 후 별도 단계에서 Apps Script 배포본을 갱신한다.

- [ ] **Step 3: Android 패키징**

별도 단계에서 Capacitor Android 프로젝트 생성, 아이콘 적용, 실기기 확인, APK/AAB 빌드를 순서대로 진행한다.

- [ ] **Step 4: iPhone 패키징**

Mac/Xcode/Apple 계정이 준비된 뒤 별도 단계에서 iOS 프로젝트 생성, 서명, 실기기 확인, TestFlight 업로드를 순서대로 진행한다.

- [ ] **Step 5: 알림 연결**

Firebase 프로젝트 키와 플랫폼 자격 증명이 준비된 뒤 별도 단계에서 FCM 연결과 실제 기기 알림 검증을 진행한다.
