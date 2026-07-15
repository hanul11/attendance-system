Exit code: 0
Wall time: 1 seconds
Output:
var APP_CONSTANTS = Object.freeze({
  APP_NAME: 'LOGIFLOW',
  WEB_TITLE: 'LogiFlow Attendance',
  VERSION: '1.0.0',
  BUILD: '1',
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwoZlxexxXTQRBAud0wnggy5vCuQfzvUcKkEAFksqmPQqHN8CFBU6T_jYS0IPXuX1cK/exec',
  GOOGLE_SHEET_ID: '1Zkm_mqrljBLFO_k2sAgCcgLWDKJhH01PqGK8MnGwOyE'
});

var SHEET_NAMES = Object.freeze({
  employee: '\uC9C1\uC6D0 \uC0AC\uBC88 \uBA85\uB2E8',
  attendance: '\uADFC\uD0DC\uD604\uD669',
  attendanceLog: '\uADFC\uD0DC \uB85C\uADF8',
  notice: '\uACF5\uC9C0\uC0AC\uD56D',
  passwordReset: '\uBE44\uBC00\uBC88\uD638 \uCD08\uAE30\uD654 \uC694\uCCAD'
});

var CONFIG = Object.freeze({
  appName: APP_CONSTANTS.APP_NAME,
  webTitle: APP_CONSTANTS.WEB_TITLE,
  version: APP_CONSTANTS.VERSION,
  build: APP_CONSTANTS.BUILD,
  webAppUrl: APP_CONSTANTS.WEB_APP_URL,
  spreadsheetId: APP_CONSTANTS.GOOGLE_SHEET_ID,
  rosterSheetName: SHEET_NAMES.employee,
  rosterSheetCandidates: ['\uC9C1\uC6D0\uAD00\uB9AC(Master)', '\uC9C1\uC6D0\uAD00\uB9AC', SHEET_NAMES.employee],
  attendanceSheetName: SHEET_NAMES.attendance,
  logSheetName: SHEET_NAMES.attendanceLog,
  noticeSheetName: SHEET_NAMES.notice,
  passwordResetSheetName: SHEET_NAMES.passwordReset,
  adminEmployeeId: '2023068',
  timezone: 'Asia/Seoul',
  gpsLocations: Object.freeze([
    Object.freeze({
      id: 'factory1',
      name: '\uD55C\uC6B8\uC0DD\uC57D \uC81C1\uACF5\uC7A5',
      latitude: 37.863368698405246,
      longitude: 126.81681274938418
    }),
    Object.freeze({
      id: 'factory2',
      name: '\uD55C\uC6B8\uC0DD\uC57D \uC81C2\uACF5\uC7A5',
      latitude: 37.863368698405246,
      longitude: 126.810143420494
    })
  ])
});

