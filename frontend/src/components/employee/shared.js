"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/services/admin.service";
import { downloadEmployeeFile } from "@/services/employee.service";

export const human = (value) =>
  String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const number = (value) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
export const money = (value, currency = "INR") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
export const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "—";
export const timeLabel = (value, format = "24h") => {
  const hour = Math.floor(value / 60),
    minute = String(value % 60).padStart(2, "0");
  return format === "12h"
    ? `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`
    : `${String(hour).padStart(2, "0")}:${minute}`;
};
export const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export function useEmployeeResource(method, params = {}, revision = 0) {
  const router = useRouter();
  const key = JSON.stringify(params),
    requestKey = `${key}:${revision}`;
  const [state, setState] = useState({
    key: null,
    requestKey: null,
    data: null,
    error: "",
  });
  useEffect(() => {
    let active = true;
    method(JSON.parse(key))
      .then((data) => {
        if (active) setState({ key, requestKey, data, error: "" });
      })
      .catch((error) => {
        if (active) {
          if (error.response?.status === 401) router.replace("/login");
          setState({ key, requestKey, data: null, error: errorMessage(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [method, key, requestKey, router]);
  return state.key === key
    ? { ...state, loading: state.requestKey !== requestKey }
    : { data: null, error: "", loading: true };
}
export function ResourceState({ resource, onRetry }) {
  if (resource.error)
    return (
      <div className="pp-error" role="alert">
        {resource.error}
        {onRetry && <button onClick={onRetry}>Retry</button>}
      </div>
    );
  return (
    <div className="pp-panel pp-empty" role="status">
      <LoaderCircle className="pp-spin" />
      <p>Loading your records…</p>
    </div>
  );
}
export function Empty({ title, children }) {
  return (
    <div className="pp-empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}) {
  return (
    <section className={`pp-panel ${className}`}>
      <div className="pp-panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Badge({ value }) {
  const tone = [
    "APPROVED",
    "PAID",
    "ACTIVE",
    "PRESENT",
    "OPEN",
    "WORKING",
  ].includes(value)
    ? "green"
    : ["REFUSED", "CANCELLED", "ABSENT", "TERMINATED"].includes(value)
      ? "red"
      : "neutral";
  return <span className={`pp-badge pp-badge-${tone}`}>{human(value)}</span>;
}
export function Details({ items }) {
  return (
    <div className="pp-detail-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value ?? "—"}</strong>
        </div>
      ))}
    </div>
  );
}
export function Dialog({ title, onClose, children, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="pp-dialog pp-module-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="pp-dialog-heading">
        <h2>{title}</h2>
        <button
          className="pp-icon-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function DownloadButton({
  kind,
  id,
  fileName,
  label = "Download",
  onError,
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="pp-button pp-button-outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadEmployeeFile(kind, id, fileName);
        } catch (e) {
          onError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <LoaderCircle size={16} className="pp-spin" />
      ) : (
        <Download size={16} />
      )}
      {busy ? "Preparing…" : label}
    </button>
  );
}
