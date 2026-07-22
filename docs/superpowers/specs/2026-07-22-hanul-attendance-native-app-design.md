# Hanul洹쇳깭愿由?Native App Design

## Goal

Package the existing LOGIFLOW Google Apps Script attendance system as an installable Android and iPhone application named `Hanul洹쇳깭愿由?. Preserve the current Google Sheets schema, Apps Script attendance behavior, employee login, attendance calculations, and administrator permissions.

The native application must support employee-specific push notifications whose types and schedules are controlled from the existing administrator operational settings screen.

## Application Identity

- Display name: `Hanul洹쇳깭愿由?
- Bundle/application ID: `kr.co.hanul.logiflow`
- Version: `1.0.0`
- Build number: `1`
- Primary icon: the flower symbol extracted from the Hanul corporate identity
- Icon background: transparent source with platform-specific Android adaptive and iOS rendered variants
- Splash screen: light gray application background with the same flower symbol

The existing bundle ID remains unchanged to avoid unnecessary release configuration churn. The user-facing display name changes independently.

## Architecture

### Native shell

Capacitor provides the Android WebView and iPhone WKWebView containers. The shell starts from bundled local assets, initializes native services, and then opens the production Apps Script web application inside the allowed secure navigation scope.

The production Apps Script URL remains the source of the attendance user interface and business behavior. The native shell must not duplicate attendance calculations or Google Sheets writes.

### Existing attendance system

The following remain authoritative and unchanged:

- Employee login and automatic login
- Attendance registration and duplicate prevention
- Google Sheets attendance storage
- Attendance log storage
- Monthly attendance and statistics
- Administrator permissions and dashboard data
- Early work, overtime, OT, leave, and holiday rules

Only the minimal integration required for native device registration and notification preferences may be added around successful login and logout events.

### Firebase services

- Firebase Cloud Messaging delivers Android and iPhone notifications.
- Firestore stores device registrations and notification preferences only.
- Firebase Functions validates notification requests and sends FCM messages.
- Firebase Secret Manager stores the shared server credential.
- APNs credentials are configured in Firebase for iPhone delivery.

Attendance and employee records are not migrated to Firestore.

## Device Registration

1. The native shell creates an installation identifier and requests notification permission at an appropriate point in the first-run flow.
2. FCM returns a device token.
3. The token is initially associated with the installation identifier.
4. After the existing Apps Script login succeeds, the validated employee number is bound to that installation through a server-authenticated registration request.
5. Token refresh updates the existing installation record.
6. Logout disables or unbinds the installation so it no longer receives employee notifications.
7. Re-login binds the current employee to the installation again.

Firestore device records contain only the employee number, installation identifier, platform, FCM token, notification preferences, active state, and update timestamps.

## Notification Policy

The administrator operational settings stored in Apps Script `Script Properties` are the global source of truth.

Supported settings:

- Check-in notification enabled and time
- Missing check-in notification enabled and time
- Check-out notification enabled and time
- Missing check-out notification enabled and time

Default times remain `07:00`, `09:00`, `18:00`, and `20:00`, but notification code must not hardcode them as the effective schedule.

Employee settings control personal receipt preferences:

- Check-in notifications ON/OFF
- Check-out notifications ON/OFF

A notification is sent only when both the corresponding administrator setting and employee preference are enabled.

## Notification Flow

1. Apps Script scheduled processing reads the latest operational settings from `Script Properties`.
2. For general check-in or check-out notices, the server requests delivery to all active eligible installations.
3. For missing-registration notices, Apps Script determines the missing employee numbers from the existing employee roster and attendance data.
4. Apps Script sends a signed request to the Firebase Function with the notification type and eligible employee numbers.
5. The Firebase Function verifies the server credential, resolves active tokens in Firestore, applies personal preferences, and sends FCM messages.
6. Invalid or expired tokens are disabled.
7. Selecting a notification opens the native application and routes to the employee home screen.

The notification request must not contain full attendance rows or employee names.

## Administrator Settings

The existing operational settings screen remains the editing surface. Saving continues to use `Script Properties`, not Google Sheets.

The native notification scheduler reads the same settings, so an administrator can change notification types and times without rebuilding the application.

## Platform Packaging

### Android

- Generate the Capacitor Android project.
- Apply application name, package ID, icons, splash screen, and secure network configuration.
- Support debug APK generation for device testing.
- Prepare signed APK and AAB release configuration without committing keystore secrets.

### iPhone

- Generate the Capacitor iOS project.
- Apply display name, bundle ID, icons, splash screen, notification capabilities, and URL handling.
- Prepare Xcode and TestFlight configuration.
- Final archive and TestFlight upload require macOS, Xcode, an Apple Developer account, signing certificates, a provisioning profile, and an APNs key.

## Security

- No Firebase API secrets, APNs keys, signing keys, keystores, passwords, or service-account private keys are committed.
- Apps Script stores its notification request credential in `Script Properties`.
- Firebase stores the corresponding credential in Secret Manager.
- Firebase Functions reject unsigned or invalid notification requests.
- Firestore rules prevent clients from listing or modifying other employees' device registrations.
- Production navigation uses HTTPS only.

## Error Handling

- Notification permission refusal does not block attendance use.
- Token registration failures show a non-blocking message and retry later.
- Firebase outages do not block login, attendance registration, or Google Sheets writes.
- Expired tokens are disabled during send processing.
- App startup falls back to the existing Apps Script application even when notification initialization fails.

## Testing

- Existing static attendance QA must continue to pass.
- Validate Android debug build and WebView navigation.
- Verify first login, automatic login, logout, and token re-binding.
- Verify administrator schedule changes are read without rebuilding the app.
- Verify general and missing-registration recipient selection separately.
- Verify employee notification preferences.
- Verify notification selection opens the home screen.
- Verify notification denial and offline startup do not block attendance.
- iPhone delivery and TestFlight installation require testing on macOS and a physical iPhone.

## Deliverables

- Updated Capacitor configuration
- Generated Android project
- Generated iOS project
- Hanul flower icon and splash asset sets
- Native notification registration layer
- Firestore device registration model and rules
- Firebase Function notification sender
- Apps Script notification scheduling and secure request integration
- Android APK/AAB build instructions
- iPhone TestFlight build instructions
- Release validation updates

## External Prerequisites

The following cannot be completed from source code alone:

- Firebase project configuration values
- Firebase Functions billing-enabled deployment where required
- Android release keystore and Google Play account
- Apple Developer account, macOS, Xcode, signing assets, and APNs key

All code paths remain configurable with placeholders until these account-owned values are supplied.

