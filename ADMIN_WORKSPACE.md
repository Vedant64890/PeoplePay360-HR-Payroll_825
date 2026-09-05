# PeoplePay360 admin workspace

The frontend has one entry point: **/admin/login**. The home page redirects there; the previous /login, /register and /dashboard pages have been removed. **/admin/dashboard** requires a signed-in active administrator. /admin redirects to that dashboard.

## Run locally

From app, use npm run dev to run the frontend at http://localhost:3000 and the backend at http://localhost:5000. The backend requires DATABASE_URL and JWT_SECRET in backend/.env. FRONTEND_URL defaults to http://localhost:3000; NEXT_PUBLIC_API_URL defaults to http://localhost:5000/api. Keep these consistent when using another origin or port.

The initial administrator account is **admin@peoplepay.in**. Its generated password was delivered in the conversation, not stored in this repository. Existing accounts and their roles were preserved.

To create another administrator from a trusted terminal, run from backend:

```powershell
npm run admin:create -- admin@example.com
```

The command generates a password and prints it once. An optional ADMIN_INITIAL_PASSWORD environment variable supplies a password of at least 12 characters. Existing accounts are never promoted or reset by this command.

## Included behavior

- Dedicated admin login with password visibility, loading/error states and automatic redirect for an existing admin session.
- Live employee counts, recorded attendance percentage, pending leave requests and successful salary payments for a selected reporting month/currency.
- Six-month payment chart, department headcounts, recent payruns and auditable workspace activity. Empty states represent missing data; no demonstration HR/payroll values are inserted.
- Employee directory with search, pagination and profile creation. Creation also writes employment history and an audit event. An employee profile and a login account are separate records.
- User account search, pagination, creation, role changes and enable/disable controls. Password hashes are never returned by these APIs. Account creation does not send email.
- Attendance, leave and payroll lists show the latest 20 records for the selected month. These panels are read-only views; payroll computation and leave approval workflows are separate work.
- Activity shows the latest 30 events across all months. Account and employee directories are also not restricted by the reporting month.
- CSV overview export, refresh, responsive navigation, keyboard-accessible dialogs and logout.

## Access enforcement

POST /api/auth/admin/login checks the password, active status and ADMIN role before issuing the HTTP-only cookie. It limits sign-in attempts per IP within one backend process; deployments with several backend replicas should share a rate-limit store.

Every /api/admin endpoint independently checks the authenticated account and ADMIN role. Active status is checked from the database for each authenticated request, so disabling an account blocks existing sessions. Cookie-authenticated writes must come from FRONTEND_URL. Administrators cannot disable their own account or remove their own admin role. User creation, access changes and employee creation are audited.

The existing general backend authentication endpoints remain available for future employee applications. They do not grant access to the administrator API.

## Verification

```powershell
# From backend (uses the configured development database)
npm run test:admin

# From frontend
npm run lint
npm run build
```

The integration test uses uniquely named temporary accounts and an employee profile, and removes its own fixtures afterward. It covers anonymous/non-admin rejection, HTTP-only admin login, real dashboard metrics, invalid filters, private-field omission, self-access protection, cross-origin rejection, duplicate-account handling, employee history, and disabled-session rejection.

Browser checks cover invalid/valid login, user creation and role/status edits, responsive layout, navigation, and logout. User interface fixtures are removed after verification.
