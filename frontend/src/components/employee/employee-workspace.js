"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  FolderOpen,
  HandCoins,
  LayoutDashboard,
  Leaf,
  Menu,
  RefreshCw,
  Settings,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import Brand from "@/components/admin/brand";
import WorkspaceSidebar from "@/components/admin/workspace-sidebar";
import { ThemeToggle, useTheme } from "@/components/admin/theme-provider";
import {
  getCurrentUser,
  logoutUser,
  workspaceHome,
} from "@/services/auth.service";
import { errorMessage } from "@/services/admin.service";
import { employeeApi } from "@/services/employee.service";
import {
  Dialog,
  ResourceState,
  currentMonth,
  useEmployeeResource,
} from "./shared";
import WorkdaySections, { LeaveForm } from "./workday";
import EmployeeSchedule from "./schedule";
import EmployeeContacts from "./contacts";
import EmployeePayroll, { EmployeeContracts } from "./payroll";
import EmployeeDocuments from "./documents";
import {
  EmployeeNotifications,
  EmployeeSettings,
} from "./notifications-settings";
import "@/app/employee/dashboard/employee.css";

const groups = [
  [
    "MY WORKDAY",
    [
      ["overview", "Dashboard", LayoutDashboard],
      ["attendance", "Attendance", Clock3],
      ["schedule", "My schedule", CalendarDays],
      ["leave", "Time off", Leaf],
      ["balances", "Leave balances", Activity],
      ["contacts", "My contacts", Users],
    ],
  ],
  [
    "PAY & RECORDS",
    [
      ["contracts", "My contracts", FileText],
      ["payroll", "My payroll", Wallet],
      ["payslips", "Payslips", HandCoins],
      ["documents", "Documents", FolderOpen],
    ],
  ],
  [
    "PREFERENCES",
    [
      ["notifications", "Notifications", Bell],
      ["settings", "Settings", Settings],
    ],
  ],
];
const navigation = groups.flatMap(([, items]) => items),
  labels = Object.fromEntries(navigation.map(([key, label]) => [key, label]));
const descriptions = {
  overview: "Your workday, your team and everything you need, in one place.",
  profile: "Your employment details and personal contact information.",
  attendance: "Clock in, finish your day and review your working hours.",
  schedule: "Plan ahead with your shifts, holidays and approved time off.",
  leave: "Request time off and follow each approval.",
  balances: "Your allocated leave, usage and remaining balance.",
  contacts: "Stay connected with the people you work with.",
  contracts: "Review your employment terms and contract history.",
  payroll: "Understand your salary, deductions and payment details.",
  payslips: "View and download your released salary statements.",
  documents: "Keep your personal employment records organized.",
  notifications: "Catch up on changes to your records.",
  settings: "Make this workspace work for you.",
};
const loadDashboard = ({ month }) => employeeApi.dashboard(month);

