"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, LayoutDashboard, Leaf, LoaderCircle, Menu, MoreHorizontal, Plus, RefreshCw, Search, Settings, ShieldCheck, Users, Wallet, X } from "lucide-react";
import WorkspaceModule from "@/components/admin/workspace-module";
import WorkspaceReports from "@/components/admin/workspace-reports";
import WorkspaceSettings from "@/components/admin/workspace-settings";
import { ThemeToggle } from "@/components/admin/theme-provider";
import useDashboardRefresh from "@/components/admin/use-dashboard-refresh";
import Brand from "@/components/admin/brand";
import WorkspaceSidebar from "@/components/admin/workspace-sidebar";
import DeleteAccountDialog from "@/components/admin/delete-account-dialog";
import RecordDialog, { roleLabels } from "@/components/admin/record-dialog";
import { fetchWorkspace, fetchDashboard, fetchAccounts, fetchEmployees, errorMessage } from "@/services/admin.service";
import { getCurrentUser, logoutUser } from "@/services/auth.service";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "contracts", label: "Contracts", icon: ShieldCheck },
  { id: "schedules", label: "Working schedules", icon: CalendarDays },
  { id: "attendance", label: "Attendance", icon: Clock3 },
  { id: "leave", label: "Time-off requests", icon: Leaf },
  { id: "payruns", label: "Payruns", icon: Wallet },
  { id: "payslips", label: "Payslips", icon: ArrowDownToLine },
  { id: "structures", label: "Salary structures", icon: LayoutDashboard },
  { id: "rules", label: "Salary rules", icon: CheckCheck },
  { id: "users", label: "Users and roles", icon: ShieldCheck },
  { id: "reports", label: "Reports", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];
const titles = Object.fromEntries(navigation.map(item => [item.id, item.id === "overview" ? "Workspace overview" : item.label]));
const descriptions = { settings: "Organization details, regional defaults and reporting preferences.", overview: "A little perspective on your people and your workplace.", employees: "Manage employee profiles, departments and job positions.", contracts: "Employment terms, wages, salary structures and contract history.", schedules: "Define weekly shifts, holidays and employee schedule assignments.", attendance: "Record check-ins, close sessions and audit attendance corrections.", leave: "Manage time-off requests, allocations, balances and approvals.", payruns: "Select employees, compute payroll, validate payslips and record payments.", payslips: "Review salary breakdowns, worked time, variable inputs and payment history.", structures: "Build salary structures with ordered calculation rules.", rules: "Configure salary components, formulas, percentages and conditions.", users: "Manage workspace accounts and their assigned roles.", reports: "Review HR and payroll totals, department costs and audit history." };
const currentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };
const initials = (name = "") => name.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
const humanize = (value = "") => value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const dateLabel = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const money = (value, currency, compact = false) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: "compact" } : {}) }).format(Number(value || 0));

function Badge({ value }) {
  const positive = ["ACTIVE", "ENABLED", "PRESENT", "APPROVED", "PAID", "SUCCEEDED"].includes(value);
  const pending = ["DRAFT", "SUBMITTED", "FIRST_APPROVED", "PENDING", "COMPUTED", "VALIDATED", "ON_LEAVE"].includes(value);
  return <span className={`pp-badge ${positive ? "pp-badge-green" : pending ? "pp-badge-amber" : "pp-badge-neutral"}`}><i />{humanize(value)}</span>;
}

