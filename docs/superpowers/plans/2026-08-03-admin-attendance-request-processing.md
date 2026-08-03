# Admin Attendance Request Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 LOGIFLOW 관리자 화면에서 근태 수정 요청값을 조정하고 승인 또는 고정 사유로 반려하도록 구현한다.

**Architecture:** 기존 `근태 로그` 요청 행을 처리 상태의 단일 원천으로 사용한다. 서버가 요청 행을 다시 검증하고 승인 시에만 `근태현황`의 해당 직원·날짜 셀을 수정하며, UI는 관리자 요청 상세 다이얼로그를 통해 최종값과 반려 사유를 전달한다.

**Tech Stack:** Google Apps Script, Google Sheets, HtmlService HTML/CSS/JavaScript, Node.js 정적 QA

## Global Constraints

- Google Sheets 시트와 컬럼 구조를 변경하지 않는다.
- 조출, 잔업, OT, 휴게시간 계산 방식을 변경하지 않는다.
- 관리자 사번은 `2023068`을 유지한다.
- 출근·퇴근 승인값은 30분 단위만 허용한다.
- 반려 사유는 승인된 네 가지 고정 항목만 허용한다.
- Preview, Run, Deploy는 실행하지 않는다.

---

### Task 1: 관리자 요청 처리 정적 계약

**Files:**
- Modify: `release/scripts/qa-static.mjs`
- Test: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `apps-script/AttendanceRequests.gs`, `apps-script/Index.html`
- Produces: 서버 API, 권한 검사, 처리 상태, 관리자 다이얼로그 및 API 바인딩을 검증하는 정적 계약

- [ ] **Step 1: 실패하는 정적 검증 추가**

다음 계약을 `qa-static.mjs`에 추가한다.

