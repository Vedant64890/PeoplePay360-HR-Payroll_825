<p align="center">
  <strong>🟩🟩</strong><br/>
  <strong>🟩🟩</strong>
</p>

<h1 align="center">PeoplePay360</h1>
<p align="center"><strong>HR & Payroll Management System</strong></p>
<p align="center">
  <em>People. Payroll. Progress.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/Express-5.x-green?logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/PostgreSQL-17-blue?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/License-Private-red" alt="License" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Database Configuration](#-database-configuration)
- [Environment Variables](#-environment-variables)
- [Running the Application](#-running-the-application)
- [User Roles & Access Control](#-user-roles--access-control)
- [Module Documentation](#-module-documentation)
- [API Reference](#-api-reference)
- [Password Reset & Email](#-password-reset--email)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)

---

## 🌟 Overview

**PeoplePay360** is a comprehensive, full-stack HR & Payroll Management System built for modern organizations. It provides a unified workspace for managing employees, tracking attendance, processing payroll, handling time-off requests, and generating insightful reports — all through a beautifully designed, role-based dashboard interface.

The application follows a modular, workspace-driven architecture where each user role (Admin, HR Manager, HR Payroll Manager, Employee) gets a purpose-built dashboard tailored to their responsibilities.

---

## ✨ Key Features

### 👥 Employee Management
- Complete employee lifecycle management (onboarding → active → termination)
- Employee profiles with contact information, department, job position, and work history
- Kanban and list views for employee directory
- Employee bank account management for payroll disbursement

### 📋 Contract Management
- Employment contract creation with start/end dates, salary, and terms
- Working schedule assignment per contract
- Contract status tracking (Draft → Open → Expired → Terminated)
- Automatic status transitions based on dates

### ⏰ Attendance & Time Tracking
- Real-time employee check-in / check-out with session timer
- Daily attendance computation (Present, Absent, On Leave, Holiday, Rest Day)
- Late minutes and overtime calculation based on assigned schedules
- Attendance correction history with audit trail
- Self-service attendance for employees

### 🗓️ Working Schedules
- Flexible weekly schedule configuration with shift lines
- Support for overnight shifts (cross-day schedules)
- Holiday calendar management (paid/unpaid)
- Schedule assignment to employees via contracts or direct assignment
- Grace period for late arrivals, overtime thresholds

### 🌿 Time-Off Management
- Configurable leave types (Sick, Annual, Casual, etc.)
- Multi-level approval workflows (Automatic, Single, Two-Level)
- Leave allocation management with validity periods
- Balance tracking with consumption and remaining days/hours
- Half-day and hourly leave support
- Employee self-service leave requests

### 💰 Payroll Processing
- Salary structure builder with configurable rules
- Rule categories (Basic, Allowance, Deduction, Employer Cost, Net)
- Payrun batch processing with employee selection
- Automatic payslip computation based on salary rules
- Proration support for mid-period joins/terminations
- Variable inputs per payslip (bonuses, commissions)
- Payment recording and tracking
- Payslip PDF generation and email delivery via SMTP

### 📊 Reports & Analytics
- Interactive payroll overview dashboard with 12 KPI cards
- Salary cost by department (bar chart)
- Monthly net salary trend (line chart)
- Department overview with headcount and costs
- Time-off overview with balances
- Attendance health metrics
- CSV export for payroll reports

### 🔐 Authentication & Security
- JWT-based authentication with HTTP-only cookies
- Role-based access control (RBAC)
- Password reset via email (Nodemailer + SMTP)
- "Keep me signed in" with configurable session persistence
- Rate limiting on login endpoints
- Tab-session isolation for multi-workspace access

### 🎨 UI/UX
- Light and dark theme with system preference detection
- Responsive design for desktop and mobile
- Collapsible sidebar navigation
- Smooth animations and micro-interactions
- Premium design with modern typography and color palettes

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Next.js 16 (React 19)                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────┐  │  │
│  │  │  Admin   │ │    HR    │ │  Payroll  │ │Employee │  │  │
│  │  │Dashboard │ │Dashboard │ │ Dashboard │ │Dashboard│  │  │
│  │  └──────────┘ └──────────┘ └───────────┘ └─────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │         Shared Components & Services             │  │  │
│  │  │  WorkspaceModule · WorkspaceSidebar · ThemeProvider│ │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                         │ Axios HTTP                         │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    Express 5 API Server                      │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────┐  │
│  │  Auth   │ │  Admin   │ │    HR     │ │    Payroll     │  │
│  │ Routes  │ │ Routes   │ │  Routes   │ │    Routes      │  │
│  └────┬────┘ └────┬─────┘ └─────┬─────┘ └───────┬────────┘  │
│       │           │             │               │            │
│  ┌────┴───────────┴─────────────┴───────────────┴────────┐   │
│  │                   Service Layer                        │   │
│  │  auth · admin · hr · payroll · time · reports · email  │   │
│  └────────────────────────┬───────────────────────────────┘   │
│                           │                                   │
│  ┌────────────────────────┴───────────────────────────────┐   │
│  │              Prisma ORM (v7.10)                         │   │
│  └────────────────────────┬───────────────────────────────┘   │
└───────────────────────────┼──────────────────────────────────┘
                            │
                 ┌──────────┴──────────┐
                 │   PostgreSQL 17     │
                 │   (auth schema)     │
                 └─────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer        | Technology                                     |
|:-------------|:-----------------------------------------------|
| **Frontend** | Next.js 16.3, React 19.2, Chart.js, Lucide React, Framer Motion |
| **Backend**  | Express 5.x, Node.js (ESM), JWT, Zod validation |
| **Database** | PostgreSQL 17 with Prisma ORM 7.10              |
| **Email**    | Nodemailer 10 (SMTP)                            |
| **PDF**      | PDFKit 0.20 (payslip generation)                |
| **Auth**     | bcryptjs, jsonwebtoken, HTTP-only cookies        |
| **Dev Tools**| tsx (TypeScript execution), Concurrently, ESLint |

---

## 📂 Project Structure

```
app/
├── backend/                        # Express API server
│   ├── prisma.config.ts            # Prisma configuration
│   ├── scripts/
│   │   ├── create-admin.mjs        # Admin user seeder
│   │   ├── demo-workspace.mjs      # Demo data seeder
│   │   └── configure-bank-key.mjs  # Bank encryption key setup
│   ├── src/
│   │   ├── app.js                  # Express app setup & middleware
│   │   ├── server.js               # HTTP server entry point
│   │   ├── config/                 # Application configuration
│   │   ├── constants/              # Enums and constants
│   │   ├── controllers/            # Request handlers
│   │   │   └── auth.controller.js  # Login/register/logout
│   │   ├── lib/                    # Shared utilities
│   │   │   ├── prisma.js           # Prisma client instance
│   │   │   ├── workspace.js        # Common workspace helpers
│   │   │   └── session-cookie.js   # Cookie management
│   │   ├── middleware/             # Express middleware
│   │   │   ├── auth.middleware.js  # JWT verification
│   │   │   └── error.middleware.js # Global error handler
│   │   ├── routes/                 # API route definitions
│   │   │   ├── auth.routes.js      # /api/auth/*
│   │   │   ├── admin.routes.js     # /api/admin/*
│   │   │   ├── hr.routes.js        # /api/hr/*
│   │   │   ├── payroll-workspace.routes.js  # /api/payroll/*
│   │   │   ├── employee.routes.js  # /api/employee/*
│   │   │   └── workspace.routes.js # /api/admin/workspace/*
│   │   ├── services/               # Business logic
│   │   │   ├── auth.service.js     # Authentication
│   │   │   ├── admin.service.js    # Admin workspace operations
│   │   │   ├── hr.service.js       # HR manager operations
│   │   │   ├── payroll.service.js  # Payroll computation engine
│   │   │   ├── time.service.js     # Attendance & leave logic
│   │   │   ├── reports.service.js  # Analytics & reporting
│   │   │   ├── password-reset.service.js   # Email-based reset
│   │   │   ├── payslip-delivery.service.js # Email payslips
│   │   │   ├── payslip-document.service.js # PDF generation
│   │   │   └── employee.service.js # Employee self-service
│   │   └── validators/            # Zod request schemas
│   └── test/                      # Integration tests
│
├── frontend/                      # Next.js application
│   └── src/
│       ├── app/
│       │   ├── layout.js          # Root layout with ThemeProvider
│       │   ├── admin/             # Admin dashboard & styles
│       │   │   ├── dashboard/page.js
│       │   │   ├── admin.css      # Core design system
│       │   │   ├── theme.css      # Light/dark theme tokens
│       │   │   └── workspace-interactions.css
│       │   ├── hr/                # HR Manager dashboard
│       │   │   └── dashboard/page.js
│       │   ├── payroll/           # Payroll Manager dashboard
│       │   │   └── dashboard/page.js
│       │   ├── employee/          # Employee self-service
│       │   │   └── dashboard/page.js
│       │   ├── login/             # Login page
│       │   ├── forgot-password/   # Password reset request
│       │   └── reset-password/    # Password reset form
│       ├── components/admin/      # Shared UI components
│       │   ├── brand.js           # PeoplePay360 logo
│       │   ├── workspace-module.js    # Dynamic CRUD module
│       │   ├── workspace-sidebar.js   # Navigation sidebar
│       │   ├── workspace-login.js     # Auth forms
│       │   ├── workspace-reports.js   # Charts & analytics
│       │   ├── workspace-config.js    # Resource configurations
│       │   ├── hr-config.js           # HR-specific configs
│       │   ├── theme-provider.js      # Theme context
│       │   └── schedule-hours.mjs     # Schedule utilities
│       └── services/              # API client services
│           ├── api.js             # Axios instance
│           ├── auth.service.js    # Auth API calls
│           ├── admin.service.js   # Admin API calls
│           ├── hr.service.js      # HR API calls
│           ├── payroll.service.js # Payroll API calls
│           └── employee.service.js # Employee API calls
│
├── database/                      # Database documentation & schema
│   ├── SCHEMA_GUIDE.md            # Complete schema documentation
│   └── prisma/
│       ├── schema.prisma          # Prisma schema (56KB, 60+ models)
│       ├── seed-roles.sql         # Default role seeds
│       └── *.sql                  # Migration scripts
│
└── package.json                   # Root monorepo config
```

---

## ✅ Prerequisites

Before setting up the project, ensure you have the following installed:

| Tool           | Version    | Purpose                    |
|:---------------|:-----------|:---------------------------|
| **Node.js**    | ≥ 18.x     | JavaScript runtime         |
| **npm**        | ≥ 9.x      | Package manager            |
| **PostgreSQL** | ≥ 15.x     | Relational database        |
| **Git**        | Latest     | Version control            |

---

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Odoo_Final_hackathon_Project/app
```

### 2. Install Dependencies

```bash
# Install root dependencies (concurrently)
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### 3. Configure Environment Variables

```bash
# Copy the example or create a new .env file
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your settings (see [Environment Variables](#-environment-variables) section).

---

## 🗄️ Database Configuration

### 1. Create the PostgreSQL Database

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create the database
CREATE DATABASE "Odoo_hackathon";

-- Create the schema
\c Odoo_hackathon
CREATE SCHEMA IF NOT EXISTS auth;
```

### 2. Sync Prisma Schema

```bash
cd backend

# Format, validate, push schema, and generate client (all-in-one)
npm run prisma:sync
```

### 3. Create the Admin User

```bash
npm run admin:create
```

This will interactively prompt you for:
- Admin name
- Admin email
- Admin password (minimum 8 characters)

### 4. (Optional) Seed Demo Data

```bash
npm run demo:seed
```

This creates sample employees, departments, contracts, working schedules, leave types, and allocations.

---

## 🔧 Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# ─── Server ───
PORT=5000

# ─── Frontend URL (for CORS and password reset links) ───
FRONTEND_URL="http://localhost:3000"

# ─── Database ───
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/Odoo_hackathon?schema=auth"

# ─── JWT Authentication ───
JWT_SECRET="your-secure-random-secret-key-min-32-characters"
JWT_EXPIRES_IN="2d"
JWT_COOKIE_NAME="access_token"

# ─── SMTP Email (for password reset & payslip delivery) ───
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-gmail-app-password"
MAIL_FROM="PeoplePay360 <your-email@gmail.com>"

# ─── Bank Account Encryption (optional) ───
BANK_ENCRYPTION_KEY=""
```

> **⚠️ Important:** For Gmail SMTP, you must use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password. Enable 2-Step Verification first, then generate an App Password under Security → App passwords.

---

## ▶️ Running the Application

### Development Mode (Recommended)

From the project root (`app/` directory):

```bash
npm run dev
```

This starts **both** servers concurrently:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5000

### Individual Servers

```bash
# Frontend only
cd frontend
npm run dev

# Backend only
cd backend
npm run dev
```

### Production Build

```bash
# Build the frontend
cd frontend
npm run build
npm start

# Start backend
cd ../backend
npm start
```

---

## 👤 User Roles & Access Control

PeoplePay360 implements a comprehensive Role-Based Access Control system:

| Role                    | Code                 | Dashboard                 | Capabilities |
|:------------------------|:---------------------|:--------------------------|:-------------|
| **Administrator**       | `ADMIN`              | `/admin/dashboard`        | Full system access. Manage users, roles, organization settings, employees, contracts, schedules, attendance, leave, payroll, and reports. |
| **HR Manager**          | `HR_MANAGER`         | `/hr/dashboard`           | Manage employees, contracts, attendance, working schedules, leave requests, leave allocations, and time-off types. |
| **HR Payroll Manager**  | `HR_PAYROLL_MANAGER` | `/payroll/dashboard`      | Everything HR Manager can do, plus salary structures, salary rules, payruns, payslips, and payroll reports. Full payroll configuration. |
| **HR Payroll User**     | `HR_PAYROLL_USER`    | `/payroll/dashboard`      | Read-only payroll configuration. Can view and process payruns/payslips but cannot modify salary structures or rules. No allocation management. |
| **Employee**            | `EMPLOYEE`           | `/employee/dashboard`     | Self-service: check in/out, view attendance, request time off, view leave balances, view schedule, update contact info. |

---

## 📦 Module Documentation

### 🏢 Admin Workspace (`/admin/dashboard`)

The admin workspace provides complete organizational control:

- **Overview**: Real-time KPI cards (employees, contracts, leave, attendance)
- **Employees**: Full employee directory with kanban/list views
- **Contracts**: Employment contract lifecycle management
- **Working Schedules**: Weekly shift configuration with holidays
- **Attendance**: Check-in/check-out management and daily summaries
- **Time-off Requests**: Approve/refuse employee leave requests
- **Allocations**: Assign leave balances to employees
- **Time-off Types**: Configure leave policies and approval flows
- **Users & Roles**: System user and role management
- **Organization Settings**: Company name, timezone, currency, support email
- **Reports & Analytics**: Charts, tables, and data exports

### 🧑‍💼 HR Manager Workspace (`/hr/dashboard`)

Focused on people management:

- All employee, contract, and schedule management
- Attendance tracking with daily attendance computation
- Leave request decisions (approve, refuse, cancel)
- Leave allocation creation and management
- Time-off type configuration

### 💰 Payroll Workspace (`/payroll/dashboard`)

Full payroll processing pipeline:

- **Dashboard Overview**: 12 KPI cards, salary charts, department breakdown
- **Salary Structures**: Define pay structure templates with ordered rules
- **Salary Rules**: Configure individual computation rules (basic, allowances, deductions)
- **Payruns**: Batch payroll processing
  - Create → Select employees → Compute → Validate → Record payment
- **Payslips**: Individual employee pay records with salary breakdown
- **Reports**: Payroll trend analysis and CSV export
- **All HR modules**: Employees, contracts, schedules, attendance, leave

### 👤 Employee Workspace (`/employee/dashboard`)

Self-service portal:

- **My Dashboard**: Personal KPI cards, working hours chart, team info
- **Clock In/Out**: One-click attendance with live session timer
- **Time-off Requests**: Submit and track leave requests
- **Leave Balances**: View allocated vs remaining balances
- **Working Schedule**: View assigned shift schedule
- **My Profile**: Update contact and emergency information

---

## 📡 API Reference

### Authentication

| Method | Endpoint                  | Description              |
|:-------|:--------------------------|:-------------------------|
| POST   | `/api/auth/register`      | Register a new user      |
| POST   | `/api/auth/login`         | Login (returns cookie)   |
| POST   | `/api/auth/admin/login`   | Admin-only login         |
| POST   | `/api/auth/hr/login`      | HR role login            |
| POST   | `/api/auth/logout`        | Clear session cookie     |
| POST   | `/api/auth/forgot-password` | Send reset email       |
| POST   | `/api/auth/reset-password`  | Reset with token       |
| GET    | `/api/users/me`           | Get current user         |

### Admin Workspace

| Method | Endpoint                          | Description                |
|:-------|:----------------------------------|:---------------------------|
| GET    | `/api/admin/workspace/:resource`  | List resource records      |
| GET    | `/api/admin/workspace/:resource/:id` | Get single record       |
| POST   | `/api/admin/workspace/:resource`  | Create record              |
| PUT    | `/api/admin/workspace/:resource/:id` | Update record           |
| POST   | `/api/admin/workspace/:resource/:id/action` | Execute action    |
| GET    | `/api/admin/workspace/lookups`    | Fetch dropdown options     |
| GET    | `/api/admin/workspace/reports`    | Dashboard analytics        |

### HR Workspace

| Method | Endpoint                         | Description                |
|:-------|:---------------------------------|:---------------------------|
| GET    | `/api/hr/workspace/:resource`    | List HR records            |
| POST   | `/api/hr/workspace/attendance`   | Record attendance          |
| POST   | `/api/hr/workspace/leave`        | Create leave request       |
| POST   | `/api/hr/workspace/allocations`  | Create allocation          |
| POST   | `/api/hr/workspace/:resource/:id/action` | Approve/refuse/cancel |

### Payroll Workspace

| Method | Endpoint                              | Description            |
|:-------|:--------------------------------------|:-----------------------|
| GET    | `/api/payroll/workspace/dashboard`    | Payroll dashboard data |
| GET    | `/api/payroll/workspace/:resource`    | List payroll records   |
| POST   | `/api/payroll/workspace/payruns`      | Create payrun          |
| POST   | `/api/payroll/workspace/payruns/:id/action` | Compute/validate/pay |
| GET    | `/api/payroll/workspace/export`       | CSV report export      |

### Employee Self-Service

The complete employee workspace includes dashboard, profile, attendance, schedule, time off, leave balances, contacts, contracts, payroll, payslips, documents, notifications and settings.

See [Employee Module](EMPLOYEE_MODULE.md) for the feature matrix, architecture, database setup, complete API reference and verification instructions.

For an existing database, run `npm run employee:setup` from `backend/` to install private document storage, preferences and notification receipts.


---

## 📧 Password Reset & Email

PeoplePay360 uses **Nodemailer** with SMTP for:

1. **Password Reset Flow**:
   - User clicks "Forgot password?" on the login page
   - Enters their work email
   - Receives an email with a secure reset link (valid for 30 minutes)
   - Clicks the link and sets a new password
   - Existing sessions are invalidated

2. **Payslip Delivery**:
   - After validating a payrun, click "Send Payslips"
   - Each employee receives their payslip PDF via email

### Gmail SMTP Setup

1. Enable **2-Step Verification** on your Google account
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
3. Generate an app password for "Mail"
4. Set in your `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
MAIL_FROM="PeoplePay360 <your-email@gmail.com>"
```

---

## 🧪 Testing

The project includes integration tests for core workflows:

```bash
cd backend

# Run all tests
npm test

# Run admin tests only
npm run test:admin

# Run full workspace test suite
npm run test:workspace
```

Test suites cover:
- Authentication (register, login, logout)
- Admin workspace CRUD operations
- Payroll computation and payrun workflow
- Password reset flow
- Tab session isolation
- Employee account linking

---

## 🚢 Deployment

### Environment Checklist

- [ ] PostgreSQL database provisioned and accessible
- [ ] `DATABASE_URL` set with production credentials
- [ ] `JWT_SECRET` set to a strong random value (≥32 characters)
- [ ] `FRONTEND_URL` set to your production domain
- [ ] `NODE_ENV=production` set
- [ ] SMTP credentials configured for email features
- [ ] `BANK_ENCRYPTION_KEY` set if using bank account features
- [ ] Prisma schema synced (`npm run prisma:sync`)
- [ ] Admin user created (`npm run admin:create`)

### Recommended Platforms

| Platform       | Frontend           | Backend             | Database          |
|:---------------|:-------------------|:--------------------|:------------------|
| **Vercel**     | Next.js hosting    | —                   | —                 |
| **Railway**    | —                  | Node.js service     | PostgreSQL add-on |
| **Render**     | Static site        | Web service         | PostgreSQL        |
| **AWS**        | Amplify / S3 + CF  | ECS / Lambda        | RDS PostgreSQL    |
| **DigitalOcean** | App Platform     | App Platform        | Managed DB        |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style Guidelines

- **Backend**: ESM modules, Zod for validation, Prisma for database access
- **Frontend**: React 19 with hooks, CSS modules (no inline styles for layout)
- **Naming**: camelCase for variables/functions, PascalCase for components
- **Files**: kebab-case for filenames

---

## 📄 License

This project is private and proprietary. Built for the Odoo Final Hackathon.

---

<p align="center">
  <strong>Built with ❤️ by the PeoplePay360 Team</strong><br/>
  <em>People first. Always.</em>
</p>