function Empty({ icon: Icon = Users, title, text, action }) {
  return <div className="pp-empty"><span className="pp-empty-icon"><Icon size={25} strokeWidth={1.5} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function Loading({ text = "Bringing your workspace together…" }) {
  return <div className="pp-loading" role="status"><LoaderCircle className="pp-spin" size={25} /><span>{text}</span></div>;
}

function ActivityList({ events, full = false }) {
  if (!events.length) return <Empty icon={Activity} title="A fresh start" text="New employees and account changes will appear here as your workspace grows." />;
  return <div className={`pp-activity-list ${full ? "pp-activity-full" : ""}`}>{events.map((event) => <div className="pp-activity-item" key={event.id}><span className="pp-activity-icon">{event.entityType === "Employee" ? <Users size={16} /> : <ShieldCheck size={16} />}</span><div><strong>{humanize(event.action)}</strong><p>{event.actor?.name || "System"} <span>·</span> {event.entityType} #{event.entityId}</p></div><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}<small>{new Date(event.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</small></time></div>)}</div>;
}

function PayrollChart({ trend, currency }) {
  const max = Math.max(...trend.map((point) => Number(point.total)), 0);
  return <div className="pp-chart" role="img" aria-label={`Salary payments over six months in ${currency}. ${trend.map((point) => `${point.month}: ${point.total}`).join(", ")}`}>
    <div className="pp-chart-y">{[1, 0.75, 0.5, 0.25, 0].map((ratio) => <span key={ratio}>{money(max * ratio, currency, true)}</span>)}</div>
    <div className="pp-chart-plot"><div className="pp-chart-grid">{[0, 1, 2, 3, 4].map((line) => <i key={line} />)}</div>
      <div className="pp-chart-bars">{trend.map((point, index) => <div className="pp-chart-column" key={point.month}><div className={`pp-chart-bar ${index === 5 ? "pp-chart-bar-current" : ""}`} style={{ height: max && Number(point.total) ? `${Number(point.total) / max * 100}%` : "3px" }} title={`${point.month}: ${money(point.total, currency)}`} /><span>{new Date(`${point.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</span></div>)}</div>
      {!max && <div className="pp-chart-zero"><span><Wallet size={18} /> Your first payday starts the story</span><small>Payment trends will appear when payroll is marked paid.</small></div>}
    </div>
  </div>;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [records, setRecords] = useState({ items: [], total: 0, page: 1, pageSize: 10 });
  const [section, setSection] = useState("overview");
  const [month, setMonth] = useState(currentMonth);
  const [currency, setCurrency] = useState("INR");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useDashboardRefresh(setRevision);
  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchWorkspace("settings").then(value => { if (active) { setSettings(value); setCurrency(value.defaultCurrency); } }).catch(() => {});
    return () => { active = false; };
  }, [user]);
  function settingsSaved(value) { setSettings(value); setCurrency(value.defaultCurrency); setToast("Workspace settings saved."); }

  const reportError = useCallback((failure) => {
    if ([401, 403].includes(failure.response?.status)) { router.replace("/login"); return; }
    setError(errorMessage(failure));
  }, [router]);

  useEffect(() => {
    let active = true;
    getCurrentUser().then(({ user: current }) => {
      if (!active) return;
      if (current.role !== "ADMIN") router.replace("/login");
      else setUser(current);
    }).catch((failure) => { if (active) { if (failure.response?.status === 401) router.replace("/login"); else { setError(errorMessage(failure)); setLoading(false); } } });
    return () => { active = false; };
  }, [router, revision]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function load() {
      setLoading(true); setError("");
      try { const response = await fetchDashboard({ month, currency }); if (active) setData(response); }
      catch (failure) { if (active) reportError(failure); }
      finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [user, month, currency, revision, reportError]);

  useEffect(() => {
    if (!user || section !== "users") return;
    let active = true;
    async function load() {
      setListLoading(true);
      try { const result = await (section === "users" ? fetchAccounts : fetchEmployees)({ q: search, page }); if (active) setRecords(result); }
      catch (failure) { if (active) reportError(failure); }
      finally { if (active) setListLoading(false); }
    }
    const timer = setTimeout(load, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [user, section, search, page, revision, reportError]);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timer); }, [toast]);

  function navigate(target) {
    setSection(target); setSearch(""); setPage(1); setMobileNav(false); setError("");
    if (["users", "employees"].includes(target)) { setRecords({ items: [], total: 0, page: 1, pageSize: 10 }); setListLoading(true); }
  }
  async function signOut() {
    setSigningOut(true);
    debugger;
    try { await logoutUser(); router.replace("/login"); } catch (failure) { setError(errorMessage(failure)); setSigningOut(false); }
  }
  function saved(message) { setDialog(null); setToast(message); setRevision((value) => value + 1); }
  function exportOverview() {
    if (!data) return;
    const rows = [["PeoplePay360 workspace overview", month], ["Currency", currency], ["Employees", data.metrics.employees], ["Active employees", data.metrics.activeEmployees], ["Pending leave requests", data.metrics.pendingLeave], ["Recorded attendance percent", data.metrics.attendanceRate ?? "No records"], ["Net salary paid", data.metrics.paidSalary], [], ["Month", `Paid salary (${currency})`], ...data.trend.map((point) => [point.month, point.total])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `peoplepay360-overview-${month}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Your workspace report has been exported.");
  }

  if (!user) return <main className="pp-access-loading"><Brand href="/login" />{error ? <div className="pp-panel pp-access-error"><p role="alert">{error}</p><button className="pp-button pp-button-primary" onClick={() => setRevision((value) => value + 1)}>Try again</button></div> : <Loading text="Checking your workspace access…" />}</main>;

  const metric = data?.metrics;
  const actions = <button className="pp-button pp-button-primary" onClick={() => setDialog({ kind: "account" })}><Plus size={17} />Create account</button>;

  return <div className="pp-dashboard">
    <WorkspaceSidebar
      groups={[["WORKSPACE", navigation.slice(0, 10).map(({ id, label, icon }) => [id, label, icon])], ["ADMINISTRATION", navigation.slice(10).map(({ id, label, icon }) => [id, label, icon])]]}
      section={section} onNavigate={navigate} mobileOpen={mobileNav} onMobileChange={setMobileNav}
      organizationName={settings?.organizationName} workspaceLabel="Admin workspace" navigationLabel="Admin navigation"
      homeHref="/admin/dashboard" user={user} role="Administrator" onSignOut={signOut} signingOut={signingOut}
      counts={{ leave: metric?.pendingLeave }}
    />

    <div className="pp-workspace-main">
      <header className="pp-topbar">
        <div className="pp-topbar-location">
          <button className="pp-icon-button pp-mobile-menu" aria-label="Open navigation" aria-expanded={mobileNav} aria-controls="workspace-sidebar" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
          <span className="pp-topbar-mark" aria-hidden="true"><LayoutDashboard size={21} strokeWidth={1.7} /></span>
          <div className="pp-topbar-location-text">
            <span className="pp-topbar-eyebrow">Admin workspace</span>
            <nav className="pp-breadcrumb" aria-label="Breadcrumb">
              <button className="pp-breadcrumb-home" onClick={() => navigate("overview")}>Workspace</button>
              <ChevronRight className="pp-breadcrumb-separator" size={13} aria-hidden="true" />
              <strong aria-current="page" title={navigation.find((item) => item.id === section)?.label}>{navigation.find((item) => item.id === section)?.label}</strong>
            </nav>
          </div>
        </div>
        <div className="pp-topbar-actions">
          <span className="pp-live-status"><span className="pp-dot" /> Live workspace</span>
          <div className="pp-topbar-tools"><ThemeToggle /><button className="pp-icon-button pp-activity-button" title="View recent activity" aria-label="View recent activity" onClick={() => navigate("reports")}><Bell size={19} /></button></div>
          <span className="pp-topbar-divider" aria-hidden="true" />
          <button className="pp-topbar-profile" aria-label={`Open workspace settings for ${user.name}`} title={`${user.email} · Workspace settings`} onClick={() => navigate("settings")}>
            <span className="pp-avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="pp-topbar-profile-text"><strong>{user.name}</strong><small>Administrator</small></span>
            <Settings className="pp-profile-settings" size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="pp-main-content" id="main-content">
        <div className="pp-page-heading"><div><p className="pp-eyebrow">{section === "overview" ? "THE BIG PICTURE" : "YOUR CONNECTED WORKSPACE"}</p><h1>{titles[section]}<span className="pp-heading-dot">.</span></h1><p>{descriptions[section]}</p></div><div className="pp-heading-actions">{section === "overview" && <button className="pp-button pp-button-outline" onClick={exportOverview} disabled={!data || loading}><ArrowDownToLine size={17} />Export report</button>}{["overview", "users"].includes(section) && actions}</div></div>
        {error && <div className="pp-error pp-dashboard-error" role="alert"><span>{error}</span><button onClick={() => setRevision((value) => value + 1)}>Try again</button></div>}
        {section !== "settings" && <div className="pp-filter-bar"><div className="pp-period-filter"><CalendarDays size={16} /><label htmlFor="dashboard-month">Reporting month</label><input type="month" id="dashboard-month" min="2000-01" max="2099-12" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} /></div><div className="pp-filter-right"><label className="pp-currency-filter">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}>{([...new Set([currency, ...(data?.currencies || ["INR"])])]).map((code) => <option key={code} value={code}>{code}</option>)}</select></label><button className="pp-icon-button" aria-label="Refresh dashboard" onClick={() => setRevision((value) => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? "pp-spin" : ""} /></button></div></div>}
        {loading && !data ? <Loading /> : data && <>
          {section === "overview" && <>
            <section className="pp-metrics" aria-label="Workspace metrics" aria-busy={loading}>
              <div className="pp-metric"><div className="pp-metric-top"><span>Total employees</span><span className="pp-icon-box pp-tone-green"><Users size={19} /></span></div><strong className="pp-kpi-value" key={`employees:${metric.employees}`}>{metric.employees.toLocaleString()}</strong><p><span className="pp-small-dot pp-green-dot" />{metric.activeEmployees} active employees <button aria-label="View employees" onClick={() => navigate("employees")}><ArrowUpRight size={16} /></button></p></div>
              <div className="pp-metric"><div className="pp-metric-top"><span>Recorded attendance</span><span className="pp-icon-box pp-tone-blue"><Clock3 size={19} /></span></div><strong className="pp-kpi-value" key={`attendance:${metric.attendanceRate}`}>{metric.attendanceRate === null ? "—" : `${metric.attendanceRate}%`}</strong><p>{metric.present + metric.absent ? `${metric.present} present · ${metric.absent} absent days` : "Your first check-in starts here"}<button aria-label="View attendance" onClick={() => navigate("attendance")}><ArrowUpRight size={16} /></button></p></div>
              <div className="pp-metric"><div className="pp-metric-top"><span>Pending time off</span><span className="pp-icon-box pp-tone-orange"><CalendarDays size={19} /></span></div><strong className="pp-kpi-value" key={`leave:${metric.pendingLeave}`}>{metric.pendingLeave}</strong><p><span className="pp-small-dot pp-orange-dot" />{metric.pendingLeave ? "Requests awaiting a decision" : "You’re all caught up"}<button aria-label="View time off" onClick={() => navigate("leave")}><ArrowUpRight size={16} /></button></p></div>
              <div className="pp-metric pp-metric-dark"><div className="pp-metric-top"><span>Net salary paid</span><span className="pp-icon-box"><Wallet size={19} /></span></div><strong className="pp-kpi-value" key={`salary:${metric.paidSalary}:${currency}`}>{money(metric.paidSalary, currency, Number(metric.paidSalary) >= 1000000)}</strong><p>Successful payments this month<button aria-label="View payroll" onClick={() => navigate("payruns")}><ArrowUpRight size={16} /></button></p></div>
            </section>

            <section className="pp-overview-grid">
              <div className="pp-panel pp-payroll-panel"><div className="pp-panel-heading"><div><h2>Every payday, in perspective</h2><p>Net salary paid over the last six months</p></div><span className="pp-chart-legend"><i /> Salary paid</span></div><PayrollChart trend={data.trend} currency={currency} /><div className="pp-panel-footnote"><ShieldCheck size={14} /> Based on successful payments. Reversed payments are excluded.</div></div>
              <div className="pp-panel pp-team-panel"><div className="pp-panel-heading"><div><h2>A team that adds up</h2><p>People across your departments</p></div><Users size={19} className="pp-muted" /></div>{data.departments.some((department) => department.employees) ? <div className="pp-department-list">{data.departments.filter((department) => department.employees).slice(0, 5).map((department, index) => <div className="pp-department-row" key={department.id}><div><span><i style={{ background: ["#397963", "#92aa8b", "#d9bd7a", "#aaa1c5", "#86aabc"][index] }} />{department.name}</span><strong>{department.employees}</strong></div><div className="pp-progress-track"><i style={{ width: `${department.employees / Math.max(metric.employees, 1) * 100}%`, background: ["#397963", "#92aa8b", "#d9bd7a", "#aaa1c5", "#86aabc"][index] }} /></div></div>)}</div> : <Empty icon={Users} title="Great teams start somewhere" text="Department headcounts appear as employees are assigned to their teams." />}<button className="pp-panel-link" onClick={() => navigate("employees")}>Meet your people <ArrowRight size={16} /></button></div>
            </section>

            {!metric.employees && <section className="pp-onboarding-banner"><div className="pp-onboarding-art" aria-hidden="true"><Users size={27} /><span><Plus size={14} /></span></div><div><span className="pp-eyebrow">YOUR NEXT CHAPTER</span><h2>Let’s make this workspace yours.</h2><p>Create an Employee workspace account to add your first employee.</p></div><button className="pp-button pp-button-outline" onClick={() => setDialog({ kind: "account" })}>Create Employee account <ArrowRight size={17} /></button></section>}

            <section className="pp-overview-grid pp-lower-grid"><div className="pp-panel"><div className="pp-panel-heading"><div><h2>Recent payruns</h2><p>A quick check on this month’s payroll</p></div><button className="pp-text-button" onClick={() => navigate("payruns")}>View all <ArrowUpRight size={15} /></button></div>{data.payruns.length ? <div className="pp-mini-runs">{data.payruns.slice(0, 4).map((run) => <div key={run.id}><span className="pp-icon-box pp-tone-green"><Wallet size={18} /></span><div><strong>{run.name}</strong><small>{run._count.payslips} payslips · {run.currency}</small></div><Badge value={run.status} /></div>)}</div> : <Empty icon={Wallet} title="Your next payday belongs here" text="Payruns will appear when your payroll team creates a batch for this month." />}</div><div className="pp-panel"><div className="pp-panel-heading"><div><h2>Around the workspace</h2><p>The latest changes, all in one place</p></div><button className="pp-icon-button" aria-label="Open activity log" onClick={() => navigate("reports")}><MoreHorizontal size={20} /></button></div><ActivityList events={data.activity.slice(0, 4)} /></div></section>
          </>}

          {section === "users" && <section className="pp-panel pp-directory"><div className="pp-panel-heading"><div><h2>{section === "employees" ? "Employee directory" : "Workspace accounts"} <span className="pp-count">{records.total}</span></h2><p>{section === "employees" ? "Active, onboarding and other current employee profiles" : "Manage roles and account access. Only administrators can access this page."}</p></div><div className="pp-search"><Search size={17} /><input aria-label={section === "employees" ? "Search employees" : "Search accounts"} placeholder={section === "employees" ? "Search name, code or email…" : "Search name or email…"} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div></div>{listLoading ? <Loading text="Loading records…" /> : records.items.length ? <div className="pp-table-scroll"><table className="pp-table"><thead><tr>{(section === "employees" ? ["Employee", "Department", "Employment", "Joined", "Status"] : ["Account", "Role", "Last sign in", "Status", "Access"]).map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{records.items.map((record) => section === "employees" ? <tr key={record.id}><td><div className="pp-person"><span className="pp-avatar">{initials(`${record.firstName} ${record.lastName}`)}</span><div><strong>{record.firstName} {record.lastName}</strong><small>{record.employeeCode} · {record.workEmail || "No email yet"}</small></div></div></td><td>{record.department?.name || <span className="pp-muted">Unassigned</span>}</td><td>{humanize(record.employeeType)}</td><td>{dateLabel(record.hireDate)}</td><td><Badge value={record.status} /></td></tr> : <tr key={record.id}><td><div className="pp-person"><span className="pp-avatar">{initials(record.name)}</span><div><strong>{record.name}{record.id === user.id && <span className="pp-you">You</span>}</strong><small>{record.email}</small></div></div></td><td>{roleLabels[record.role]}</td><td>{record.lastLoginAt ? dateLabel(record.lastLoginAt) : <span className="pp-muted">Not signed in yet</span>}</td><td><Badge value={record.isActive ? "ENABLED" : "DISABLED"} /></td><td><div className="pp-row-actions"><button className="pp-text-button" aria-label={`Manage access for ${record.name}`} onClick={() => setDialog({ kind: "access", account: record })}>Manage <ArrowUpRight size={14} /></button><button className="pp-text-button pp-text-danger" aria-label={`Delete account for ${record.name}`} disabled={record.id === user.id} title={record.id === user.id ? "You cannot delete your own account" : "Delete account"} onClick={() => setDialog({ kind: "delete", account: record })}>Delete</button></div></td></tr>)}</tbody></table></div> : <Empty icon={section === "employees" ? Users : ShieldCheck} title={search ? "No matches this time" : section === "employees" ? "Your people will feel at home here" : "No accounts yet"} text={search ? "Try another name, email or employee code." : "Add the first record to start building your workspace."} action={!search ? actions : undefined} />}
            <div className="pp-pagination"><span>{records.total ? `${(records.page - 1) * records.pageSize + 1}–${Math.min(records.page * records.pageSize, records.total)} of ${records.total}` : "0 records"}</span><div><button className="pp-icon-button" aria-label="Previous page" disabled={page <= 1 || listLoading} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Page {page}</span><button className="pp-icon-button" aria-label="Next page" disabled={page * records.pageSize >= records.total || listLoading} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div></div>
          </section>}

          {["employees", "contracts", "schedules", "attendance", "leave", "payruns", "payslips", "structures", "rules"].includes(section) && <WorkspaceModule key={section} section={section} month={month} currency={currency} revision={revision} onChange={() => setRevision(value => value + 1)} />}
          {section === "users" && <WorkspaceModule section="roles" month={month} currency={currency} revision={revision} onChange={() => setRevision(value => value + 1)} />}
          {section === "settings" && <WorkspaceSettings onSaved={settingsSaved} />}
          {section === "reports" && <WorkspaceReports key={settings?.reportMonths || 6} month={month} currency={currency} revision={revision} defaultMonths={settings?.reportMonths || 6} />}
          {section === "activity" && <section className="pp-panel"><div className="pp-panel-heading"><div><h2>Recent workspace changes</h2><p>Latest 30 events across all reporting periods</p></div><span className="pp-icon-box pp-tone-green"><CheckCheck size={20} /></span></div><ActivityList events={data.activity} full /></section>}
        </>}
        <footer className="pp-workspace-footer"><span>PeoplePay360 <i>·</i> Your people. Your perspective.</span><span>{settings?.supportEmail && <a href={`mailto:${settings.supportEmail}`}>Contact support</a>}<ShieldCheck size={13} /> Administrator workspace</span></footer>
      </main>
    </div>
    {toast && <div className="pp-toast" role="status"><span><Check size={17} /></span>{toast}<button className="pp-icon-button" aria-label="Dismiss message" onClick={() => setToast("")}><X size={16} /></button></div>}
    {dialog?.kind === "delete" && <DeleteAccountDialog account={dialog.account} onClose={() => setDialog(null)} onSaved={message => { setPage(1); saved(message); }} />}
    {dialog && dialog.kind !== "delete" && <RecordDialog {...dialog} currentUserId={user.id} departments={data?.departments || []} onClose={() => setDialog(null)} onSaved={saved} />}
  </div>;
}
