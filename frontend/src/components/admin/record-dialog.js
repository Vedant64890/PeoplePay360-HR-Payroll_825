"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, ShieldCheck, UserRoundPlus, X } from "lucide-react";
import { createAccount, updateAccount, fetchWorkspace, errorMessage } from "@/services/admin.service";

export const roleLabels = { USER: "Employee (legacy)", MANAGER: "HR manager (legacy)", EMPLOYEE: "Employee", HR_MANAGER: "HR manager", HR_PAYROLL_USER: "Payroll user", HR_PAYROLL_MANAGER: "Payroll manager", ADMIN: "Administrator" };
const roles = ["EMPLOYEE", "HR_MANAGER", "HR_PAYROLL_USER", "HR_PAYROLL_MANAGER", "ADMIN"];

export default function RecordDialog({ kind, account, currentUserId, onClose, onSaved }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availableRoles, setAvailableRoles] = useState(null);
  const [form, setForm] = useState(kind === "access" ? { role: account.role, isActive: account.isActive } : { name: "", email: "", password: "", role: "EMPLOYEE" });
  const isSelf = kind === "access" && account.id === currentUserId;
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  useEffect(() => {
    let active = true;
    fetchWorkspace("roles").then(result => {
      if (!active) return;
      const options = result.items.filter(r => roles.includes(r.code) || r.code === account?.role);
      setAvailableRoles(options);
      setForm(previous => options.some(r => r.code === previous.role) ? previous : { ...previous, role: "" });
    }).catch(e => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [kind, account?.role]);

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      if (kind === "access") await updateAccount(account.id, form);
      else await createAccount(form);
      onSaved(kind === "access" ? "Account access updated." : form.role === "EMPLOYEE" ? "Employee account and linked profile created. Complete employment details in Employees." : "Account created. Share the initial password securely.");
    } catch (failure) { setError(errorMessage(failure)); setBusy(false); }
  }

  return <dialog ref={ref} className="pp-dialog" aria-labelledby="record-dialog-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}>
    <div className="pp-dialog-heading"><span className="pp-icon-box pp-tone-green">{kind === "access" ? <ShieldCheck size={24} /> : <UserRoundPlus size={24} />}</span><button className="pp-icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    <h2 id="record-dialog-title">{kind === "access" ? "Manage account access" : "Welcome someone in."}</h2>
    <p className="pp-muted">{kind === "access" ? `Set workspace access for ${account.name}.` : "Create a workspace account and choose the right level of access."}</p>
    <form className="pp-form pp-dialog-form" onSubmit={submit}>
        {kind !== "access" && <><label htmlFor="account-name">Full name</label><input id="account-name" value={form.name} onChange={set("name")} minLength={2} maxLength={80} autoFocus required /><label htmlFor="account-email">Email address</label><input id="account-email" type="email" value={form.email} onChange={set("email")} required /><label htmlFor="account-password">Initial password</label><input id="account-password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} minLength={12} maxLength={72} required /><p className="pp-field-note">At least 12 characters. Share this password securely with the account owner; no email is sent.</p></>}
        <label htmlFor="account-role">Workspace role</label><select id="account-role" value={form.role} onChange={set("role")} required disabled={isSelf || !availableRoles}><option value="">{availableRoles ? "Choose a role" : "Loading roles…"}</option>{(availableRoles || []).map(role => <option key={role.code} value={role.code}>{role.name || roleLabels[role.code]}</option>)}</select>
        {kind === "access" && <label className="pp-switch-row" htmlFor="account-active"><span><strong>Account enabled</strong><small>Disabled accounts cannot sign in or continue an existing session.</small></span><input id="account-active" type="checkbox" checked={form.isActive} disabled={isSelf} onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))} /></label>}
        {isSelf && <p className="pp-field-note">Your own administrator access cannot be disabled or removed.</p>}
      {form.role === "EMPLOYEE" && <p className="pp-field-note">An Employee account gets a linked profile automatically. New profiles start as Onboarding with today’s joining date; complete employment details in Employees.</p>}
      {error && <div className="pp-error" role="alert">{error}</div>}
      <div className="pp-dialog-actions"><button type="button" className="pp-button pp-button-outline" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="pp-button pp-button-primary" disabled={busy || isSelf}>{busy ? <LoaderCircle className="pp-spin" size={17} /> : kind === "access" ? <ShieldCheck size={17} /> : <Plus size={17} />}{busy ? "Saving…" : kind === "access" ? "Save changes" : "Create account"}</button></div>
    </form>
  </dialog>;
}