```js
check("Admin correction processing API", /function processAttendanceCorrectionRequest/.test(requestSource), "Admin request API exists");
check("Admin correction authorization", /adminEmployeeId[\s\S]*CONFIG\.adminEmployeeId/.test(requestSource), "Admin ID is verified");
check("Correction request completion state", /updatedAt[\s\S]*updatedBy/.test(requestSource), "Processed requests are closed");
check("Admin correction dialog", ["adminRequestDetailModal", "adminRequestFinalValue", "adminRequestApprove", "adminRequestReject"].every((id) => new RegExp(`id=["']${id}["']`).test(html)), "Admin dialog controls exist");
check("Admin correction API binding", /callServer\(["']processAttendanceCorrectionRequest["']/.test(html), "Admin actions call Apps Script");
```

- [ ] **Step 2: 실패 확인**

Run:

```powershell
& 'C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' release/scripts/qa-static.mjs
```

Expected: 새 관리자 처리 계약 5개가 실패한다.

---

### Task 2: 관리자 승인·반려 서버 API

**Files:**
- Modify: `apps-script/AttendanceRequests.gs`
- Test: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `findEmployeeById`, `findEmployeeBlock`, `findDateRow_`, `parseTimeToMinutes`, `timeToSheetSerial`, `SpreadsheetApp`, `LockService`
- Produces: `processAttendanceCorrectionRequest(request)`

요청 형식:

```js
{
  adminEmployeeId: "2023068",
  requestRow: 12,
  action: "approve" | "reject",
  finalValue: "8:30" | "1" | "0.5",
  rejectionReason: "existingRecord" | "timeUnverified" | "insufficientReason" | "evidenceRequired"
}
```

- [ ] **Step 1: 처리 상수와 입력 정규화 구현**

`ATTENDANCE_REQUEST_REJECTION_REASONS_`와 `normalizeAttendanceCorrectionDecision_`을 추가한다. 행 번호, 처리 유형, 30분 단위 시간, 연차값, 고정 반려 사유를 서버에서 검증한다.

- [ ] **Step 2: 요청 행 재검증과 잠금 구현**

`processAttendanceCorrectionRequest`는 `LockService.getScriptLock().tryLock(5000)`으로 중복 처리를 막는다. 로그의 해당 행 A:L을 다시 읽고 요청 형식, 미처리 상태, 직원 사번, 대상 날짜를 확인한다.

- [ ] **Step 3: 승인값을 근태현황에 반영**

출근은 `clockInColumn`, 퇴근은 `clockOutColumn`, 연차는 `startColumn + 5`에 기록한다. 퇴근값이 같은 행의 출근값보다 이르면 다음 날 퇴근으로 판단하여 시트 일련값에 `1`을 더한다.

```js
const finalMinutes = parseTimeToMinutes(finalValue);
const dayOffset = kind === "clockOut" && clockInMinutes !== null && finalMinutes < clockInMinutes ? 1 : 0;
targetCell.setValue(dayOffset + finalMinutes / 1440).setNumberFormat("h:mm");
```

- [ ] **Step 4: 처리 이력 기록**

원본 기존값과 요청값은 E/F열에 유지한다. D열 유형 끝에 승인 최종값 또는 반려 사유를 붙이고, K열에 처리일시, L열에 관리자 사번을 기록한다. `readPendingAttendanceRequests_`는 K열이 있는 요청을 제외한다.

- [ ] **Step 5: 서버 정적 검증 실행**

Run: Task 1의 Node 명령

Expected: 서버 API·권한·처리 상태 계약이 통과하고 Apps Script 구문 검사가 통과한다.

---

### Task 3: 관리자 요청 상세 다이얼로그

**Files:**
- Modify: `apps-script/Index.html`
- Test: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: `pendingAttendanceRequests`, `callServer`, `showToast`, `refreshAdmin`, 공통 모달 스타일
- Produces: `openAdminRequestDetail`, `closeAdminRequestDetail`, `processAdminAttendanceRequest`

- [ ] **Step 1: 다이얼로그 마크업 추가**

직원, 날짜, 항목, 요청 사유, 기존값, 요청값, 최종 반영값을 표시한다. 출근·퇴근은 30분 단위 `select`, 연차는 전일·반일 `select`를 사용한다.

- [ ] **Step 2: 반려 사유 선택 UI 추가**

반려 버튼을 누르면 네 가지 사유를 `select`로 표시한다. 직접 입력 필드는 만들지 않는다.

- [ ] **Step 3: 요청 목록 클릭 동작 교체**

기존 직원 상세 열기 대신 선택한 요청 객체를 상태에 저장하고 요청 상세 다이얼로그를 연다. 모달 바깥 클릭, 닫기 버튼, Escape 키, 포커스 복귀를 지원한다.

- [ ] **Step 4: 승인·반려 API 연결**

처리 중 버튼을 비활성화한다. 성공 시 다이얼로그를 닫고 `refreshAdmin`을 한 번 호출하며 Snackbar를 표시한다. 실패 시 입력 상태를 유지하고 오류 Snackbar를 표시한다.

- [ ] **Step 5: UI 정적 검증 실행**

Run: Task 1의 Node 명령

Expected: 다이얼로그 ID, 서버 API 바인딩, DOM 계약, Inline JavaScript 구문 검사가 모두 통과한다.

---

### Task 4: 회귀 검증과 저장

**Files:**
- Verify: `apps-script/AttendanceRequests.gs`
- Verify: `apps-script/Index.html`
- Verify: `release/scripts/qa-static.mjs`

**Interfaces:**
- Consumes: Tasks 1~3 결과
- Produces: Apps Script 저장본과 GitHub 기능 커밋

- [ ] **Step 1: 전체 정적 QA 실행**

Run: Task 1의 Node 명령

Expected: 모든 검사가 통과하고 실패 수가 0이다.

- [ ] **Step 2: 변경 범위 검토**

GPS, 출퇴근 등록, 계산 함수, 시트 설정값이 변경되지 않았는지 확인한다.

- [ ] **Step 3: 실제 Apps Script 프로젝트에 저장**

`AttendanceRequests.gs`와 `Index.html`만 실제 프로젝트에 반영하고 저장한다. Preview, Run, Deploy는 실행하지 않는다.

- [ ] **Step 4: GitHub 커밋**

브랜치 `codex/attendance-operations-improvements`에 다음 메시지로 커밋한다.

```text
feat: process attendance correction requests in admin app
```

