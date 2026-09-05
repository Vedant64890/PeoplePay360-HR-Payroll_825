"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { Activity, ArrowUpRight, CalendarDays, ChevronRight, Clock3, FileCheck2, LayoutDashboard, Leaf, LoaderCircle, LogOut, Menu, RefreshCw, ShieldCheck, Users, Wallet, X, Download } from "lucide-react";
import Brand from "@/components/admin/brand";
import WorkspaceModule from "@/components/admin/workspace-module";
import { ThemeToggle, useTheme } from "@/components/admin/theme-provider";
import { getCurrentUser, logoutUser } from "@/services/auth.service";
import { fetchPayrollDashboard, payrollApi, savePayrollProfile } from "@/services/payroll.service";
import { errorMessage } from "@/services/admin.service";
import { human, display } from "@/components/admin/workspace-config";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend);
const groups = [
  ["PAYROLL WORKSPACE", [["overview", "Dashboard", LayoutDashboard]]],
  ["PEOPLE", [["employees", "Employees", Users], ["contracts", "Contracts", FileCheck2], ["schedules", "Working schedules", CalendarDays], ["attendance", "Attendance", Clock3]]],
  ["TIME OFF", [["leave", "Requests", Leaf], ["allocations", "Allocations", CalendarDays], ["leave-types", "Time off types", ShieldCheck]]],
  ["PAYROLL", [["payruns", "Payruns", Wallet], ["payslips", "Payslips", FileCheck2]]],
  ["PAYROLL CONFIGURATION", [["structures", "Salary structures", LayoutDashboard], ["rules", "Salary rules", Activity]]],
  ["INSIGHTS & ACCOUNT", [["reports", "Reports & analytics", Activity], ["profile", "My profile", Users]]],
];
const labels = Object.fromEntries(groups.flatMap(([, items]) => items).map(([id, label]) => [id, label]));
const currentMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);