function Workspace({ user }) {
  const router = useRouter(),
    { resolved, setTheme } = useTheme();
  const [month, setMonth] = useState(currentMonth),
    [revision, setRevision] = useState(0),
    [section, setSection] = useState("overview");
  const [preferencesRetry, setPreferencesRetry] = useState(0),
    [preferences, setPreferences] = useState(null),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dialog, setDialog] = useState(null),
    [clockNow, setClockNow] = useState(0);
  const dashboard = useEmployeeResource(loadDashboard, { month }, revision),
    notifications = useEmployeeResource(
      employeeApi.notifications,
      {},
      revision,
    );
  const data = dashboard.data;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    employeeApi
      .settings()
      .then((value) => {
        if (!active) return;
        setPreferences(value);
        setTheme(value.theme);
        const hash = window.location.hash.slice(1);
        setSection(labels[hash] ? hash : value.defaultSection);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
    // Apply the saved theme when this authenticated workspace mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, preferencesRetry]);
  useEffect(() => {
    const listener = () => {
      const key = window.location.hash.slice(1);
      setSection(labels[key] ? key : "overview");
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!data?.openSession || !["overview", "attendance"].includes(section))
      return;
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data?.openSession, section]);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = setInterval(onFocus, 60000);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  function navigate(next, targetMonth) {
    if (!labels[next]) return;
    if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(targetMonth || ""))
      setMonth(targetMonth);
    setSection(next);
    window.location.hash = next;
    setMobile(false);
    setNotice("");
    setError("");
  }
  const saved = (message) => {
    setDialog(null);
    setNotice(message);
    refresh();
  };
  async function checkIn() {
    setBusy(true);
    setError("");
    try {
      await employeeApi.clock({ action: "check-in" });
      saved("You are checked in. Have a good working day.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const elapsed = data?.openSession
    ? Math.max(
        0,
        Math.floor(
          ((clockNow || new Date(data.generatedAt).getTime()) -
            new Date(data.openSession.checkIn)) /
            1000,
        ),
      )
    : 0;
  const elapsedLabel = `${String(Math.floor(elapsed / 3600)).padStart(2, "0")}:${String(Math.floor(elapsed / 60) % 60).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  const workday = [
      "overview",
      "profile",
      "attendance",
      "leave",
      "balances",
    ].includes(section),
    reportMonth = ["overview", "attendance", "leave", "schedule"].includes(
      section,
    );
  const effectivePreferences = preferences || {
    timeFormat: "12h",
    weekStartsOn: 1,
    attendanceReminders: true,
  };
  return (
    <div className="pp-dashboard pp-hr-dashboard pp-employee-dashboard">
      <WorkspaceSidebar
        groups={groups}
        section={section}
        onNavigate={navigate}
        mobileOpen={mobile}
        onMobileChange={setMobile}
        organizationName={data?.settings.organizationName}
        workspaceLabel="Employee workspace"
        navigationLabel="Employee navigation"
        homeHref="/employee/dashboard"
        user={user}
        role="Employee"
        counts={{ notifications: notifications.data?.unread || 0 }}
        signingOut={busy}
        onSignOut={async () => {
          setBusy(true);
          try {
            await logoutUser();
            router.replace("/login");
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      />
      <div className="pp-workspace-main">
        <header className="pp-topbar">
          <div className="pp-topbar-location">
            <button
              className="pp-icon-button pp-mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobile}
              aria-controls="workspace-sidebar"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span className="pp-topbar-mark">
              <UserRound />
            </span>
            <div className="pp-topbar-location-text">
              <span className="pp-topbar-eyebrow">Employee workspace</span>
              <nav className="pp-breadcrumb" aria-label="Breadcrumb">
                <button
                  className="pp-breadcrumb-home"
                  onClick={() => navigate("overview")}
                >
                  Workspace
                </button>
                <ChevronRight size={14} />
                <strong>{labels[section]}</strong>
              </nav>
            </div>
          </div>
          <div className="pp-topbar-actions">
            <button
              className="pp-icon-button emp-bell-button"
              aria-label={`Notifications, ${notifications.data?.unread || 0} unread`}
              onClick={() => navigate("notifications")}
            >
              <Bell size={20} />
              {!!notifications.data?.unread && (
                <span>
                  {notifications.data.unread > 99
                    ? "99+"
                    : notifications.data.unread}
                </span>
              )}
            </button>
            <ThemeToggle />
            <button
              className="pp-avatar"
              aria-label="Open my profile"
              onClick={() => navigate("profile")}
            >
              {initials}
            </button>
          </div>
        </header>
        <main className="pp-main-content">
          <div className="pp-page-heading">
            <div>
              <p className="pp-eyebrow">YOUR PEOPLEPAY360</p>
              <h1>
                {section === "overview"
                  ? `Hello, ${data?.profile.firstName || user.name.split(" ")[0]}`
                  : labels[section]}
                <span className="pp-heading-dot">.</span>
              </h1>
              <p>{descriptions[section]}</p>
            </div>
            <button
              className="pp-button pp-button-primary"
              disabled={!data}
              onClick={() => {
                setError("");
                setDialog({ type: "leave" });
              }}
            >
              <Leaf size={17} />
              Request time off
            </button>
          </div>
          {error && (
            <div className="pp-error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  if (!preferences) setPreferencesRetry((v) => v + 1);
                  refresh();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {notice && (
            <p className="pp-module-notice" role="status">
              {notice}
            </p>
          )}
          <div className="pp-filter-bar">
            {reportMonth ? (
              <div className="pp-period-filter">
                <CalendarDays size={17} />
                <label htmlFor="employee-month">Reporting month</label>
                <input
                  id="employee-month"
                  type="month"
                  min="2000-01"
                  max="2099-12"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) setMonth(e.target.value);
                  }}
                />
              </div>
            ) : (
              <span className="pp-field-note">Your employee workspace</span>
            )}
            <div className="pp-filter-right">
              <span className="pp-field-note">{data?.settings.timezone}</span>
              <button
                className="pp-icon-button"
                aria-label="Refresh employee workspace"
                onClick={refresh}
              >
                <RefreshCw
                  size={18}
                  className={dashboard.loading ? "pp-spin" : ""}
                />
              </button>
            </div>
          </div>
          {workday &&
            (!data ? (
              <ResourceState resource={dashboard} onRetry={refresh} />
            ) : (
              <>
                {section === "overview" && (
                  <>
                    <div className="emp-quick-links">
                      {[
                        ["schedule", "My schedule", CalendarDays],
                        ["payslips", "Latest payslips", Wallet],
                        ["documents", "My documents", FolderOpen],
                        [
                          "notifications",
                          `${notifications.data?.unread || 0} unread updates`,
                          Bell,
                        ],
                      ].map(([key, label, Icon]) => (
                        <button key={key} onClick={() => navigate(key)}>
                          <Icon size={20} />
                          <span>{label}</span>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                    {effectivePreferences.attendanceReminders &&
                      !data.openSession &&
                      data.schedule?.todayMinutes > 0 && (
                        <p className="pp-module-notice">
                          You have {data.schedule.todayMinutes / 60} scheduled
                          hours today. Check in when you start work.
                        </p>
                      )}
                  </>
                )}
                <WorkdaySections
                  {...{
                    data: dashboard.data,
                    user,
                    section,
                    month,
                    busy,
                    setDialog,
                    checkIn,
                    elapsedLabel,
                    navigate,
                    resolved,
                    saved,
                  }}
                  loading={dashboard.loading}
                  preferences={effectivePreferences}
                />
              </>
            ))}
          {section === "schedule" && (
            <EmployeeSchedule
              {...{ month, revision, refresh }}
              preferences={effectivePreferences}
            />
          )}
          {section === "contacts" && (
            <EmployeeContacts {...{ revision, refresh }} />
          )}
          {section === "contracts" && (
            <EmployeeContracts {...{ revision, refresh }} />
          )}
          {["payroll", "payslips"].includes(section) && (
            <EmployeePayroll
              initialYear={Number(month.slice(0, 4))}
              key={`${section}:${month.slice(0, 4)}`}
              {...{ section, revision, refresh, navigate }}
            />
          )}
          {section === "documents" && (
            <EmployeeDocuments {...{ revision, refresh, saved, navigate }} />
          )}
          {section === "notifications" && (
            <EmployeeNotifications
              preferences={effectivePreferences}
              timezone={data?.settings.timezone}
              resource={notifications}
              {...{ refresh, navigate }}
            />
          )}
          {section === "settings" &&
            (preferences ? (
              <EmployeeSettings
                {...{ preferences, user, saved }}
                onPreferences={setPreferences}
                sections={navigation}
              />
            ) : (
              <p role="status">{error || "Loading preferences…"}</p>
            ))}
          <footer className="pp-workspace-footer">
            <span>PeoplePay360 · Your people. Your workday.</span>
            {data?.settings.supportEmail ? (
              <a href={`mailto:${data.settings.supportEmail}`}>
                Contact HR support
              </a>
            ) : (
              <span>Employee workspace</span>
            )}
          </footer>
        </main>
      </div>
      {dialog?.type === "leave" && data && (
        <LeaveForm
          types={data.leaveTypes}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
      {["checkout", "cancel"].includes(dialog?.type) && (
        <Dialog
          title={
            dialog.type === "checkout"
              ? "Finish your workday"
              : "Withdraw time-off request"
          }
          busy={busy}
          onClose={() => setDialog(null)}
        >
          <form
            className="pp-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                if (dialog.type === "checkout")
                  await employeeApi.clock({
                    action: "check-out",
                    breakMinutes: Number(form.get("break")),
                  });
                else
                  await employeeApi.cancelLeave(
                    dialog.request.id,
                    form.get("reason"),
                  );
                saved(
                  dialog.type === "checkout"
                    ? "Checked out. Your working hours are updated."
                    : "Your request has been withdrawn.",
                );
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {dialog.type === "checkout" ? (
              <label>
                Total break minutes
                <input
                  type="number"
                  name="break"
                  min="0"
                  max="1440"
                  defaultValue="0"
                  required
                />
              </label>
            ) : (
              <label>
                Reason
                <textarea
                  name="reason"
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
            )}
            {error && (
              <div className="pp-error" role="alert">
                {error}
              </div>
            )}
            <div className="pp-dialog-actions">
              <button
                type="button"
                className="pp-button pp-button-outline"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Back
              </button>
              <button className="pp-button pp-button-primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : dialog.type === "checkout"
                    ? "Check out"
                    : "Withdraw request"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

export default function EmployeeWorkspace() {
  const router = useRouter(),
    [user, setUser] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(({ user }) => {
        if (!active) return;
        if (!["EMPLOYEE", "ADMIN"].includes(user.role))
          return router.replace(workspaceHome(user.role));
        setUser(user);
      })
      .catch((e) => {
        if (active) {
          if (e.response?.status === 401) router.replace("/login");
          else setError(errorMessage(e));
        }
      });
    return () => {
      active = false;
    };
  }, [router]);
  if (!user)
    return (
      <main className="pp-access-loading">
        <Brand href="/login" />
        <p role="status">{error || "Opening your employee workspace…"}</p>
      </main>
    );
  return <Workspace key={user.id} user={user} />;
}
