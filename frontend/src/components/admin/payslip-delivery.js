"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Mail, RefreshCw } from "lucide-react";
import { errorMessage } from "@/services/admin.service";
import { human } from "./workspace-config";

export async function downloadPayslip(api, id) {
  const blob = await api.downloadPayslip(id), url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = `payslip-${id}.pdf`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PayslipDownload({ api, id }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <><button className="pp-button pp-button-outline pp-no-print" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await downloadPayslip(api, id); } catch (e) { setError(errorMessage(e, "Could not download this payslip.")); } finally { setBusy(false); } }}><Download size={16} />{busy ? "Generating PDF…" : "Download payslip PDF"}</button>{error && <p className="pp-error" role="alert">{error}</p>}</>;
}
export default function PayslipDelivery({ api, record }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const key = useRef(null);
  useEffect(() => { let active = true; const load = () => api.deliveryHistory(record.id).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(errorMessage(e)); }); load(); const timer = setInterval(load, 5000); return () => { active = false; clearInterval(timer); }; }, [api, record.id, revision]);
  const pending = data?.batches.some(b => ["QUEUED", "PROCESSING"].includes(b.status));
  return <section className="pp-no-print"><h3 className="pp-module-subheading">Payslip delivery</h3><p>Send each employee their PDF using the current work email listed below.</p>{error && <div className="pp-error" role="alert">{error}</div>}{notice && <p className="pp-module-notice" role="status">{notice}</p>}{data && <><details><summary>Review {data.recipients.length} recipients</summary>{data.recipients.map(r => <p key={r.id}>{r.employee.firstName} {r.employee.lastName} · {r.employee.workEmail || "Work email missing"}</p>)}</details>{!data.configured && <p className="pp-field-note">Email delivery needs to be configured by your workspace administrator.</p>}<button className="pp-button pp-button-primary" disabled={busy || pending || !data.configured || !data.recipients.length || data.recipients.some(r => !r.employee.workEmail)} onClick={async () => { setBusy(true); setError(""); key.current ||= crypto.randomUUID(); try { await api.sendPayslips(record.id, { version: record.version, idempotencyKey: key.current }); setNotice("Delivery queued. Statuses below update as each email is processed."); key.current = null; setRevision(v => v + 1); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}><Mail size={16} />{pending ? "Sending payslips…" : data.batches.length ? "Send another batch" : "Send payslips"}</button>{data.batches.map(batch => <div key={batch.id}><h4>Batch #{batch.id} · {human(batch.status)}</h4><div className="pp-table-scroll"><table className="pp-table"><thead><tr><th>Recipient</th><th>Status</th><th>Attempts</th><th>Action</th></tr></thead><tbody>{batch.deliveries.map(d => <tr key={d.id}><td>{d.recipientEmail}</td><td>{human(d.status)}{d.lastError && <small>{d.lastError}</small>}</td><td>{d.attemptCount}</td><td>{d.status === "FAILED" && <button className="pp-text-button" disabled={busy} onClick={async () => { setBusy(true); try { await api.retryDelivery(record.id, d.id); setRevision(v => v + 1); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}><RefreshCw size={14} />Retry</button>}</td></tr>)}</tbody></table></div></div>)}</>}</section>;
}
