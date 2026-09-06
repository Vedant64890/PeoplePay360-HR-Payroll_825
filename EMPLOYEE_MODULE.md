# Employee module

The employee workspace is available at `/employee/dashboard`. Its sidebar has 13 sections, including the requested features plus contract history and leave balances. Section URLs use fragments, such as `/employee/dashboard#payslips`, and work with refresh and browser back/forward navigation.

## Features

| Section | Implemented behavior |
| --- | --- |
| Dashboard | Live check-in status and session timer, attendance and leave metrics, daily hours chart, team information, recent requests, quick links and an optional workday reminder. |
| My profile | Employment information, work contacts, department, job, manager and joining date. Edit personal email/phone, both address lines, city, state, postal code, country code and emergency contacts. Employment and salary fields remain controlled by HR/payroll. |
| Attendance | Check in, check out with break minutes, monthly attendance history, session timestamps, working hours, lateness and overtime. Uses the existing attendance engine and its overlap/shift validation. |
| My schedule | Calendar and list views for the selected month. Shows dated schedule assignments, contract schedules, shift breaks, overnight shifts, rest days, holidays and approved full/partial leave. Calendar can start on Sunday or Monday. |
| Time off | Submit a leave request with a reason and date range; daily, half-day and hourly requests follow the configured leave policy. Track approval status and withdraw pending requests with a reason. |
| Leave balances | Allocations, consumed and remaining amounts, validity dates and availability today. Days and hours are kept separate. |
| My contacts | Search by colleague name, work email, code, department or job. Filter by department and paginate 24 contacts at a time. Provides email and phone links and work locations. |
| My contracts | Published employment contracts, dates, wage/basis, pay frequency, salary structure, schedule, probation, signing date and terms. Draft/cancelled contracts are excluded. |
| My payroll | Latest released net salary, annual gross/deduction/net totals, salary history and masked payment accounts. Totals are grouped by currency and use the payslip period end year. |
| Payslips | Released statement history, salary component breakdown, worked-time breakdown, recorded payments and authenticated PDF downloads. Separate preparation status shows draft statements as “Being prepared” and computed statements as “Awaiting payroll approval.” |
| Documents | Upload, search, filter, download and delete personal files. PDF, PNG and JPEG are accepted, up to 5 MB per file, 100 files and 50 MB per employee. Payslips are linked separately. |
| Notifications | Updates derived from real leave requests, allocations, released payslips and uploaded documents; unread count, unread filter, mark one/all read and links to the relevant section/reporting month. |
| Settings | Persist theme, clock format, calendar week start, default opening section, workday reminders and notification categories. Change password with current-password verification and invalidate all previous sessions. |

## Architecture

```text
frontend/src/app/employee/dashboard/page.js
  └── components/employee/employee-workspace.js  Authentication, navigation, shared data
      ├── workday.js                           Dashboard, attendance, leave, profile
      ├── schedule.js                          Monthly calendar and list
      ├── contacts.js                          Employee work directory
      ├── payroll.js                           Contracts, payroll and payslip details
      ├── documents.js                         Private document library
      ├── notifications-settings.js            Notification inbox and preferences
      └── shared.js                            Fetch state, dialogs, formatting, downloads

frontend/src/services/employee.service.js       API client, binary upload/download
backend/src/routes/employee.routes.js           Authentication, validation, HTTP responses
backend/src/validators/employee.validator.js    Strict employee-specific Zod schemas
backend/src/services/
  ├── employee.service.js                      Profile ownership, dashboard and clock
  ├── employee-workspace.service.js             Schedule, contacts, files, preferences, password
  ├── employee-payroll.service.js               Own published contracts/payslips and PDF access
  └── employee-notifications.service.js         Activity projection and read receipts
```

Existing services continue to handle leave approval/consumption, attendance calculations and PDF rendering. This keeps employee actions consistent with HR and payroll actions.

## Database setup

Three new models are defined in `database/prisma/schema.prisma`, all in the `hr` schema:

- `EmployeeDocument`: metadata and private binary content, indexed by employee and upload time.
- `EmployeePreferences`: one preferences row per employee.
- `EmployeeNotificationRead`: a read receipt keyed by employee and source event key.

All three relate to `Employee` and are removed if that employee record is deleted. General document contents are stored in PostgreSQL and never exposed as public static files. Existing payslip PDFs continue to use the application's versioned private PDF storage.

For an existing database, run:

```powershell
cd app/backend
npm run employee:setup
```

This applies `database/prisma/add-employee-module.sql` in a transaction and regenerates Prisma. The SQL only creates the three new tables and their index; it does not synchronize unrelated schema changes or remove existing data. It can be run again safely. The configured database in this workspace has already received this migration.

For a fresh project database, the existing `npm run prisma:sync` workflow includes these models.

Start the application with the existing command:

```powershell
cd app
npm run dev
```

Sign in with an active `EMPLOYEE` account linked to an employee record. Administrators can access the employee routes only for their own linked employee profile. HR and payroll roles continue to use their respective workspaces.

## API reference

All paths below start with `/api/employee`. JSON endpoints return `{ success: true, data }`; file endpoints return an attachment. All employee responses use `Cache-Control: no-store`.

