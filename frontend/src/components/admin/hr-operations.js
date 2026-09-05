"use client";
import { useEffect, useState } from "react";
import { Bar } from "react-chartjs-2";
import { hrWorkspaceApi, fetchHrProfile, saveHrProfile } from "@/services/hr.service";
import { errorMessage } from "@/services/admin.service";
import { display, human } from "./workspace-config";
import { useTheme } from "./theme-provider";

export default function HrOperations({ section, month, onNavigate, onChange, onProfile }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0), [page, setPage] = useState(1), [queue, setQueue] = useState("leave"), [stage, setStage] = useState("SUBMITTED");
  const [busy, setBusy] = useState(false), [name, setName] = useState(""), [decision, setDecision] = useState(null), [reason, setReason] = useState("");
  const { resolved } = useTheme();
  useEffect(() => {
    let active = true;
    const resource = section === "approvals" ? queue : section;
    const request = section === "profile" ? fetchHrProfile() : hrWorkspaceApi.fetchWorkspace(resource, { ...(section === "hr-reports" ? { month } : {}), page, ...(section === "approvals" ? { status: stage } : {}) });
    request.then(result => { if (active) { setData(result); if (section === "profile") setName(result.name); setError(""); } }).catch(e => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [section, month, page, queue, stage, revision]);
  function reload() { setRevision(v => v + 1); onChange?.(); }
  async function decide(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await hrWorkspaceApi.workspaceAction(queue, decision.id, { action: decision.action, reason }); setNotice(`Request ${decision.action === "approve" ? "approved" : "refused"}.`); setDecision(null); setReason(""); reload(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const color = resolved === "dark" ? "#b6cbbb" : "#536d42";
  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color } } }, scales: { x: { ticks: { color } }, y: { beginAtZero: true, ticks: { color, precision: 0 } } } };
  return <div className="pp-workspace-module">
    {error && <div className="pp-error" role="alert">{error}<button className="pp-text-button" onClick={reload}>Retry</button></div>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Loading…</p>}
    {section === "profile" && data && <form className="pp-panel pp-settings-section pp-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const saved = await saveHrProfile({ name }); setData(saved); onProfile?.(saved); setNotice("Profile saved."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>
      <h2>My profile</h2><label htmlFor="hr-profile-name">Full name</label><input id="hr-profile-name" required maxLength={150} value={name} onChange={e => setName(e.target.value)} />
      <div className="pp-detail-grid"><div><span>Email</span><strong>{data.email}</strong></div><div><span>Role</span><strong>{human(data.role)}</strong></div></div>
      <p className="pp-field-note">Contact your administrator to change account access or your sign-in email.</p><div className="pp-dialog-actions"><a className="pp-button pp-button-outline" href="/forgot-password">Reset password</a><button disabled={busy || name === data.name} className="pp-button pp-button-primary">{busy ? "Saving…" : "Save profile"}</button></div>
    </form>}
    {section === "notifications" && data && <section className="pp-panel pp-settings-section"><h2>HR action reminders</h2><p>Live counts from your HR records.</p>{data.map(item => <div className="pp-panel-heading" key={item.target + item.name}><span>{item.name}</span><button className="pp-text-button" onClick={() => onNavigate(item.target)}>{item.count} · View</button></div>)}</section>}
    {section === "approvals" && <>
      <div className="pp-module-tabs"><button className={queue === "leave" ? "pp-tab-active" : ""} onClick={() => { setQueue("leave"); setPage(1); setData(null); setDecision(null); }}>Leave requests</button><button className={queue === "allocations" ? "pp-tab-active" : ""} onClick={() => { setQueue("allocations"); setStage("SUBMITTED"); setPage(1); setData(null); setDecision(null); }}>Leave allocations</button></div>
      {queue === "leave" && <label>Approval stage <select value={stage} onChange={e => { setStage(e.target.value); setPage(1); setData(null); setDecision(null); }}><option value="SUBMITTED">Pending first approval</option><option value="FIRST_APPROVED">Pending second approval</option></select></label>}
      {decision && <form className="pp-panel pp-settings-section pp-form" onSubmit={decide}><h3>{human(decision.action)} {decision.reference}</h3><label htmlFor="approval-reason">Decision reason</label><input id="approval-reason" required={decision.action === "refuse"} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /><div className="pp-dialog-actions"><button type="button" disabled={busy} className="pp-button pp-button-outline" onClick={() => setDecision(null)}>Cancel</button><button disabled={busy} className="pp-button pp-button-primary">Confirm {decision.action}</button></div></form>}
      {data && <div className="pp-panel pp-table-scroll"><table className="pp-table"><thead><tr><th>Employee</th><th>Leave type</th><th>Dates / allocation</th><th>Status</th><th>Decision</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{display(row.employee)}</td><td>{row.leaveType.name}</td><td>{queue === "leave" ? `${display(row.startDate)} – ${display(row.endDate)}` : `${row.amount} ${row.unit}`}</td><td>{human(row.status)}</td><td>{["approve", "refuse"].map(action => <button className="pp-text-button" key={action} disabled={busy} onClick={() => { setDecision({ ...row, action }); setReason(""); }}>{human(action)}</button>)}</td></tr>)}</tbody></table>{!data.items.length && <p className="pp-empty">No requests awaiting this approval stage.</p>}</div>}
    </>}
    {section === "holidays" && data && <section className="pp-panel"><div className="pp-panel-heading"><div><h2>Schedule holidays</h2><p>Holidays follow the employee’s assigned working schedule.</p></div><button className="pp-button pp-button-outline" onClick={() => onNavigate("schedules")}>Manage schedule holidays</button></div><div className="pp-table-scroll"><table className="pp-table"><thead><tr><th>Holiday</th><th>Date</th><th>Working schedule</th><th>Paid</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{row.name}</td><td>{display(row.date)}</td><td>{row.workingSchedule.name}</td><td>{row.isPaid ? "Yes" : "No"}</td></tr>)}</tbody></table>{!data.items.length && <p className="pp-empty">Add holidays in a working schedule to see them here.</p>}</div></section>}
    {["approvals", "holidays"].includes(section) && data && <div className="pp-pagination"><span>{data.total} records</span><button disabled={page <= 1 || busy} onClick={() => { setPage(p => p - 1); setData(null); }}>Previous</button><span>Page {page}</span><button disabled={page * data.pageSize >= data.total || busy} onClick={() => { setPage(p => p + 1); setData(null); }}>Next</button></div>}
    {section === "hr-reports" && data && <>
      <div className="pp-hr-summary">{[["Employees", data.metrics.employees], ["Attendance rate", data.metrics.attendanceRate == null ? "Not recorded" : `${data.metrics.attendanceRate}%`], ["Worked hours", (data.metrics.workedMinutes / 60).toFixed(1)], ["Overtime hours", (data.metrics.overtimeMinutes / 60).toFixed(1)]].map(([label, value]) => <div className="pp-panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <section className="pp-overview-grid"><article className="pp-panel pp-settings-section"><h2>Monthly attendance</h2><div className="pp-hr-chart"><Bar options={chartOptions} data={{ labels: data.trend.map(d => d.date.slice(-2)), datasets: [["present", "Present", "#699d80"], ["absent", "Absent", "#d99c87"], ["leave", "On leave", "#b9b278"]].map(([key, label, backgroundColor]) => ({ label, backgroundColor, data: data.trend.map(d => d[key]) })) }} /></div></article><article className="pp-panel pp-settings-section"><h2>Department workforce</h2><div className="pp-hr-chart"><Bar options={chartOptions} data={{ labels: data.departments.map(d => d.name), datasets: [{ label: "Employees", backgroundColor: "#699d80", data: data.departments.map(d => d.employees) }] }} /></div></article></section>
      <details className="pp-panel pp-settings-section"><summary>View attendance data</summary><div className="pp-table-scroll"><table className="pp-table"><thead><tr><th>Date</th><th>Present</th><th>Absent</th><th>On leave</th></tr></thead><tbody>{data.trend.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.present}</td><td>{d.absent}</td><td>{d.leave}</td></tr>)}</tbody></table></div></details>
      <p className="pp-field-note">Attendance uses recorded daily summaries. Refresh completed days in Attendance to include scheduled absences. Department counts reflect the current workforce.</p>
    </>}
  </div>;
}
