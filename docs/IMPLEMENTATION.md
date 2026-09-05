# PeoplePay360 implementation and operating guide

This implementation follows the supplied PeoplePay360 HR & Payroll PDF and HRMS OXP screen flow. The attached material defines product requirements; the application preserves the existing Next.js, Express and PostgreSQL/Prisma architecture.

## 1. Role workspaces

| Role | Landing page | Access |
| --- | --- | --- |
| Employee | `/employee/dashboard` | Own profile, contact information, attendance, working schedule, time-off requests and leave allocations. No HR administration or payroll access. |
| HR Manager | `/hr/dashboard` | Employees, departments, positions, dated contracts and schedules, attendance corrections, leave policies, allocations and approval/refusal. Payroll APIs are denied. |
| HR Payroll User | `/payroll/dashboard` | HR operations, payrun creation/computation/validation/payment recording, payslip inputs, PDFs, bulk delivery and reports. Salary structures, rules and categories are read-only; payroll deletion is denied. |
| HR Payroll Manager | `/payroll/dashboard` | Payroll User capabilities plus salary configuration and deletion of eligible draft/cancelled payroll. Finalized history is protected. |
| Admin | `/admin/dashboard` | All modules, account provisioning, role assignment, system settings and audit history. |

All roles use `/login`. Employees must have an explicit `Employee.userId` link, assigned by Admin. Email matching never grants employee ownership. Legacy `USER` and `MANAGER` accounts retain their limited account home until an administrator assigns a defined business role.

Authorization is enforced in the API. Employee requests derive their employee ID from the authenticated account, reject attempts to supply another identity, and expose a selected set of fields. Session revocation, disabled-account checks, HTTP-only cookies, separate tab sessions, and origin checks continue to apply.

## 2. Employee experience

- Dashboard cards: days present, closed-session hours, available leave days, available leave hours, pending requests, overtime and approved leave in the selected month.
- The day-by-day working-hours chart reads attendance records. Current balance cards distinguish days from hours and ignore unapproved, expired and not-yet-valid allocations.
- Check-in records the server timestamp and a self-service source. One employee cannot have overlapping/open sessions. Checkout records breaks and refreshes the daily summary atomically.
- Attendance history shows check-in/out sessions, worked hours, breaks, lateness, overtime and source. HR handles manual corrections with a reason and audit trail.
- Time-off requests derive duration from dated schedules, support day/hour policies and optional half days, and follow configured approval rules. Employees can withdraw pending requests with a reason; approved leave requires HR action.
- Employees can update personal contact and emergency details. Employment status, account links, department, salary and other administrative fields are rejected by the self-service endpoint.
- Profile and schedule pages show current work details, assigned hours, weekly shifts, timezone and manager information.
- Dashboards reload after actions, on window focus, and every 60 seconds while visible. The running attendance clock updates each second; completed worked hours update on checkout.

## 3. HR operations

Employee Kanban/list/form views remain the central hub. Related contracts, attendance, requests, allocations and schedule assignments open with an employee filter. Employment changes retain history.

Contracts retain historical terms and effective dates. Overlapping approved contracts are rejected. When a payroll period crosses a contract change, split the payrun period so each payslip uses one applicable contract. Referenced contract terms and schedules cannot be silently rewritten.

Working schedules calculate weekly hours from shift start/end, next-day offsets and breaks. Timezones, holidays, late grace, overtime thresholds and dated assignments are connected to attendance and payroll.

Leave allocations require approval. Approval consumes eligible allocation balances transactionally, and cancellation releases consumption. Concurrent approvals cannot spend the same balance twice. Two-stage policies require different approvers. Automatic policies return their resulting approved state immediately.

Employee forms now include bank-account management. Full account and routing identifiers use AES-256-GCM encryption; API responses show bank labels, currency and the last four characters. Archival preserves historical bank records.

## 4. Payroll workflow

