"use client";
import { useState } from "react";
import { Bell, CheckCheck, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { employeeApi } from "@/services/employee.service";
import { errorMessage } from "@/services/admin.service";
import { useTheme } from "@/components/admin/theme-provider";
import { Empty, Panel, ResourceState } from "./shared";

export function EmployeeNotifications({
  resource,
  refresh,
  navigate,
  preferences,
  timezone,
}) {
  const [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const data = resource.data;
  async function mark(keys) {
    setBusy(true);
    setError("");
    try {
      await employeeApi.markRead(keys);
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <ResourceState resource={resource} onRetry={refresh} />;
  const rows = data.items.filter((item) => filter !== "unread" || !item.readAt);
  return (
    <Panel
      title="Notifications"
      description={`${data.unread} unread updates · latest 100 records per category`}
      action={
        <button
          className="pp-button pp-button-outline"
          disabled={busy || !data.unread}
          onClick={() =>
            mark(data.items.filter((i) => !i.readAt).map((i) => i.key))
          }
        >
          <CheckCheck size={17} />
          Mark all as read
        </button>
      }
    >
      <div className="emp-toolbar">
        <div className="emp-segmented">
          {["all", "unread"].map((value) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All updates" : "Unread"}
            </button>
          ))}
        </div>
        <button className="pp-text-button" onClick={() => navigate("settings")}>
          Notification preferences
        </button>
      </div>
      {error && (
        <div className="pp-error" role="alert">
          {error}
        </div>
      )}
      {rows.length ? (
        <div className="emp-notification-list">
          {rows.map((item) => (
            <article
              key={item.key}
              className={`emp-notification ${item.readAt ? "" : "emp-unread"}`}
            >
              <span className="pp-icon-box pp-tone-green">
                <Bell size={19} />
              </span>
              <div className="emp-grow">
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString(undefined, {
                    timeZone: timezone,
                    hour12: preferences.timeFormat !== "24h",
                  })}
                </time>
                <div className="emp-row-actions">
                  <button
                    className="pp-text-button"
                    onClick={() => navigate(item.section, item.month)}
                  >
                    View details
                  </button>
                  {!item.readAt && (
                    <button
                      className="pp-text-button"
                      disabled={busy}
                      onClick={() => mark([item.key])}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
              {!item.readAt && (
                <span className="emp-unread-dot" aria-label="Unread" />
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title="You’re all caught up">
          Leave decisions, released payslips and document updates appear here.
        </Empty>
      )}
    </Panel>
  );
}

export function EmployeeSettings({
  preferences,
  user,
  saved,
  onPreferences,
  sections,
}) {
  const { setTheme } = useTheme(),
    router = useRouter();
  const [form, setForm] = useState(preferences),
    [busy, setBusy] = useState(false),
    [passwordBusy, setPasswordBusy] = useState(false),
    [error, setError] = useState(""),
    [passwordError, setPasswordError] = useState("");
  const set = (key) => (event) =>
    setForm((value) => ({
      ...value,
      [key]:
        event.target.type === "checkbox"
          ? event.target.checked
          : key === "weekStartsOn"
            ? Number(event.target.value)
            : event.target.value,
    }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await employeeApi.saveSettings(form);
      setTheme(result.theme);
      onPreferences(result);
      saved("Your workspace preferences were saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function password(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    setPasswordError("");
    try {
      await employeeApi.changePassword({
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword"),
      });
      router.replace("/login?passwordChanged=1");
    } catch (e) {
      setPasswordError(errorMessage(e));
      setPasswordBusy(false);
    }
  }
  return (
    <div className="emp-stack">
      <Panel
        title="Workspace preferences"
        description="Saved to your employee account."
      >
        <form className="pp-form emp-panel-body" onSubmit={submit}>
          <fieldset disabled={busy}>
            <div className="pp-employee-form-grid">
              <label>
                Appearance
                <select value={form.theme} onChange={set("theme")}>
                  <option value="system">Use system theme</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                Time display
                <select value={form.timeFormat} onChange={set("timeFormat")}>
                  <option value="12h">12-hour clock</option>
                  <option value="24h">24-hour clock</option>
                </select>
              </label>
              <label>
                Calendar starts on
                <select
                  value={form.weekStartsOn}
                  onChange={set("weekStartsOn")}
                >
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              </label>
              <label>
                Open workspace on
                <select
                  value={form.defaultSection}
                  onChange={set("defaultSection")}
                >
                  {sections.map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <h3>In-app notifications</h3>
            <div className="emp-preference-list">
              {[
                [
                  "attendanceReminders",
                  "Workday reminder",
                  "Show a check-in reminder on your dashboard.",
                ],
                [
                  "leaveUpdates",
                  "Time-off updates",
                  "Show leave request and allocation updates in your notification feed.",
                ],
                [
                  "payrollUpdates",
                  "Payroll updates",
                  "Show released payslips and recorded payment updates.",
                ],
                [
                  "documentUpdates",
                  "Document updates",
                  "Show uploads in your notification feed.",
                ],
              ].map(([key, label, description]) => (
                <label key={key} className="emp-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={set(key)}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <div className="pp-error" role="alert">
              {error}
            </div>
          )}
          <div className="pp-dialog-actions">
            <button className="pp-button pp-button-primary" disabled={busy}>
              {busy ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </form>
      </Panel>
      <Panel
        title="Account & security"
        description={`Signed in as ${user.email}`}
      >
        <form className="pp-form emp-panel-body" onSubmit={password}>
          <p className="emp-security-note">
            <LockKeyhole size={18} />
            Changing your password signs you out of all sessions. Sign in again
            with your new password.
          </p>
          <fieldset className="pp-employee-form-grid" disabled={passwordBusy}>
            <label>
              Current password
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
                maxLength={72}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                name="newPassword"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
              />
            </label>
          </fieldset>
          <p className="pp-field-note">
            Use at least 12 characters and no more than 72 UTF-8 bytes.
          </p>
          {passwordError && (
            <div className="pp-error" role="alert">
              {passwordError}
            </div>
          )}
          <div className="pp-dialog-actions">
            <button
              className="pp-button pp-button-primary"
              disabled={passwordBusy}
            >
              {passwordBusy ? "Changing password…" : "Change password"}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
