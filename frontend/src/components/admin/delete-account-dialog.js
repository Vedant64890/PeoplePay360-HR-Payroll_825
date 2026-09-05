"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { deleteAccount, errorMessage } from "@/services/admin.service";

export default function DeleteAccountDialog({ account, onClose, onSaved }) {
  const ref = useRef(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await deleteAccount(account.id); onSaved("Account deleted."); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  }
  return <dialog ref={ref} className="pp-dialog" aria-labelledby="delete-account-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="pp-dialog-heading"><span className="pp-icon-box pp-tone-orange"><Trash2 size={23} /></span><button className="pp-icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={21} /></button></div>
    <h2 id="delete-account-title">Delete account?</h2>
    <p>Delete <strong>{account.name}</strong> ({account.email})? This permanently removes the account and ends its access.</p>
    <p className="pp-field-note">Accounts linked to employee records or recorded activity must be disabled through Manage instead.</p>
    <form onSubmit={submit}>{error && <div className="pp-error" role="alert">{error}</div>}<div className="pp-dialog-actions"><button type="button" className="pp-button pp-button-outline" disabled={busy} onClick={onClose}>Cancel</button><button className="pp-button pp-button-danger" disabled={busy}>{busy ? <LoaderCircle className="pp-spin" size={17} /> : <Trash2 size={17} />}{busy ? "Deleting…" : "Delete account"}</button></div></form>
  </dialog>;
}