1. **Configure salary:** create categories, rules and salary structures. Add earning/deduction/employer-contribution effects, computation methods and unique rule sequences.
2. **Prepare employees:** assign an applicable contract, matching salary structure, currency, pay frequency and working schedule. Record attendance and decide leave.
3. **Choose scope:** New Payrun collects name, period, structure, optional department and employee type. Continue retrieves eligible employees without creating a payrun.
4. **Select employees:** explicitly select employees. The final submission creates the run and selection records atomically. Submission keys prevent duplicate creation.
5. **Compute:** uses applicable contract terms, attendance, leave and ordered rules. Formula expressions allow arithmetic and known uppercase values; JavaScript execution and property access are prohibited.
6. **Review:** inspect selected employees, salary lines, worked time, variable inputs, missing information, contract attention and duplicate-period warnings. Failed employees remain visible in the run. Recompute after corrections.
7. **Validate:** requires successful computation, no blocking warnings, current salary inputs and no conflicting finalized payslips. Salary snapshots are retained.
8. **Record payment:** records completed payments using method, reference and idempotency key. This application does not initiate a bank transfer.
9. **PDF and delivery:** download an individual PDF, review bulk recipients, queue payslips, and monitor each recipient's status and attempts.

Fixed amounts, percentages and arithmetic formulas determine actual payslip lines. Available formula values include `WAGE`, `CONTRACT_WAGE`, `WORKED_HOURS`, `WORKED_DAYS`, `SCHEDULED_DAYS`, `PAID_DAYS`, earlier rule codes and explicit variable input codes. `GROSS` and `NET` update as rules execute. Deductions use positive amounts and the deduction effect.

Monthly/annual wages use calendar-day proration and a scheduled-day payable fraction. Daily wages use paid days; hourly wages use recorded hours plus payable leave. The computation snapshot explains the policy. Statutory deductions are configurable rules, not hardcoded jurisdictional assumptions.

## 5. PDFs and email delivery

PDFs contain employee identity, period, structure, status, scheduled/worked time, visible salary components, gross, deductions, net and employer contributions. Historical calculation snapshots supply identity and salary values. Documents use checksums and versioned private files; changes in calculation version or payment status produce a distinct document.

`GET .../payslips/:id/pdf` authenticates every request. PDFs are not exposed through public static storage. Default storage is `backend/.data/payslips`; set `PAYSLIP_STORAGE_DIR` to persistent private storage for deployment. Set `PDF_FONT_PATH` to a TrueType font supporting your employee names when needed.

Bulk sending creates durable batch, delivery and attempt records. A worker started by `src/server.js` processes queued deliveries every five seconds. The UI refreshes delivery history every five seconds. SMTP acceptance is labeled Sent; it does not claim inbox delivery. Failed or interrupted attempts require explicit retry, so successful deliveries are not resent automatically. Check the recipient before retrying an interrupted attempt because SMTP may have accepted it before the connection failed.

Recipients are captured from current employee work emails at queue time. Missing work emails prevent queuing. Salary values in the attachment remain historical. No email is sent merely by generating a PDF or creating demo data.

Configure these variables in `backend/.env`:

```dotenv
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
MAIL_FROM=PeoplePay360 <payroll@your-domain.com>
```

Missing SMTP configuration returns a clear unavailable response and disables sending in the UI. No simulated success alert remains.

## 6. Dashboard metric definitions

| Metric / report | Source and meaning |
| --- | --- |
| Total payroll | Net amounts of computed and finalized, non-cancelled payslips starting in the selected month/currency. |
| Employees paid / total paid | Distinct paid employees and successful payments associated with selected-period payslips. |
| Pending payroll | Computed net less successful recorded payments; uncomputed drafts have no assumed salary. |
| Generated payslips | Actual payslip rows, including drafts, excluding cancelled slips. |
| Average salary | Computed net divided by computed payslip count. |
| Deductions / bonuses | Computed deduction totals; bonuses are earning rules with `BONUS` as a code segment. |
| Salary charts | Finalized payroll by period start, including salary costs by department and historical monthly net. |
| Payments in CSV/report totals | Successful payments grouped by their recorded payment date. |
| Attendance health | Present divided by present plus absent recorded days; unavailable when no denominator exists. |
| Approved leave | Approved request-day durations falling inside the selected month. |
| Remaining leave in reports | Current un-released consumption against approved allocations valid during the selected month; not a historical month-end balance snapshot. |
| Workforce | Current non-terminated, non-archived employees, grouped by department/type. |
| Attendance quality | Recorded present/absent/leave, late days, overtime, missing checkouts and correction count. |

Payroll reports support month, currency, department, employee type and a 3/6/12-month trend window. Mixed currencies are not added together. HR metrics use current employee dimensions, while finalized payroll costs use the dimensions stored on the payslip. CSV exports protect formula-like values.

