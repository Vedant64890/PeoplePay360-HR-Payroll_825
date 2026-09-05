"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, ShieldCheck, UserRoundPlus, X } from "lucide-react";
import { createAccount, createEmployee, updateAccount, errorMessage } from "@/services/admin.service";

export const roleLabels = { USER: "Employee (legacy)", MANAGER: "HR manager (legacy)", EMPLOYEE: "Employee", HR_MANAGER: "HR manager", HR_PAYROLL_USER: "Payroll user", HR_PAYROLL_MANAGER: "Payroll manager", ADMIN: "Administrator" };
const roles = ["EMPLOYEE", "HR_MANAGER", "HR_PAYROLL_USER", "HR_PAYROLL_MANAGER", "ADMIN"];
const localDate = () => new Date().toLocaleDateString("en-CA");

export default function RecordDialog({ kind, account, currentUserId, departments, onClose, onSaved }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(kind === "employee" ? { firstName: "", lastName: "", employeeCode: "", workEmail: "", hireDate: localDate(), employeeType: "FULL_TIME", departmentId: "" } : kind === "access" ? { role: account.role, isActive: account.isActive } : { name: "", email: "", password: "", role: "EMPLOYEE" });
  const isSelf = kind === "access" && account.id === currentUserId;
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      if (kind === "employee") {
        const data = { ...form };
        if (!data.workEmail.trim()) delete data.workEmail;
        if (data.departmentId) data.departmentId = Number(data.departmentId); else delete data.departmentId;
        await createEmployee(data);
      } else if (kind === "access") await updateAccount(account.id, form);
      else await createAccount(form);
      onSaved(kind === "employee" ? "Employee added to your workspace." : kind === "access" ? "Account access updated." : "Account created. Share the initial password securely.");
    } catch (failure) { setError(errorMessage(failure)); setBusy(false); }
  }

  return <dialog ref={ref} className="pp-dialog" aria-labelledby="record-dialog-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}>
    <div className="pp-dialog-heading"><span className="pp-icon-box pp-tone-green">{kind === "access" ? <ShieldCheck size={24} /> : <UserRoundPlus size={24} />}</span><button className="pp-icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    <h2 id="record-dialog-title">{kind === "employee" ? "A new face. A great start." : kind === "access" ? "Manage account access" : "Welcome someone in."}</h2>
    <p className="pp-muted">{kind === "employee" ? "Start with the essentials. Your employee’s profile grows from here." : kind === "access" ? `Set workspace access for ${account.name}.` : "Create a workspace account and choose the right level of access."}</p>
    <form className="pp-form pp-dialog-form" onSubmit={submit}>
      {kind === "employee" ? <>
        <div className="pp-form-grid"><div><label htmlFor="employee-first">First name</label><input id="employee-first" value={form.firstName} onChange={set("firstName")} maxLength={100} required autoFocus /></div><div><label htmlFor="employee-last">Last name</label><input id="employee-last" value={form.lastName} onChange={set("lastName")} maxLength={100} required /></div></div>
        <div className="pp-form-grid"><div><label htmlFor="employee-code">Employee code</label><input id="employee-code" value={form.employeeCode} onChange={set("employeeCode")} placeholder="EMP-001" minLength={2} maxLength={40} required /></div><div><label htmlFor="employee-date">Joining date</label><input id="employee-date" type="date" value={form.hireDate} onChange={set("hireDate")} required /></div></div>
        <label htmlFor="employee-email">Work email <span className="pp-optional">optional</span></label><input id="employee-email" type="email" value={form.workEmail} onChange={set("workEmail")} placeholder="name@company.com" />
        <div className="pp-form-grid"><div><label htmlFor="employee-type">Employment type</label><select id="employee-type" value={form.employeeType} onChange={set("employeeType")}>{["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "TEMPORARY"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ").toLowerCase()}</option>)}</select></div><div><label htmlFor="employee-department">Department</label><select id="employee-department" value={form.departmentId} onChange={set("departmentId")}><option value="">Assign later</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div></div>
        <p className="pp-field-note">This creates an employee profile. Workspace login accounts are managed separately in User access.</p>
      </> : <>
        {kind !== "access" && <><label htmlFor="account-name">Full name</label><input id="account-name" value={form.name} onChange={set("name")} minLength={2} maxLength={80} autoFocus required /><label htmlFor="account-email">Email address</label><input id="account-email" type="email" value={form.email} onChange={set("email")} required /><label htmlFor="account-password">Initial password</label><input id="account-password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} minLength={12} maxLength={72} required /><p className="pp-field-note">At least 12 characters. Share this password securely with the account owner; no email is sent.</p></>}
        <label htmlFor="account-role">Workspace role</label><select id="account-role" value={form.role} onChange={set("role")} disabled={isSelf}>{[...new Set([...roles, form.role])].map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>
        {kind === "access" && <label className="pp-switch-row" htmlFor="account-active"><span><strong>Account enabled</strong><small>Disabled accounts cannot sign in or continue an existing session.</small></span><input id="account-active" type="checkbox" checked={form.isActive} disabled={isSelf} onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))} /></label>}
        {isSelf && <p className="pp-field-note">Your own administrator access cannot be disabled or removed.</p>}
      </>}
      {error && <div className="pp-error" role="alert">{error}</div>}
      <div className="pp-dialog-actions"><button type="button" className="pp-button pp-button-outline" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="pp-button pp-button-primary" disabled={busy || isSelf}>{busy ? <LoaderCircle className="pp-spin" size={17} /> : kind === "access" ? <ShieldCheck size={17} /> : <Plus size={17} />}{busy ? "Saving…" : kind === "employee" ? "Add employee" : kind === "access" ? "Save changes" : "Create account"}</button></div>
    </form>
  </dialog>;
}
