"use client";

import { useEffect, useRef, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import { Activity, Download, RefreshCw, Wallet, Users, CalendarDays, BarChart3, TrendingUp } from "lucide-react";
import { fetchWorkspace, exportWorkspaceReport, errorMessage } from "@/services/admin.service";
import { useTheme } from "./theme-provider";
import WorkspaceModule from "./workspace-module";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);
const colors = ["#36785d", "#8eacd4", "#d5aa61", "#af9ac8", "#92bca1"];
const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const monthLabel = key => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
const lightOptions = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 22, color: "#617267", font: { size: 12 } } }, tooltip: { backgroundColor: "#203b32", padding: 12, cornerRadius: 8 } }, scales: { x: { grid: { display: false }, ticks: { color: "#7b897e", maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, border: { display: false }, grid: { color: "#edf1eb" }, ticks: { color: "#7b897e", maxTicksLimit: 6 } } } };

function Plot({ title, subtitle, children, empty, toolbar, table, chartRef, filename }) {
  function saveImage() {
    if (!chartRef?.current) return;
    const a = document.createElement("a"); a.href = chartRef.current.toBase64Image(); a.download = filename; a.click();
  }
  return <section className="pp-panel pp-report-plot"><div className="pp-panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><div className="pp-plot-controls">{toolbar}<button className="pp-icon-button" aria-label={`Download ${title} chart`} title="Download chart as PNG" onClick={saveImage} disabled={!!empty}><Download size={16} /></button></div></div><div className="pp-report-canvas">{children}{empty && <div className="pp-report-no-data"><BarChart3 size={26} /><strong>{empty}</strong><span>Try another period or add records to your workspace.</span></div>}</div><details className="pp-chart-data"><summary>View chart data</summary>{table}</details></section>;
}
function DataTable({ columns, rows, label }) {
  return <div className="pp-table-scroll"><table className="pp-table"><caption className="pp-sr-only">{label}</caption><thead><tr>{columns.map(([key, name]) => <th key={key} scope="col">{name}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i}>{columns.map(([key]) => <td key={key}>{typeof row[key] === "number" || /^-?\d+(\.\d+)?$/.test(String(row[key])) ? number(row[key]) : row[key]}</td>)}</tr>) : <tr><td colSpan={columns.length}>No records for this selection.</td></tr>}</tbody></table></div>;
}