## 7. Main API routes

All paths below begin with `/api`; authenticated roles are required.

| Endpoint | Operation |
| --- | --- |
| `GET /employee/dashboard?month=YYYY-MM` | Own profile, schedule, attendance, balances, requests and KPI/chart data |
| `POST /employee/attendance/clock` | `{ action: "check-in" }` or `{ action: "check-out", breakMinutes: 0 }` |
| `POST /employee/leave` | Own leave request, without an employee ID |
| `POST /employee/leave/:id/cancel` | Withdraw own pending request with `reason` |
| `PATCH /employee/profile` | Whitelisted personal/emergency contact updates |
| `GET /hr/dashboard` | HR overview |
| `GET /payroll/dashboard` | Payroll overview and filtered reporting |
| `GET/POST/PUT /{admin,hr,payroll}/workspace/:resource` | Authorized configuration and operational records |
| `POST .../workspace/:resource/:id/actions` | Applicable approval, computation, validation, payment, cancellation or archival |
| `GET .../workspace/payruns/eligible` | Period, structure and optional department/type eligibility |
| `PUT .../workspace/payslips/:id/inputs` | Draft/computed variable inputs |
| `GET .../workspace/payslips/:id/pdf` | Authenticated PDF download |
| `GET/POST .../workspace/payruns/:id/deliveries` | Recipient preview, batch history and explicit bulk queue submission |
| `POST .../workspace/payruns/:id/deliveries/:deliveryId/retry` | Retry a failed delivery |
| `GET/POST .../workspace/employees/:id/bank-accounts` | Masked bank list / encrypted account creation |
| `DELETE .../workspace/employees/:id/bank-accounts/:bankId` | Archive a bank account |
| `GET .../workspace/reports/export` | Filtered CSV export |

HR routes do not expose payroll, reports containing salaries, or salary configuration. Payroll roles do not expose system account/permission administration. Method and resource checks are enforced server-side.

## 8. Running and verifying

From `app`:

```powershell
npm --prefix backend install
npm --prefix frontend install
npm run dev
```

The existing Prisma schema already contains the required employee, bank, document and delivery models. This change requires no destructive database migration. On a fresh database, follow the existing Prisma setup and role-seeding workflow before creating accounts.

Create a local bank encryption key once with `node scripts/configure-bank-key.mjs` from `app/backend`. It preserves existing keys and writes a generated key into the ignored `.env`. Restart the backend after environment changes. Keep the key with database backups.

Validation commands:

```powershell
npm --prefix backend run test:workspace
npm --prefix backend run prisma:validate
npm --prefix frontend run lint -- --quiet
npm --prefix frontend run build
```

Integration tests create isolated labeled records and clean them up. Email tests use an injected transport and do not send real emails. They cover employee identity isolation, role restrictions, contact field protection, clock state transitions, leave approval/withdrawal, concurrent balance consumption, salary arithmetic, duplicate payruns, payment idempotency, encrypted/masked bank details, PDF download, and failed-delivery retry.

## 9. Demonstration

`npm --prefix backend run demo:seed` creates clearly labeled records and accounts for Employee, HR Manager, Payroll User and Payroll Manager. It provisions an employee, department, position, working schedule, contract, salary rule/structure, approved allocation, attendance for the previous completed month, and a computed/validated/paid demo payrun. Existing records are not overwritten.

Generated credentials and record IDs are stored only in `backend/.data/DEMO<timestamp>.json`, which Git ignores. Use the indicated month to see populated attendance and payroll KPIs. Demo payment references explicitly identify simulated payment records. No email or bank transfer is initiated.

Five-minute walkthrough:

1. Sign in as the demo Employee, change to the recorded month, inspect attendance and leave balance, and submit a future time-off request.
2. Sign in as HR Manager and approve the request; refresh the Employee workspace to see status and balance change.
3. Sign in as Payroll Manager, review the existing demo payrun, open its payslip and download the PDF. Create a new period through the two-step wizard to demonstrate employee selection and computation warnings.
4. Sign in as Payroll User and verify that payroll operations are available while salary configuration remains read-only.

Deployment extensions include SMTP webhook tracking for delivered/bounced mail, external payment-provider integration, object storage for PDFs, richer multi-contract period splitting, and jurisdiction-specific rule libraries. These are separate from the implemented record/payment and SMTP submission workflows.