| Method | Path | Input / result |
| --- | --- | --- |
| GET | `/dashboard?month=2026-09` | Profile, current clock/schedule, selected-month attendance, requests, balances and metrics. |
| PATCH | `/profile` | Whitelisted personal and emergency contact fields. Use `null` to clear optional fields. |
| POST | `/attendance/clock` | `{ action: "check-in" }` or `{ action: "check-out", breakMinutes: 30 }`. |
| POST | `/leave` | `leaveTypeId`, `startDate`, `endDate`, `reason`, optional `fraction` and `hoursPerDay`. Employee identity comes from authentication. |
| POST | `/leave/:id/cancel` | `{ reason }`; only own pending requests can be withdrawn. |
| GET | `/schedule?month=2026-09` | Every date in the month, its applicable shifts, timezone, holiday and approved leave. |
| GET | `/contacts?q=alex&departmentId=1&page=1` | Work directory; all query fields are optional. |
| GET | `/contracts` | Own published contract history. |
| GET | `/payroll?year=2026` | Released payslips, pending statement metadata, available years, totals by currency and masked payment accounts. |
| GET | `/payslips/:id` | Own released statement, visible salary components, worked time and payments. |
| GET | `/payslips/:id/pdf` | Own released PDF attachment. |
| GET | `/documents` | Own document metadata; binary content is excluded. |
| POST | `/documents?title=Certificate&category=EDUCATION&fileName=certificate.pdf` | Raw file body with matching `Content-Type`, not multipart or JSON. Categories: `IDENTITY`, `EDUCATION`, `EMPLOYMENT`, `TAX`, `OTHER`. |
| GET | `/documents/:id/download` | Own private file attachment. |
| DELETE | `/documents/:id` | Delete an owned file. |
| GET | `/notifications` | Recent activity and persisted read status. Latest 100 source records per category. |
| POST | `/notifications/read` | `{ keys: ["source-event-key"] }`, up to 400 keys. Keys are checked against the signed-in employee's feed. |
| GET | `/settings` | Persisted preferences or defaults. |
| PUT | `/settings` | Complete preference object, described below. |
| POST | `/settings/password` | `{ currentPassword, newPassword }`; returns `{ requiresLogin: true }`. |

Default preferences:

```json
{
  "theme": "system",
  "timeFormat": "12h",
  "weekStartsOn": 1,
  "defaultSection": "overview",
  "attendanceReminders": true,
  "leaveUpdates": true,
  "payrollUpdates": true,
  "documentUpdates": true
}
```

## Access and workflow rules

- Employee IDs are resolved from the authenticated account, not accepted as a client-selected identity. Own-record lookups are enforced for files, contracts, leave, payroll and notifications.
- The colleague directory selects only work-facing fields. It excludes personal contacts, addresses, emergency contacts, passwords, salary and bank identifiers.
- Salary details and PDFs are employee-visible only in `VALIDATED`, `PARTIALLY_PAID` or `PAID` state. Both the detail and PDF endpoints enforce that rule. PDF generation checks ownership/status again while holding the payrun lock. Draft/computed statements expose only their number, period and preparation status in `pendingSlips`, so employees can distinguish pending approval from a missing payslip.
- Payment account responses include bank name, holder, currency, primary status and last four digits. Encrypted identifiers are not selected or decrypted.
- File uploads check size, supported MIME type and file signature. Download filenames are normalized to the detected type; downloads are attachments with `nosniff`. Per-employee storage quotas are enforced under an employee row lock.
- File deletions, profile edits and password changes are audited. Password values and document content are not put into audit records.
- Password changes require 12–72 characters, at most 72 UTF-8 bytes, and a different new password. They increment the authentication session version and consume unused password-reset tokens.
- Notification receipts survive refresh and login. A changed source record creates a different event key and becomes unread. This is a recent activity inbox showing current source states; the existing audit logs remain the system's detailed change history.
- Notification preferences control the in-app inbox. They do not subscribe/unsubscribe SMTP delivery or send email.
- Schedule hours reflect the planned schedule before leave. Approved leave is shown separately; holidays have zero scheduled hours. Contract schedules take precedence over dated assignments, consistent with the existing attendance/leave engine.

## Verification

```powershell
cd app/backend
npm run test:employee  # Isolated employee API and ownership tests
npm test              # Full existing workspace suites plus employee tests

cd ../frontend
npx eslint src/components/employee src/services/employee.service.js src/app/employee
npm run build
```

The employee test suite provisions synthetic users and records and deletes its database fixtures afterward. Coverage includes anonymous/role rejection, profile field restrictions, directory privacy, month and holiday calculations, draft/foreign payslip denial, PDF downloads, document validation/ownership, notification read state, preference isolation, leave withdrawal and session invalidation.

For manual review, use the employee navigation to edit a personal contact, request/withdraw time off, view a calendar/list schedule, search a colleague, inspect a payslip, upload/download/delete a document, mark notifications read and save preferences. Check both themes and a narrow/mobile viewport. Published payroll, contracts, allocations and schedule data are supplied through the existing HR/payroll workflows; the employee module does not fabricate records when those are absent.
