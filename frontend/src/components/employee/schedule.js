"use client";
import { useState } from "react";
import { employeeApi } from "@/services/employee.service";
import {
  Badge,
  Empty,
  Panel,
  ResourceState,
  dateLabel,
  number,
  timeLabel,
  useEmployeeResource,
} from "./shared";

export default function EmployeeSchedule({
  month,
  preferences,
  revision,
  refresh,
}) {
  const resource = useEmployeeResource(
    employeeApi.schedule,
    { month },
    revision,
  );
  const [view, setView] = useState("calendar");
  if (!resource.data)
    return <ResourceState resource={resource} onRetry={refresh} />;
  const { days, today, scheduledHours, workingDays } = resource.data;
  const start = preferences.weekStartsOn,
    firstDay = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function shifts(day) {
    return (
      <>
        {(day.holiday ? [] : day.lines).map((line) => (
          <span className="emp-shift-time" key={line.id}>
            {timeLabel(line.startMinute, preferences.timeFormat)} –{" "}
            {timeLabel(line.endMinute, preferences.timeFormat)}
            {line.endDayOffset ? " +1d" : ""}
            <small>
              {line.breakMinutes
                ? `${line.breakMinutes} min break`
                : "No scheduled break"}
            </small>
          </span>
        ))}
        {day.holiday && <span className="emp-day-note">{day.holiday}</span>}
        {day.leave.map((l, i) => (
          <span className="emp-day-note" key={i}>
            {l.name} · {number(l.days)} days / {number(l.hours)} h
          </span>
        ))}
      </>
    );
  }
  return (
    <Panel
      title="My schedule"
      description={`${workingDays} scheduled days · ${number(scheduledHours)} scheduled hours in ${month}. Shift times use the assigned schedule’s timezone.`}
      action={
        <div className="emp-segmented" aria-label="Schedule view">
          {["calendar", "list"].map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === "calendar" ? "Calendar" : "List"}
            </button>
          ))}
        </div>
      }
    >
      {days.every(
        (d) => d.status === "UNASSIGNED" || d.status === "OUTSIDE_EMPLOYMENT",
      ) && (
        <Empty title="No schedule for this month">
          Your HR team can assign your working hours.
        </Empty>
      )}
      {view === "calendar" ? (
        <div className="emp-calendar-scroll">
          <div
            className="emp-calendar"
            aria-label={`Working schedule for ${month}`}
          >
            {Array.from({ length: 7 }, (_, i) => (
              <div className="emp-weekday" key={i}>
                {labels[(i + start) % 7]}
              </div>
            ))}
            {Array.from({ length: (firstDay - start + 7) % 7 }, (_, i) => (
              <div className="emp-calendar-blank" key={`blank-${i}`} />
            ))}
            {days.map((day) => (
              <article
                key={day.date}
                className={`emp-calendar-day emp-day-${day.status.toLowerCase()} ${day.date === today ? "emp-day-today" : ""}`}
                aria-label={`${dateLabel(day.date)} ${day.status.toLowerCase().replaceAll("_", " ")}`}
              >
                <div className="emp-day-top">
                  <strong>{Number(day.date.slice(-2))}</strong>
                  {day.date === today && <small>Today</small>}
                </div>
                <span className="emp-day-status">
                  {day.status.replaceAll("_", " ").toLowerCase()}
                </span>
                {shifts(day)}
                {day.scheduleName && (
                  <small className="emp-schedule-name">
                    {day.scheduleName} · {day.timezone}
                  </small>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="pp-table-scroll">
          <table className="pp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Shift / leave</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <td>{dateLabel(day.date)}</td>
                  <td>
                    <Badge value={day.status} />
                  </td>
                  <td>
                    {day.scheduleName || "—"}
                    <small>{day.timezone}</small>
                  </td>
                  <td>{shifts(day)}</td>
                  <td>{number(day.minutes / 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="pp-panel-footnote">
        Leave is shown alongside the planned shift, including partial days.
        Holidays have zero scheduled hours; overnight shifts end the following
        day.
      </p>
    </Panel>
  );
}
