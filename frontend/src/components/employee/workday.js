"use client";
import { useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Leaf,
  Play,
  Square,
} from "lucide-react";
import { employeeApi } from "@/services/employee.service";
import { errorMessage } from "@/services/admin.service";
import {
  Dialog,
  human,
  dateLabel as display,
  number as fmt,
  timeLabel as shiftTime,
} from "./shared";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
export function LeaveForm({ types, onClose, onSaved }) {
  const [typeId, setTypeId] = useState(""),
    [fraction, setFraction] = useState("1"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const type = types.find((t) => t.id === Number(typeId));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await employeeApi.requestLeave({
        leaveTypeId: Number(typeId),
        startDate: form.get("start"),
        endDate: form.get("end"),
        fraction: type?.allowHalfDay ? fraction : "1",
        ...(type?.unit === "HOURS"
          ? { hoursPerDay: Number(form.get("hours")) }
          : {}),
        reason: form.get("reason"),
      });
      onSaved("Your time-off request has been submitted.");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Request time off" onClose={onClose} busy={busy}>
      <form className="pp-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label htmlFor="leave-type">Leave type</label>
          <select
            id="leave-type"
            required
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            <option value="">Select a leave type</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({human(t.unit)})
              </option>
            ))}
          </select>
          <div className="pp-employee-form-grid">
            <label>
              Start date
              <input type="date" name="start" required />
            </label>
            <label>
              End date
              <input type="date" name="end" required />
            </label>
          </div>
          {type?.unit === "HOURS" ? (
            <label>
              Hours per working day
              <input
                name="hours"
                type="number"
                required
                min="0.25"
                max="24"
                step="0.25"
              />
            </label>
          ) : (
            type?.allowHalfDay && (
              <label>
                Duration per working day
                <select
                  value={fraction}
                  onChange={(e) => setFraction(e.target.value)}
                >
                  <option value="1">Full day</option>
                  <option value="0.5">Half day</option>
                </select>
              </label>
            )
          )}
          <label>
            Reason
            <textarea
              name="reason"
              required
              maxLength={3000}
              placeholder="Tell your manager about your request"
            />
          </label>
          <p className="pp-field-note">
            Duration follows your assigned working schedule.{" "}
            {type?.requiresAllocation
              ? "Approved requests use your allocated leave balance."
              : "This type does not require an allocation."}
          </p>
        </fieldset>
        {error && (
          <div className="pp-error" role="alert">
            {error}
          </div>
        )}
        <div className="pp-dialog-actions">
          <button
            type="button"
            className="pp-button pp-button-outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="pp-button pp-button-primary"
            disabled={busy || !types.length}
          >
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ContactForm({ profile, onSaved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fields = [
    ["personalEmail", "Personal email", "email"],
    ["personalPhone", "Personal phone", "tel"],
    ["addressLine1", "Address", "text"],
    ["addressLine2", "Address line 2", "text"],
    ["city", "City", "text"],
    ["state", "State / province", "text"],
    ["countryCode", "Country code (2 letters)", "text"],
    ["postalCode", "Postal code", "text"],
    ["emergencyContactName", "Emergency contact", "text"],
    ["emergencyContactPhone", "Emergency phone", "tel"],
  ];
  return (
    <form
      className="pp-panel pp-settings-section pp-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const values = new FormData(e.currentTarget);
        try {
          await employeeApi.updateProfile(
            Object.fromEntries(
              fields.map(([key]) => [
                key,
                (key === "countryCode"
                  ? values.get(key)?.trim().toUpperCase()
                  : values.get(key)?.trim()) || null,
              ]),
            ),
          );
          onSaved("Your contact information was updated.");
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Contact & emergency information</h2>
      <fieldset className="pp-employee-form-grid" disabled={busy}>
        {fields.map(([key, label, type]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type={type}
              defaultValue={profile[key] || ""}
              maxLength={200}
            />
          </label>
        ))}
      </fieldset>
      {error && (
        <div className="pp-error" role="alert">
          {error}
        </div>
      )}
      <div className="pp-dialog-actions">
        <a href="/forgot-password" className="pp-button pp-button-outline">
          Reset password
        </a>
        <button className="pp-button pp-button-primary" disabled={busy}>
          {busy ? "Saving…" : "Save contact details"}
        </button>
      </div>
    </form>
  );
}

export default function WorkdaySections({
  data,
  user,
  section,
  month,
  loading,
  busy,
  setDialog,
  checkIn,
  elapsedLabel,
  navigate,
  resolved,
  saved,
  preferences,
}) {
  const metric = data?.metrics,
    profile = data?.profile;
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  const dateTime = (value) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          timeZone: data.settings.timezone,
          hour12: preferences?.timeFormat !== "24h",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value))
      : "Still working";
  const cards = metric
    ? [
        [
          "Days present",
          metric.presentDays,
          `${metric.absentDays} recorded absent days`,
          Clock3,
          "attendance",
          "green",
        ],
        [
          "Hours worked",
          fmt(metric.workedHours),
          `${fmt(metric.overtimeHours)} overtime hours`,
          Activity,
          "attendance",
          "blue",
        ],
        [
          "Available leave",
          `${fmt(metric.availableDays)} days`,
          `${fmt(metric.availableHours)} hours in hourly allocations · available today`,
          Leaf,
          "balances",
          "violet",
        ],
        [
          "Pending requests",
          metric.pendingRequests,
          `${fmt(metric.approvedLeaveDays)} approved days this month`,
          CalendarDays,
          "leave",
          "orange",
        ],
      ]
    : [];
  function requestsTable(compact = false) {
    const rows = compact ? data.requests.slice(0, 5) : data.requests;
    return rows.length ? (
      <div className="pp-table-scroll">
        <table className="pp-table">
          <thead>
            <tr>
              <th>Leave type</th>
              <th>Dates</th>
              <th>Duration</th>
              <th>Status</th>
              {!compact && <th>Details & actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.leaveType.name}</td>
                <td>
                  {display(r.startDate)} – {display(r.endDate)}
                </td>
                <td>
                  {fmt(r.duration)} {human(r.unit).toLowerCase()}
                </td>
                <td>
                  <span
                    className={`pp-badge ${r.status === "APPROVED" ? "pp-badge-green" : "pp-badge-neutral"}`}
                  >
                    {human(r.status)}
                  </span>
                </td>
                {!compact && (
                  <td>
                    <p>{r.reason}</p>
                    {(r.refusalReason || r.cancellationReason) && (
                      <small>{r.refusalReason || r.cancellationReason}</small>
                    )}
                    {["SUBMITTED", "FIRST_APPROVED"].includes(r.status) && (
                      <button
                        className="pp-text-button"
                        onClick={() =>
                          setDialog({ type: "cancel", request: r })
                        }
                      >
                        Withdraw request
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="pp-empty">
        <h3>No requests for this month</h3>
        <p>Plan your next time off with a new request.</p>
      </div>
    );
  }
  return (
    <>
      {["overview", "attendance"].includes(section) && (
        <section className="pp-panel pp-employee-clock">
          <div>
            <span
              className={`pp-badge ${data.openSession ? "pp-badge-green" : "pp-badge-neutral"}`}
            >
              {data.openSession ? "Checked in" : "Checked out"}
            </span>
            <h2>
              {data.openSession ? elapsedLabel : "Ready for your workday?"}
            </h2>
            <p>
              {data.openSession
                ? `Started ${dateTime(data.openSession.checkIn)}`
                : data.schedule
                  ? `${data.schedule.name} · ${fmt(data.schedule.todayMinutes / 60)} scheduled hours today`
                  : "Ask HR to assign your working schedule."}
            </p>
            <small>
              {data.settings.timezone} · Session time includes breaks until
              checkout
            </small>
          </div>
          <button
            className="pp-button pp-button-primary"
            disabled={busy || (!data.openSession && !data.schedule)}
            onClick={() =>
              data.openSession ? setDialog({ type: "checkout" }) : checkIn()
            }
          >
            {data.openSession ? <Square size={17} /> : <Play size={17} />}
            {data.openSession ? "Check out" : "Check in"}
          </button>
        </section>
      )}
      {section === "overview" && (
        <>
          <section
            className="pp-metrics"
            aria-label="Employee key performance indicators"
            aria-busy={loading}
          >
            {cards.map(([label, value, note, Icon, target, tone]) => (
              <article className="pp-metric" key={label}>
                <div className="pp-metric-top">
                  <span>{label}</span>
                  <span className={`pp-icon-box pp-tone-${tone}`}>
                    <Icon size={20} />
                  </span>
                </div>
                <strong className="pp-kpi-value" key={value}>
                  {value}
                </strong>
                <p>
                  {note}
                  <button
                    aria-label={`View ${label.toLowerCase()}`}
                    onClick={() => navigate(target)}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </p>
              </article>
            ))}
          </section>
          <section className="pp-overview-grid">
            <article className="pp-panel">
              <div className="pp-panel-heading">
                <div>
                  <h2>Your working hours</h2>
                  <p>Closed attendance sessions · {month}</p>
                </div>
                <Activity size={20} />
              </div>
              <div className="pp-hr-chart">
                <Bar
                  data={{
                    labels: data.trend.map((d) => d.date.slice(-2)),
                    datasets: [
                      {
                        label: "Hours worked",
                        data: data.trend.map((d) => d.hours),
                        backgroundColor: "#699d80",
                        borderRadius: 5,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: {
                        ticks: {
                          color: resolved === "dark" ? "#b7cabc" : "#546c5d",
                          maxTicksLimit: 15,
                        },
                      },
                      y: {
                        beginAtZero: true,
                        ticks: {
                          color: resolved === "dark" ? "#b7cabc" : "#546c5d",
                        },
                      },
                    },
                  }}
                  role="img"
                  aria-label="Hours worked each day. My attendance provides the detailed records."
                />
              </div>
            </article>
            <article className="pp-panel pp-settings-section">
              <h2>Your team & work</h2>
              <div className="pp-detail-grid">
                {[
                  ["Department", profile.department?.name],
                  ["Job position", profile.jobPosition?.title],
                  [
                    "Manager",
                    profile.manager
                      ? `${profile.manager.firstName} ${profile.manager.lastName}`
                      : null,
                  ],
                  ["Work location", profile.workLocation],
                  [
                    "Attendance health",
                    metric.attendanceRate === null
                      ? "No recorded days"
                      : `${metric.attendanceRate}%`,
                  ],
                  ["Days late", metric.lateDays],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value ?? "Unassigned"}</strong>
                  </div>
                ))}
              </div>
              <button
                className="pp-text-button"
                onClick={() => navigate("profile")}
              >
                View my profile <ArrowUpRight size={16} />
              </button>
            </article>
          </section>
          <section className="pp-panel">
            <div className="pp-panel-heading">
              <div>
                <h2>Your recent time off</h2>
                <p>Requests in the selected month</p>
              </div>
              <button
                className="pp-text-button"
                onClick={() => navigate("leave")}
              >
                View all requests
              </button>
            </div>
            {requestsTable(true)}
          </section>
        </>
      )}
      {section === "attendance" && (
        <section className="pp-panel">
          <div className="pp-panel-heading">
            <div>
              <h2>Attendance history</h2>
              <p>
                {fmt(metric.workedHours)} hours worked · {metric.presentDays}{" "}
                present days · {metric.lateDays} late days
              </p>
            </div>
          </div>
          <div className="pp-table-scroll">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Check in / out</th>
                  <th>Break</th>
                  <th>Worked hours</th>
                  <th>Late / overtime</th>
                </tr>
              </thead>
              <tbody>
                {data.attendance.map((d) => (
                  <tr key={d.id}>
                    <td>{display(d.workDate)}</td>
                    <td>{human(d.status)}</td>
                    <td>
                      {d.entries.map((e) => (
                        <p key={e.id}>
                          {dateTime(e.checkIn)} → {dateTime(e.checkOut)}
                          <small>{human(e.source)}</small>
                        </p>
                      ))}
                    </td>
                    <td>
                      {d.entries.reduce((n, e) => n + e.breakMinutes, 0)} min
                    </td>
                    <td>{fmt(d.workedMinutes / 60)}</td>
                    <td>
                      {d.lateMinutes} min / {fmt(d.overtimeMinutes / 60)} h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.attendance.length && (
              <p className="pp-empty">No attendance records for this month.</p>
            )}
          </div>
          <p className="pp-panel-footnote">
            Contact HR for attendance corrections. Open sessions are added to
            worked hours after checkout.
          </p>
        </section>
      )}
      {section === "leave" && (
        <section className="pp-panel">
          <div className="pp-panel-heading">
            <div>
              <h2>Time-off requests</h2>
              <p>Follow approvals and withdraw pending requests.</p>
            </div>
          </div>
          {requestsTable()}
        </section>
      )}
      {section === "balances" && (
        <section className="pp-panel">
          <div className="pp-panel-heading">
            <div>
              <h2>Leave allocations & balances</h2>
              <p>
                Balances available today · days and hours are tracked separately
              </p>
            </div>
          </div>
          <div className="pp-table-scroll">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Allocation</th>
                  <th>Type</th>
                  <th>Allocated</th>
                  <th>Taken</th>
                  <th>Remaining</th>
                  <th>Validity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.balances.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{b.type}</td>
                    <td>
                      {fmt(b.allocated)} {human(b.unit).toLowerCase()}
                    </td>
                    <td>{fmt(b.taken)}</td>
                    <td>{fmt(b.remaining)}</td>
                    <td>
                      {display(b.validFrom)} –{" "}
                      {b.validUntil ? display(b.validUntil) : "No expiry"}
                    </td>
                    <td>
                      {human(b.status)}
                      <small>
                        {b.available
                          ? "Available today"
                          : "Not currently available"}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.balances.length && (
              <p className="pp-empty">
                No allocations yet. HR can assign leave allowances to your
                profile.
              </p>
            )}
          </div>
        </section>
      )}
      {section === "schedule" && (
        <section className="pp-panel">
          <div className="pp-panel-heading">
            <div>
              <h2>{data.schedule?.name || "No working schedule assigned"}</h2>
              <p>
                {data.schedule
                  ? `${fmt(data.schedule.weeklyHours)} hours per week · ${data.schedule.timezone}`
                  : "Contact HR to configure your working hours."}
              </p>
            </div>
          </div>
          {data.schedule && (
            <div className="pp-table-scroll">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Break</th>
                    <th>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {data.schedule.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{human(l.day)}</td>
                      <td>{shiftTime(l.startMinute)}</td>
                      <td>
                        {shiftTime(l.endMinute)}
                        {l.endDayOffset ? " (+1 day)" : ""}
                      </td>
                      <td>{l.breakMinutes} min</td>
                      <td>
                        {fmt(
                          (l.endMinute +
                            l.endDayOffset * 1440 -
                            l.startMinute -
                            l.breakMinutes) /
                            60,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {section === "profile" && (
        <>
          <section className="pp-panel pp-settings-section">
            <div className="pp-employee-profile-heading">
              <span className="pp-avatar">{initials}</span>
              <div>
                <h2>
                  {profile.firstName} {profile.lastName}
                </h2>
                <p>
                  {profile.employeeCode} · {human(profile.status)}
                </p>
              </div>
            </div>
            <div className="pp-detail-grid">
              {[
                ["Work email", profile.workEmail],
                ["Work phone", profile.workPhone],
                ["Department", profile.department?.name],
                ["Position", profile.jobPosition?.title],
                ["Employment type", human(profile.employeeType)],
                ["Joined", display(profile.hireDate)],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value || "Unassigned"}</strong>
                </div>
              ))}
            </div>
          </section>
          <ContactForm key={profile.id} profile={profile} onSaved={saved} />
        </>
      )}
    </>
  );
}