export default function PayrollDashboard() {
  const router = useRouter(), { resolved } = useTheme();
  const [user, setUser] = useState(null), [section, setSection] = useState("overview"), [month, setMonth] = useState(currentMonth), [currency, setCurrency] = useState("INR"), [department, setDepartment] = useState(""), [employeeType, setEmployeeType] = useState("");
  const [data, setData] = useState(null), [lookups, setLookups] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0), [mobile, setMobile] = useState(false), [busy, setBusy] = useState(false), [profileName, setProfileName] = useState("");
  const [employee, setEmployee] = useState(null), [scrolling, setScrolling] = useState(false), timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    let active = true;
    getCurrentUser().then(({ user }) => { if (!active) return; if (!["ADMIN", "HR_PAYROLL_MANAGER", "HR_PAYROLL_USER"].includes(user.role)) { router.replace("/login"); return; } setUser(user); setProfileName(user.name); }).catch(e => { if (active) { setError(errorMessage(e)); if (e.response?.status === 401) router.replace("/login"); } });
    return () => { active = false; };
  }, [router]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const task = setTimeout(() => {
      setLoading(true); setError("");
      Promise.all([fetchPayrollDashboard({ month, currency, ...(department ? { departmentId: department } : {}), ...(employeeType ? { employeeType } : {}) }), payrollApi.fetchWorkspace("lookups")]).then(([result, options]) => { if (active) { setData(result); setLookups(options); } }).catch(e => { if (active) { setError(errorMessage(e)); if (e.response?.status === 401) router.replace("/login"); } }).finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(task); };
  }, [user, month, currency, department, employeeType, revision, router]);
  const refresh = () => setRevision(v => v + 1);
  function navigate(next, person = null) { setSection(next); setEmployee(person); setMobile(false); setError(""); }
  async function exportReport() {
    setBusy(true); try { const blob = await payrollApi.exportReport({ month, currency, ...(department ? { departmentId: department } : {}), ...(employeeType ? { employeeType } : {}) }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `payroll-${month}-${currency}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  if (!user) return <main className="pp-access-loading"><Brand href="/login" /><p role="status">{error || "Checking payroll workspace access…"}</p></main>;
  const role = user.role === "HR_PAYROLL_USER" ? "HR Payroll User" : "HR Payroll Manager";
  const initials = user.name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("");
  const money = value => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
  const analytical = ["overview", "reports"].includes(section);
  const textColor = resolved === "dark" ? "#b7cabc" : "#546c5d";
  const options = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: textColor, usePointStyle: true } } }, scales: { x: { ticks: { color: textColor } }, y: { beginAtZero: true, ticks: { color: textColor } } } };
  const metrics = data?.metrics;
  const cards = metrics ? [
    ["Total payroll", money(metrics.totalPayroll), "Computed net salary", Wallet, "payruns", "green"],
    ["Employees paid", metrics.employeesPaid, `${money(metrics.totalPaid)} recorded payments`, Users, "payslips", "blue"],
    ["Pending payroll", money(metrics.pendingPayroll), `${metrics.pendingPayslips} unpaid or draft payslips`, Clock3, "payruns", "orange"],
    ["Current payroll cycle", month, `${metrics.currentCycles} open payruns`, CalendarDays, "payruns", "violet"],
    ["Total deductions", money(metrics.totalDeductions), "Computed payslip deductions", FileCheck2, "payslips", "orange"],
    ["Total bonuses", money(metrics.totalBonuses), "Earning rules with BONUS in the code", Wallet, "rules", "green"],
    ["Payslips generated", metrics.payslipsGenerated, "For the selected payroll period", FileCheck2, "payslips", "blue"],
    ["Average net salary", money(metrics.averageSalary), "Per computed payslip", Activity, "reports", "violet"],
  ] : [];
  return <div className="pp-dashboard pp-hr-dashboard">
    {mobile && <button className="pp-nav-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside className={`pp-sidebar ${mobile ? "pp-sidebar-open" : ""}`}>
      <div className="pp-sidebar-brand"><Brand light href="/payroll/dashboard" /><button className="pp-icon-button pp-mobile-close" aria-label="Close navigation" onClick={() => setMobile(false)}><X /></button></div>
      <div className="pp-workspace-picker"><Wallet size={20} /><div><strong>{lookups?.settings.organizationName || "Your organization"}</strong><small>{role}</small></div></div>
      <nav aria-label="Payroll navigation" className={scrolling ? "pp-nav-scrolling" : ""} onScroll={() => { setScrolling(true); clearTimeout(timer.current); timer.current = setTimeout(() => setScrolling(false), 900); }}>{groups.map(([group, items]) => <div key={group}><p className="pp-nav-label pp-nav-label-second">{group}</p>{items.map(([id, label, Icon]) => <button key={id} className={`pp-nav-item ${section === id ? "pp-nav-active" : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={19} />{label}</button>)}</div>)}</nav>
      <div className="pp-sidebar-bottom"><div className="pp-sidebar-user"><span className="pp-avatar">{initials}</span><div><strong>{user.name}</strong><small>{role}</small></div><button aria-label="Sign out" disabled={busy} className="pp-icon-button" onClick={async () => { setBusy(true); try { await logoutUser(); router.replace("/login"); } catch (e) { setError(errorMessage(e)); setBusy(false); } }}><LogOut size={18} /></button></div></div>
    </aside>
    <div className="pp-workspace-main"><header className="pp-topbar"><div className="pp-topbar-location"><button className="pp-icon-button pp-mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu /></button><span className="pp-topbar-mark"><Wallet /></span><div className="pp-topbar-location-text"><span className="pp-topbar-eyebrow">{role}</span><nav className="pp-breadcrumb" aria-label="Breadcrumb"><button className="pp-breadcrumb-home" onClick={() => navigate("overview")}>Workspace</button><ChevronRight size={15} /><strong>{labels[section] || "Schedule assignments"}</strong></nav></div></div><div className="pp-topbar-actions"><span className="pp-live-status"><span className="pp-dot" />Live payroll</span><ThemeToggle /><button className="pp-icon-button" title="My profile" onClick={() => navigate("profile")}><span className="pp-avatar">{initials}</span></button></div></header>
      <main className="pp-main-content"><div className="pp-page-heading"><div><p className="pp-eyebrow">PEOPLE, PAYROLL & PROGRESS</p><h1>{section === "overview" ? "Payroll overview" : labels[section] || "Schedule assignments"}<span className="pp-heading-dot">.</span></h1><p>{analytical ? "Monitor payroll, attendance, leave and workforce costs." : "Manage connected HR and payroll records."}</p></div>{analytical && <button className="pp-button pp-button-primary" onClick={() => navigate("payruns")}>Create payrun <ArrowUpRight size={18} /></button>}</div>
        {error && <div className="pp-error" role="alert">{error}<button onClick={refresh}>Retry</button></div>}
        {section !== "profile" && <div className="pp-filter-bar"><div className="pp-period-filter"><CalendarDays size={18} /><label htmlFor="payroll-month">Period</label><input id="payroll-month" type="month" min="2000-01" max="2099-12" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></div><div className="pp-report-filters">{analytical && <><label>Department<select value={department} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{lookups?.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Employee type<select value={employeeType} onChange={e => setEmployeeType(e.target.value)}><option value="">All types</option>{["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "TEMPORARY"].map(t => <option key={t} value={t}>{human(t)}</option>)}</select></label></>}<label>Currency<select value={currency} onChange={e => setCurrency(e.target.value)}>{["INR", "USD", "EUR", "GBP", "AED", "SGD"].map(c => <option key={c}>{c}</option>)}</select></label><button className="pp-icon-button" aria-label="Refresh payroll" disabled={loading} onClick={refresh}><RefreshCw size={18} className={loading ? "pp-spin" : ""} /></button></div></div>}
        {section === "profile" ? <form className="pp-panel pp-settings-section pp-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const saved = await savePayrollProfile({ name: profileName }); setUser(saved); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}><h2>My profile</h2><label htmlFor="payroll-profile-name">Full name</label><input id="payroll-profile-name" value={profileName} onChange={e => setProfileName(e.target.value)} required maxLength={150} /><p>{user.email} · {role}</p><div className="pp-dialog-actions"><a href="/forgot-password" className="pp-button pp-button-outline">Reset password</a><button disabled={busy || user.name === profileName} className="pp-button pp-button-primary">Save profile</button></div></form> : !analytical ? <WorkspaceModule key={`${section}:${employee?.id || "all"}`} section={section} month={month} currency={currency} revision={revision} onChange={refresh} hr payroll readOnlyConfig={user.role === "HR_PAYROLL_USER"} api={payrollApi} employeeId={employee?.id} onNavigate={navigate} /> : loading ? <div className="pp-loading" role="status"><LoaderCircle className="pp-spin" />Updating payroll insights…</div> : data && <>
          <section className="pp-metrics pp-payroll-metrics" aria-label="Payroll key performance indicators" aria-busy={loading}>{cards.map(([label, value, note, Icon, target, tone], idx) => <article className="pp-metric" key={label} style={{ "--pp-kpi-order": idx }}><div className="pp-metric-top"><span>{label}</span><span className={`pp-icon-box pp-tone-${tone}`}><Icon size={20} /></span></div><strong className="pp-kpi-value" key={value}>{value}</strong><p>{note}<button aria-label={`View ${label.toLowerCase()}`} onClick={() => navigate(target)}><ArrowUpRight size={16} /></button></p></article>)}</section>
          <section className="pp-hr-summary" aria-label="Payroll status">{data.statuses.map(s => <div className="pp-panel" key={s.status}><span>{human(s.status)}</span><strong>{s.count}</strong></div>)}</section>
          <section className="pp-overview-grid"><article className="pp-panel"><div className="pp-panel-heading"><div><h2>Salary cost by department</h2><p>Finalized payroll · {currency}</p></div></div><div className="pp-hr-chart"><Bar options={options} data={{ labels: data.departments.map(d => d.department), datasets: [{ label: "Employer cost", data: data.departments.map(d => Number(d.cost)), backgroundColor: "#699d80", borderRadius: 6 }] }} /></div>{!data.departments.length && <p className="pp-panel-footnote">No finalized payroll for this selection.</p>}</article><article className="pp-panel"><div className="pp-panel-heading"><div><h2>Monthly net salary trend</h2><p>Finalized payslips by period start</p></div></div><div className="pp-hr-chart"><Line options={options} data={{ labels: data.payrollTrend.map(r => r.month), datasets: [{ label: `Net salary (${currency})`, data: data.payrollTrend.map(r => Number(r.net)), borderColor: "#8eacd4", backgroundColor: "#8eacd4", tension: .3, pointRadius: 4 }] }} /></div></article></section>
          <section className="pp-overview-grid pp-lower-grid"><article className="pp-panel pp-settings-section"><h2>Attendance & time off</h2><div className="pp-detail-grid"><div><span>Attendance health</span><strong>{data.totals.recordedAttendanceRate == null ? "Not recorded" : `${data.totals.recordedAttendanceRate}%`}</strong></div><div><span>Approved leave days</span><strong>{Number(data.totals.approvedLeaveDays)}</strong></div><div><span>Overtime hours</span><strong>{Number(data.totals.overtimeHours).toFixed(1)}</strong></div><div><span>Missing checkouts</span><strong>{metrics.missingCheckout}</strong></div></div><button className="pp-text-button" onClick={() => navigate("attendance")}>Manage attendance <ArrowUpRight size={16} /></button></article><article className="pp-panel pp-settings-section"><h2>Payroll attention required</h2>{data.warnings.length ? data.warnings.map(w => <p key={w.id}><span className="pp-badge pp-badge-amber">{human(w.severity)}</span> {w.message}</p>) : <p>No open payroll warnings for this selection.</p>}<button className="pp-text-button" onClick={() => navigate("payruns")}>Review payruns <ArrowUpRight size={16} /></button></article></section>
          <section className="pp-panel"><div className="pp-panel-heading"><div><h2>Recent payruns</h2><p>Batch status for the selected period</p></div><button className="pp-button pp-button-outline" onClick={exportReport} disabled={busy}><Download size={16} />Export report</button></div><div className="pp-table-scroll"><table className="pp-table"><thead><tr><th>Payrun</th><th>Period</th><th>Employees in batch</th><th>Status</th></tr></thead><tbody>{data.recentRuns.map(r => <tr key={r.id}><td><button className="pp-text-button" onClick={() => navigate("payruns")}>{r.name}</button></td><td>{display(r.period.startDate)} – {display(r.period.endDate)}</td><td>{r._count.employees}</td><td>{human(r.status)}</td></tr>)}</tbody></table>{!data.recentRuns.length && <p className="pp-empty">No payruns for this selection. Create a payrun to get started.</p>}</div></section>
          <details className="pp-panel pp-settings-section"><summary>View payroll chart data</summary><div className="pp-table-scroll"><table className="pp-table"><thead><tr><th>Month</th><th>Net salary</th><th>Deductions</th></tr></thead><tbody>{data.payrollTrend.map(r => <tr key={r.month}><td>{r.month}</td><td>{money(r.net)}</td><td>{money(r.deductions)}</td></tr>)}</tbody></table></div></details>
          <p className="pp-field-note">Dashboard payroll totals include computed and finalized payslips, grouped by period start. Pending amounts exclude uncomputed drafts. Charts and exports use finalized payroll. Payments are recorded transactions, not bank transfers initiated by this application.</p>
        </>}
        <footer className="pp-workspace-footer"><span>PeoplePay360 · People. Payroll. Progress.</span><span>{role}</span></footer>
      </main>
    </div>
  </div>;
}
