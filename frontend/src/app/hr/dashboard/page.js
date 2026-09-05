"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, ArrowUpRight, Bell, CalendarDays, ChevronRight, Clock3, FileCheck2, LayoutDashboard, Leaf, LoaderCircle, LogOut, Menu, RefreshCw, ShieldCheck, Settings, Users, X } from "lucide-react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";
import Brand from "@/components/admin/brand";
import HrOperations from "@/components/admin/hr-operations";
import WorkspaceSettings from "@/components/admin/workspace-settings";
import WorkspaceModule from "@/components/admin/workspace-module";
import { ThemeToggle, useTheme } from "@/components/admin/theme-provider";
import { display, human } from "@/components/admin/workspace-config";
import { getCurrentUser, logoutUser } from "@/services/auth.service";
import { fetchHrDashboard, hrWorkspaceApi } from "@/services/hr.service";
import { errorMessage } from "@/services/admin.service";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
const navGroups = [
  ["HR MANAGER", [["overview", "Dashboard", LayoutDashboard]]],
  ["WORKFORCE", [["employees", "Employees", Users], ["departments", "Departments & designations", Users], ["contracts", "Contracts", FileCheck2]]],
  ["TIME & ATTENDANCE", [["attendance", "Attendance", Clock3], ["schedules", "Shifts & schedules", CalendarDays], ["leave", "Leave management", Leaf], ["holidays", "Holidays", CalendarDays]]],
  ["HR OPERATIONS", [["approvals", "Approvals", ShieldCheck], ["reviews", "Performance reviews", FileCheck2], ["review-cycles", "Review cycles", CalendarDays], ["documents", "Documents", FileCheck2]]],
  ["INSIGHTS", [["hr-reports", "Reports & analytics", Activity]]],
  ["ACCOUNT", [["notifications", "Notifications", Bell], ["profile", "My profile", Users], ["settings", "Settings", Settings]]],
];
const labels = { ...Object.fromEntries(navGroups.flatMap(([, items]) => items).map(([id, name]) => [id, name])), allocations: "Leave allocations", "leave-types": "Leave types", assignments: "Schedule assignments" };
const descriptions = { overview: "Your people, attendance and time off, together in one place.", employees: "Employee profiles, departments, designations and reporting lines.", departments: "Organize departments and job designations.", contracts: "Employment terms, wages, working schedules and contract history.", schedules: "Working days, shifts, breaks, holidays and dated assignments.", assignments: "Assign a working schedule to an employee for a defined period.", attendance: "Check-ins, check-outs, daily summaries and attendance corrections.", leave: "Requests, approvals, allocations, balances and leave types.", allocations: "Allocate leave and review balances and validity.", "leave-types": "Manage leave types and approval policies.", approvals: "Review pending leave requests and leave allocations.", reviews: "Goals, recorded self reviews, manager feedback and final ratings.", "review-cycles": "Plan review periods and assign employees and reviewers.", documents: "Employee document references and expiry dates.", holidays: "Holiday calendars by working schedule.", "hr-reports": "Attendance trends and workforce distribution.", notifications: "Live reminders for outstanding HR work.", profile: "Manage your personal account details.", settings: "Organization details and defaults for your HR workspace." };
const currentMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);
const initials = name => name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("");
const nameOf = employee => `${employee.firstName} ${employee.lastName}`;