export default function WorkspaceReports({ month, currency, revision, defaultMonths = 6 }) {
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  const chartText = dark ? "#a9bfb1" : "#7b897e";
  const baseOptions = { ...lightOptions, plugins: { ...lightOptions.plugins, legend: { ...lightOptions.plugins.legend, labels: { ...lightOptions.plugins.legend.labels, color: chartText } } }, scales: { x: { ...lightOptions.scales.x, ticks: { ...lightOptions.scales.x.ticks, color: chartText } }, y: { ...lightOptions.scales.y, grid: { color: dark ? "#30423a" : "#edf1eb" }, ticks: { ...lightOptions.scales.y.ticks, color: chartText } } } };
  const [department, setDepartment] = useState(""), [trendMonths, setTrendMonths] = useState(defaultMonths), [view, setView] = useState("all"), [payrollMode, setPayrollMode] = useState("line"), [leaveUnit, setLeaveUnit] = useState("days");
  const [state, setState] = useState({ report: null, loading: true, error: "" }), [refresh, setRefresh] = useState(0), [exporting, setExporting] = useState(false);
  const payrollRef = useRef(null), departmentRef = useRef(null), attendanceRef = useRef(null), leaveRef = useRef(null);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setState({ report: null, loading: true, error: "" });
      fetchWorkspace("reports", { month, currency, trendMonths, ...(department ? { departmentId: department } : {}) }).then(report => { if (active) setState({ report, loading: false, error: "" }); }).catch(e => { if (active) setState({ report: null, loading: false, error: errorMessage(e) }); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [month, currency, department, trendMonths, revision, refresh]);
  const { report, loading, error } = state;
  const matches = report?.month === month && report?.currency === currency && report?.departmentId === (department ? Number(department) : null) && report?.trendMonths === Number(trendMonths);
  async function exportReport() {
    setExporting(true);
    try { const blob = await exportWorkspaceReport({ month, currency, trendMonths, ...(department ? { departmentId: department } : {}) }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `peoplepay360-${month}-${currency}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e) { setState(s => ({ ...s, error: errorMessage(e) })); } finally { setExporting(false); }
  }
  const money = value => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));
  const moneyOptions = { ...baseOptions, scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, title: { display: true, text: currency, color: chartText }, ticks: { ...baseOptions.scales.y.ticks, callback: value => new Intl.NumberFormat("en", { notation: "compact" }).format(value) } } }, plugins: { ...baseOptions.plugins, tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: context => `${context.dataset.label}: ${money(context.parsed.y)}` } } } };
  const totals = report?.totals;
  const payrollData = { labels: report?.payrollTrend.map(p => monthLabel(p.month)) || [], datasets: [["gross", "Gross salary", colors[1]], ["net", "Net salary", colors[0]], ["cost", "Employer cost", colors[2]]].map(([key, label, color]) => ({ label, data: report?.payrollTrend.map(p => Number(p[key])) || [], borderColor: color, backgroundColor: payrollMode === "bar" ? color : `${color}18`, borderWidth: payrollMode === "bar" ? 0 : 2.5, pointRadius: 3, pointHoverRadius: 6, tension: 0.3, fill: key === "net" && payrollMode === "line", borderRadius: 5 })) };
  const attendanceData = { labels: report?.attendanceTrend.map(d => d.date.slice(-2)) || [], datasets: [["present", "Present", colors[0]], ["absent", "Absent", "#d99786"], ["leave", "Time off", colors[2]]].map(([key, label, color]) => ({ label, data: report?.attendanceTrend.map(d => d[key]) || [], backgroundColor: color, borderRadius: 3, maxBarThickness: 16 })) };
  const departmentRows = report?.departments.slice(0, 10) || [];
  return <div className="pp-reports-page"><section className="pp-report-toolbar"><div><span className="pp-eyebrow">WORKSPACE ANALYTICS</span><p>Turn your people and payroll records into a clear picture.</p></div><div className="pp-report-filters"><label>Department<select aria-label="Report department" value={department} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{report?.departmentOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}{department && !report?.departmentOptions.some(d => String(d.id) === department) && <option value={department}>Selected department</option>}</select></label><label>Trend range<select aria-label="Report trend range" value={trendMonths} onChange={e => setTrendMonths(+e.target.value)}>{[3, 6, 12].map(n => <option key={n} value={n}>Last {n} months</option>)}</select></label><button className="pp-button pp-button-outline" onClick={() => setRefresh(v => v + 1)} disabled={loading} aria-label="Refresh reports"><RefreshCw size={16} /></button><button className="pp-button pp-button-primary" onClick={exportReport} disabled={loading || !matches || exporting}><Download size={16} />{exporting ? "Exporting…" : "Export report"}</button></div></section>
    <div className="pp-report-view-tabs" role="group" aria-label="Report sections">{[["all", "All insights"], ["payroll", "Payroll"], ["people", "Attendance & time off"], ["audit", "Audit history"]].map(([key, label]) => <button key={key} aria-pressed={view === key} className={view === key ? "pp-selected" : ""} onClick={() => setView(key)}>{label}</button>)}</div>
    {error && <div className="pp-error" role="alert">{error}<button className="pp-text-button" onClick={() => setRefresh(v => v + 1)}>Retry</button></div>}
    {view === "audit" ? <WorkspaceModule section="activity" month={month} currency={currency} revision={revision} /> : error && !report ? <div className="pp-empty"><h3>Reports could not be loaded</h3><p>Use Retry above to fetch the latest data.</p></div> : loading || !matches ? <div className="pp-report-loading" role="status"><RefreshCw className="pp-spin" size={24} /><strong>Preparing your reports…</strong></div> : <>
      <section className="pp-report-kpis" aria-label="Report summary">{[
        { label: "Net payroll", value: money(totals.net), note: `${totals.finalizedPayslips} finalized payslips`, icon: Wallet, className: "pp-kpi-featured" },
        { label: "Employer cost", value: money(totals.employerCost), note: `Gross salary ${money(totals.gross)}`, icon: TrendingUp },
        { label: "Recorded attendance", value: totals.recordedAttendanceRate == null ? "—" : `${totals.recordedAttendanceRate}%`, note: `${totals.recordedDays} recorded employee days`, icon: Activity },
        { label: "Approved time off", value: `${number(totals.approvedLeaveDays)} days`, note: `${totals.currentEmployees} current employees`, icon: CalendarDays },
      ].map(({ label, value, note, icon: Icon, className }) => <article className={`pp-report-kpi ${className || ""}`} key={label}><div><span>{label}</span><Icon size={19} /></div><strong>{value}</strong><p>{note}</p></article>)}</section>
      <div className="pp-report-charts">
      {["all", "payroll"].includes(view) && <><Plot title="Payroll over time" subtitle={`Finalized salary by payroll start month · ${currency}`} chartRef={payrollRef} filename={`payroll-trend-${month}.png`} empty={!report.payrollTrend.some(p => p.payslips) && "No finalized payroll in this range"} toolbar={<div className="pp-plot-switch" role="group" aria-label="Payroll chart type">{[["line", "Line"], ["bar", "Bar"]].map(([key, label]) => <button key={key} aria-pressed={payrollMode === key} onClick={() => setPayrollMode(key)}>{label}</button>)}</div>} table={<DataTable label="Payroll trend data" columns={[["month", "Month"], ["payslips", "Payslips"], ["gross", `Gross (${currency})`], ["net", `Net (${currency})`], ["cost", `Cost (${currency})`]]} rows={report.payrollTrend} />}>
        {payrollMode === "line" ? <Line key="line" ref={payrollRef} data={payrollData} options={moneyOptions} role="img" aria-label="Monthly gross salary, net salary and employer cost line plot. Values available in View chart data." /> : <Bar key="bar" ref={payrollRef} data={payrollData} options={moneyOptions} role="img" aria-label="Monthly payroll grouped bar chart. Values available in View chart data." />}
      </Plot><Plot title="Cost by department" subtitle={`Top 10 departments by employer cost · ${currency}`} chartRef={departmentRef} filename={`department-cost-${month}.png`} empty={!departmentRows.length && "No department payroll to compare"} table={<DataTable label="Department payroll data" columns={[["department", "Department"], ["payslips", "Payslips"], ["net", `Net (${currency})`], ["cost", `Cost (${currency})`]]} rows={report.departments} />}>
        <Bar ref={departmentRef} data={{ labels: departmentRows.map(d => d.department), datasets: [{ label: "Employer cost", data: departmentRows.map(d => Number(d.cost)), backgroundColor: colors[0], borderRadius: 5, maxBarThickness: 28 }, { label: "Net salary", data: departmentRows.map(d => Number(d.net)), backgroundColor: "#bad2c2", borderRadius: 5, maxBarThickness: 28 }] }} options={{ ...baseOptions, indexAxis: "y", scales: { x: { ...baseOptions.scales.y, title: { display: true, text: currency } }, y: { ...baseOptions.scales.x, ticks: { color: chartText, callback: function(value) { const label = this.getLabelForValue(value); return label.length > 18 ? `${label.slice(0, 16)}…` : label; } } } } }} role="img" aria-label="Department employer cost and net salary horizontal bar chart. Values available in View chart data." />
      </Plot></>}
      {["all", "people"].includes(view) && <><Plot title="Daily attendance" subtitle={`${monthLabel(month)} · recorded employee days`} chartRef={attendanceRef} filename={`attendance-${month}.png`} empty={!totals.recordedDays && "No attendance recorded this month"} table={<DataTable label="Daily attendance data" columns={[["date", "Date"], ["present", "Present"], ["absent", "Absent"], ["leave", "On leave"], ["workedHours", "Worked hours"]]} rows={report.attendanceTrend} />}>
        <Bar ref={attendanceRef} data={attendanceData} options={{ ...baseOptions, scales: { x: { ...baseOptions.scales.x, stacked: true, title: { display: true, text: "Day of month", color: chartText } }, y: { ...baseOptions.scales.y, stacked: true, ticks: { ...baseOptions.scales.y.ticks, precision: 0 }, title: { display: true, text: "Employee days", color: chartText } } } }} role="img" aria-label="Daily present, absent and time-off stacked bar chart. Values available in View chart data." />
      </Plot><Plot title="Time-off distribution" subtitle={`Approved time off by type · ${leaveUnit}`} chartRef={leaveRef} filename={`time-off-${month}.png`} empty={!report.leave.length && "No approved time off this month"} toolbar={<select aria-label="Time-off chart unit" value={leaveUnit} onChange={e => setLeaveUnit(e.target.value)}><option value="days">Days</option><option value="hours">Hours</option></select>} table={<DataTable label="Approved time-off data" columns={[["type", "Type"], ["days", "Days"], ["hours", "Hours"]]} rows={report.leave} />}>
        <Doughnut ref={leaveRef} data={{ labels: report.leave.map(l => l.type), datasets: [{ data: report.leave.map(l => Number(l[leaveUnit])), backgroundColor: report.leave.map((_, i) => colors[i % colors.length]), borderWidth: 4, borderColor: dark ? "#1b2923" : "#fff", hoverOffset: 6 }] }} options={{ responsive: true, maintainAspectRatio: false, animation: false, cutout: "72%", plugins: baseOptions.plugins }} role="img" aria-label={`Approved time off by type in ${leaveUnit}. Values available in View chart data.`} />
      </Plot></>}
      </div><section className="pp-report-bottom"><div><Users size={20} /><span>Average net salary<strong>{money(totals.averageNetPerPayslip)}</strong><small>Per finalized payslip</small></span></div><div><Wallet size={20} /><span>Recorded payments<strong>{money(totals.paymentsRecorded)}</strong><small>Successful payments this month</small></span></div><div><Activity size={20} /><span>Worked hours<strong>{number(totals.workedHours)} h</strong><small>{number(totals.overtimeHours)} overtime hours</small></span></div></section><p className="pp-report-method">Payroll is grouped by period start month and historical contract department. Attendance and time off use the employee’s current department. Attendance rate = present ÷ (present + absent) recorded days. Payment dates use UTC. Updated {new Date(report.generatedAt).toLocaleTimeString()}.</p>
    </>}
  </div>;
}
