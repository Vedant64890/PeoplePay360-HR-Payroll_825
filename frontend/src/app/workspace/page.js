"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import Brand from "@/components/admin/brand";
import { ThemeToggle } from "@/components/admin/theme-provider";
import { roleLabels } from "@/components/admin/record-dialog";
import { getCurrentUser, logoutUser, workspaceHome } from "@/services/auth.service";
import { errorMessage } from "@/services/admin.service";

export default function MyWorkspace() {
  const router = useRouter(), [user, setUser] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; getCurrentUser().then(({ user }) => { if (!active) return; const home = workspaceHome(user.role); if (home !== "/workspace") router.replace(home); else setUser(user); }).catch(e => { if (active) { if (e.response?.status === 401) router.replace("/login"); else setError(errorMessage(e)); } }); return () => { active = false; }; }, [router]);
  async function signOut() { setBusy(true); try { await logoutUser(); router.replace("/login"); } catch (e) { setError(errorMessage(e)); setBusy(false); } }
  return <main className="pp-account-home"><header><Brand href="/workspace" /><div><ThemeToggle /><button className="pp-button pp-button-outline" disabled={busy} onClick={signOut}><LogOut size={17} />Sign out</button></div></header>{error && <div className="pp-error" role="alert">{error}</div>}{user ? <section className="pp-panel"><span className="pp-icon-box pp-tone-green"><ShieldCheck size={24} /></span><p className="pp-eyebrow">MY WORKSPACE</p><h1>Welcome, {user.name}.</h1><p>You’re signed in to your PeoplePay360 account.</p><div className="pp-detail-grid"><div><span>Work email</span><strong>{user.email}</strong></div><div><span>Role</span><strong>{roleLabels[user.role] || user.role}</strong></div><div><span>Account status</span><strong>Active</strong></div></div><p className="pp-field-note">Contact your organization’s administrator for access to additional workplace tools.</p></section> : <p role="status">Loading your workspace…</p>}</main>;
}