export default function HrDashboardPage() {
  const router = useRouter(), { resolved } = useTheme();
  const [user, setUser] = useState(null), [data, setData] = useState(null), [lookups, setLookups] = useState({ employees: [] });
  const [section, setSection] = useState("overview"), [month, setMonth] = useState(currentMonth), [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [revision, setRevision] = useState(0), [mobileNav, setMobileNav] = useState(false), [signingOut, setSigningOut] = useState(false);
  const [navScrolling, setNavScrolling] = useState(false), navTimer = useRef(null);
  useEffect(() => () => clearTimeout(navTimer.current), []);
  const reportError = useCallback(e => { if (e.response?.status === 401) router.replace("/login"); else setError(errorMessage(e)); }, [router]);
  useEffect(() => {
    let active = true;
    getCurrentUser().then(({ user }) => { if (!active) return; if (!["HR_MANAGER", "ADMIN"].includes(user.role)) router.replace("/login"); else setUser(user); }).catch(reportError);
    return () => { active = false; };
  }, [router, reportError]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      Promise.all([fetchHrDashboard({ month }), hrWorkspaceApi.fetchWorkspace("lookups")]).then(([result, options]) => { if (active) { setData(result); setLookups(options); } }).catch(e => { if (active) reportError(e); }).finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user, month, revision, reportError]);
  function navigate(next, person = null) { setSection(next); setEmployee(person); setMobileNav(false); setError(""); }
  function refresh() { setRevision(v => v + 1); }
  async function signOut() { setSigningOut(true); try { await logoutUser(); router.replace("/login"); } catch (e) { reportError(e); setSigningOut(false); } }
  const activeSection = section === "assignments" ? "schedules" : section;
  const monthly = ["overview", "attendance", "leave", "hr-reports"].includes(section);
  if (!user) return <main className="pp-access-loading"><Brand href="/login" /><div className="pp-loading" role="status">{error || "Checking your HR workspace access…"}</div></main>;
  const metric = data?.metrics;
  const chartText = resolved === "dark" ? "#a9bfb1" : "#7b897e";
  return <div className="pp-dashboard pp-hr-dashboard">
    {mobileNav && <button className="pp-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`pp-sidebar ${mobileNav ? "pp-sidebar-open" : ""}`}>
      <div className="pp-sidebar-brand"><Brand light href="/hr/dashboard" /><button className="pp-icon-button pp-mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={20} /></button></div>
      <div className="pp-workspace-picker"><span className="pp-workspace-icon"><Leaf size={18} /></span><div><strong>{data?.organizationName || "Your organization"}</strong><small>HR Manager workspace</small></div><ShieldCheck size={16} /></div>
      <nav aria-label="HR Manager navigation" className={navScrolling ? "pp-nav-scrolling" : ""} onScroll={() => { setNavScrolling(true); clearTimeout(navTimer.current); navTimer.current = setTimeout(() => setNavScrolling(false), 900); }}>
        {navGroups.map(([group, items]) => <div key={group}><p className="pp-nav-label pp-nav-label-second">{group}</p>{items.map(([id, label, Icon]) => <button key={id} className={`pp-nav-item ${activeSection === id ? "pp-nav-active" : ""}`} aria-current={activeSection === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={19} strokeWidth={1.7} />{label}</button>)}</div>)}
      </nav>
      <div className="pp-sidebar-bottom"><div className="pp-sidebar-user"><span className="pp-avatar pp-avatar-light">{initials(user.name)}</span><div><strong>{user.name}</strong><small>HR Manager</small></div><button className="pp-icon-button" aria-label="Sign out" disabled={signingOut} onClick={signOut}>{signingOut ? <LoaderCircle className="pp-spin" size={17} /> : <LogOut size={17} />}</button></div></div>
    </aside>
    <div className="pp-workspace-main">
      <header className="pp-topbar">
        <div className="pp-topbar-location"><button className="pp-icon-button pp-mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={21} /></button><span className="pp-topbar-mark" aria-hidden="true"><LayoutDashboard size={21} /></span><div className="pp-topbar-location-text"><span className="pp-topbar-eyebrow">HR Manager workspace</span><nav className="pp-breadcrumb" aria-label="Breadcrumb"><button className="pp-breadcrumb-home" onClick={() => navigate("overview")}>Workspace</button><ChevronRight className="pp-breadcrumb-separator" size={13} /><strong aria-current="page" title={labels[section]}>{labels[section]}</strong></nav></div></div>
        <div className="pp-topbar-actions"><span className="pp-live-status"><span className="pp-dot" /> HR workspace</span><div className="pp-topbar-tools"><ThemeToggle /><button className="pp-icon-button pp-activity-button" title="HR notifications" aria-label="HR notifications" onClick={() => navigate("notifications")}><Bell size={19} /></button></div><span className="pp-topbar-divider" /><div className="pp-topbar-profile" title={user.email}><span className="pp-avatar">{initials(user.name)}</span><span className="pp-topbar-profile-text"><strong>{user.name}</strong><small>HR Manager</small></span></div></div>
      </header>
      <main className="pp-main-content">
        <div className="pp-page-heading"><div><p className="pp-eyebrow">{section === "overview" ? "THE PEOPLE PICTURE" : "YOUR HR WORKSPACE"}</p><h1>{section === "overview" ? "Workspace overview" : labels[section]}<span className="pp-heading-dot">.</span></h1><p>{descriptions[section]}</p></div>{section === "overview" && <button className="pp-button pp-button-primary" onClick={() => navigate("employees")}><Users size={17} />Manage employees</button>}</div>
        {error && <div className="pp-error" role="alert">{error}<button onClick={refresh}>Try again</button></div>}
        {!["settings", "profile", "notifications"].includes(section) && <div className="pp-filter-bar"><div className="pp-period-filter">{monthly ? <><CalendarDays size={16} /><label htmlFor="hr-month">Reporting month</label><input id="hr-month" type="month" min="2000-01" max="2099-12" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></> : <span>All records &amp; history</span>}</div><div className="pp-filter-right">{["contracts", "attendance", "leave", "allocations", "assignments"].includes(section) && <select aria-label="Filter by employee" value={employee?.id || ""} onChange={e => setEmployee(lookups.employees.find(p => p.id === Number(e.target.value)) || null)}><option value="">All employees</option>{lookups.employees.map(p => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}{employee && !lookups.employees.some(p => p.id === employee.id) && <option value={employee.id}>{nameOf(employee)}</option>}</select>}<button className="pp-icon-button" aria-label="Refresh HR dashboard" disabled={loading} onClick={refresh}><RefreshCw className={loading ? "pp-spin" : ""} size={17} /></button></div></div>}
        {employee && <div className="pp-hr-employee-filter"><Users size={16} /><span>Records for <strong>{nameOf(employee)}</strong></span><button className="pp-text-button" onClick={() => setEmployee(null)}>Show all employees <X size={14} /></button></div>}
        {["approvals", "holidays", "hr-reports", "notifications", "profile"].includes(section) ? <HrOperations key={`${section}:${month}`} section={section} month={month} onNavigate={navigate} onChange={refresh} onProfile={saved => setUser(previous => ({ ...previous, ...saved }))} /> : section === "settings" ? <WorkspaceSettings hr api={hrWorkspaceApi} onSaved={refresh} /> : section !== "overview" ? <WorkspaceModule key={`${section}:${employee?.id || "all"}`} section={section} month={month} revision={revision} onChange={refresh} hr api={hrWorkspaceApi} employeeId={employee?.id} onNavigate={navigate} /> : !data ? <div className="pp-loading" role="status"><LoaderCircle className="pp-spin" />Loading your HR overview…</div> : <>
          <section className="pp-metrics" aria-label="HR workspace metrics" aria-busy={loading}>{[
            { label: "Total employees", value: metric.employees.toLocaleString(), note: `${metric.activeEmployees} active employees`, Icon: Users, target: "employees", tone: "green" },
            { label: "Recorded attendance", value: metric.attendanceRate === null ? "—" : `${metric.attendanceRate}%`, note: `${metric.present} present · ${metric.absent} absent days`, Icon: Clock3, target: "attendance", tone: "blue" },
            { label: "Pending time off", value: metric.pendingLeave, note: "Requests awaiting a decision", Icon: CalendarDays, target: "leave", tone: "orange" },
            { label: "Active contracts", value: metric.activeContracts, note: "Active today, based on contract dates", Icon: FileCheck2, target: "contracts", tone: "violet" },
          ].map(({ label, value, note, Icon, target, tone }) => <article className="pp-metric" key={label}><div className="pp-metric-top"><span>{label}</span><span className={`pp-icon-box pp-tone-${tone}`}><Icon size={19} /></span></div><strong className="pp-kpi-value" key={value}>{value}</strong><p>{note}<button aria-label={`View ${labels[target].toLowerCase()}`} onClick={() => navigate(target)}><ArrowUpRight size={16} /></button></p></article>)}</section>
          <section className="pp-hr-summary" aria-label="Attendance summary">{[["Present today (recorded)", metric.presentToday], ["Absent today (recorded)", metric.absentToday], ["Late arrivals today", metric.lateToday], ["Joining in next 30 days", metric.upcomingJoining], ["Birthdays in next 30 days", metric.upcomingBirthdays], ["Employees on leave today", metric.employeesOnLeave], ["Present days", metric.present], ["Late days", metric.late], ["Absent days", metric.absent], ["Overtime hours", (metric.overtimeMinutes / 60).toFixed(1)], ["Missing checkout", metric.missingCheckout]].map(([label, value]) => <div className="pp-panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
          <section className="pp-overview-grid"><div className="pp-panel"><div className="pp-panel-heading"><div><h2>Attendance, day by day</h2><p>Present, absent and approved leave · {month}</p></div><Activity size={20} /></div><div className="pp-hr-chart"><Bar data={{ labels: data.trend.map(d => d.date.slice(-2)), datasets: [["present", "Present", "#699d80"], ["absent", "Absent", "#d99c87"], ["leave", "Time off", "#b9b278"]].map(([key, label, color]) => ({ label, data: data.trend.map(d => d[key]), backgroundColor: color, borderRadius: 3, maxBarThickness: 18 })) }} options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: "bottom", labels: { color: chartText, usePointStyle: true, boxWidth: 8 } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: chartText, maxTicksLimit: 12 } }, y: { stacked: true, beginAtZero: true, ticks: { color: chartText, precision: 0 }, grid: { color: resolved === "dark" ? "#34473c" : "#edf1eb" } } } }} role="img" aria-label="Daily recorded attendance. Open Attendance for detailed records." /></div><div className="pp-panel-footnote">Attendance rate = present ÷ (present + absent) recorded days. Refresh completed days in Attendance to fill scheduled absences.</div></div>
          <div className="pp-panel pp-team-panel"><div className="pp-panel-heading"><div><h2>A team that adds up</h2><p>Employees by department</p></div><Users size={20} /></div><div className="pp-department-list">{data.departments.length ? data.departments.map(d => <div className="pp-department-row" key={d.id}><div><span>{d.name}</span><strong>{d.employees}</strong></div><div className="pp-progress-track"><i style={{ width: `${d.employees / Math.max(metric.employees, 1) * 100}%`, background: "#699d80" }} /></div></div>) : <div className="pp-empty"><h3>Your team starts here</h3><p>Add departments and assign employees to see your team’s distribution.</p></div>}</div><button className="pp-panel-link" onClick={() => navigate("employees")}>Meet your people <ArrowRight size={16} /></button></div></section>
          <section className="pp-overview-grid pp-lower-grid"><div className="pp-panel"><div className="pp-panel-heading"><div><h2>Time off awaiting review</h2><p>Your team’s pending requests</p></div><button className="pp-text-button" onClick={() => navigate("leave")}>View requests <ArrowRight size={15} /></button></div>{data.leave.length ? <div className="pp-activity-list">{data.leave.map(l => <div className="pp-activity-item" key={l.id}><span className="pp-activity-icon"><Leaf size={17} /></span><div><strong>{nameOf(l.employee)}</strong><p>{l.leaveType.name} · {display(l.startDate)}–{display(l.endDate)}</p></div><span className="pp-badge pp-badge-amber">{l.status === "FIRST_APPROVED" ? "Second approval" : "Pending"}</span></div>)}</div> : <div className="pp-empty"><h3>You’re all caught up</h3><p>No pending time-off requests for this month.</p></div>}</div>
          <div className="pp-panel"><div className="pp-panel-heading"><div><h2>Recent attendance</h2><p>Latest recorded employee days</p></div><button className="pp-text-button" onClick={() => navigate("attendance")}>View attendance <ArrowRight size={15} /></button></div>{data.attendance.length ? <div className="pp-activity-list">{data.attendance.map(d => <div className="pp-activity-item" key={d.id}><span className="pp-activity-icon"><Clock3 size={17} /></span><div><strong>{nameOf(d.employee)}</strong><p>{display(d.workDate)} · {(d.workedMinutes / 60).toFixed(1)} hours</p></div><span className="pp-badge pp-badge-neutral">{human(d.status)}</span></div>)}</div> : <div className="pp-empty"><h3>Ready for the first check-in</h3><p>Record attendance to see your team’s working hours.</p></div>}</div></section>
        </>}
        <footer className="pp-workspace-footer"><span>PeoplePay360 · Your people. Your perspective.</span><span>{lookups.settings?.supportEmail ? <a href={`mailto:${lookups.settings.supportEmail}`}>Contact HR support</a> : "HR Manager workspace"}</span></footer>
      </main>
    </div>
  </div>;
}
