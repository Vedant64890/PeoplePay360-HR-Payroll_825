"use client";

import { useState, useSyncExternalStore } from "react";
import { ThemeToggle } from "@/components/admin/theme-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CreditCard, Eye, EyeOff, Fingerprint, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";
import { errorMessage } from "@/services/admin.service";
import { loginUser, requestPasswordReset, resetPassword, workspaceHome } from "@/services/auth.service";
const subscribeHash = callback => { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); };
const resetToken = () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "";

export default function WorkspaceLogin({ mode = "login" }) {
  const router = useRouter();
  const token = useSyncExternalStore(subscribeHash, resetToken, () => null);
  const [confirmation, setConfirmation] = useState(""), [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError(""); setBusy(true);
    try {
      if (mode === "forgot") { const result = await requestPasswordReset(email); setNotice(result.message); setBusy(false); }
      else if (mode === "reset") {
        if (password !== confirmation) throw new Error("The passwords do not match.");
        if (!token) throw new Error("Open the reset link from your email to continue.");
        const result = await resetPassword(token, password); setNotice(result.message); setPassword(""); setConfirmation(""); setBusy(false);
      } else { const result = await loginUser({ email, password }); router.replace(workspaceHome(result.user.role)); }
    } catch (failure) {
      setError(errorMessage(failure, failure.message || "Unable to sign in. Check your email and password."));
      setBusy(false);
    }
  }

  return <main className="pp-login">
    <svg className="pp-story-background" viewBox="0 0 640 900" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 260C80 350 23 578 159 728C228 805 330 855 460 900H0Z" fill="#e6f3ee" />
        <path d="M0 576C95 725 209 810 371 900H0Z" fill="#dceee7" fillOpacity=".7" />
    </svg>
    <section className="pp-login-story" aria-labelledby="pp-story-title">
      <div className="pp-story-content">
        <Link className="pp-story-brand" href="/login" aria-label="PeoplePay360 sign in">
          <span className="pp-story-wordmark">People<span>P</span>ay<span>360</span><sup>™</sup></span>
          <span className="pp-story-brand-tagline">PEOPLE <i>|</i> PAYROLL <i>|</i> PROGRESS</span>
        </Link>
        <div className="pp-story-copy">
          <h1 id="pp-story-title">Enterprise HR &amp; Payroll,<br /><span>streamlined.</span></h1>
          <p>A modern, unified platform to manage your people, payroll and compliance — so you can focus on what drives your business forward.</p>
        </div>
        <ul className="pp-story-features">
          <li>
            <span className="pp-story-feature-icon" aria-hidden="true"><Users size={32} strokeWidth={1.8} /></span>
            <div><h2>Workforce Management</h2><p>From hiring to performance, keep your workforce engaged and productive.</p></div>
          </li>
          <li>
            <span className="pp-story-feature-icon" aria-hidden="true"><CreditCard size={32} strokeWidth={1.8} /></span>
            <div><h2>Payroll Processing</h2><p>Accurate, on-time payroll with built-in controls and flexibility.</p></div>
          </li>
          <li>
            <span className="pp-story-feature-icon" aria-hidden="true"><ShieldCheck size={34} strokeWidth={1.8} /></span>
            <div><h2>Compliance &amp; Reporting</h2><p>Stay compliant with evolving regulations and generate insights with ease.</p></div>
          </li>
        </ul>
        <p className="pp-story-tagline">People thrive. Organizations grow.</p>
      </div>
    </section>

    <section className="pp-login-form-side">
      <div className="pp-login-top"><ThemeToggle /><ShieldCheck size={15} /><span>PeoplePay360 · Your workspace</span></div>
      <div className="pp-login-form-wrap">
        <div className="pp-login-emblem"><Fingerprint size={28} strokeWidth={1.6} /></div>
        <span className="pp-eyebrow pp-admin-label">{mode === "login" ? "WORKSPACE SIGN IN" : "ACCOUNT RECOVERY"}</span>
        <h2>{mode === "forgot" ? "Forgot password?" : mode === "reset" ? "A fresh start." : "Welcome back."}</h2>
        <p className="pp-login-intro">{mode === "forgot" ? "Enter your work email and we’ll send you a reset link." : mode === "reset" ? "Choose a new password for your workspace account." : <>Your people and your workplace, together.<br />One sign-in for every role.</>}</p>
        {notice ? <div className="pp-recovery-notice" role="status"><ShieldCheck size={23} /><p>{notice}</p><Link href="/login" className="pp-button pp-button-primary">Back to sign in <ArrowRight size={17} /></Link></div> : <form className="pp-form" onSubmit={submit}>
          {mode !== "reset" && <><label htmlFor="login-email">Work email</label><div className="pp-input-icon"><Mail size={18} /><input id="login-email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} autoFocus /></div></>}
          {mode !== "forgot" && <><div className="pp-password-label"><label htmlFor="login-password">{mode === "reset" ? "New password" : "Password"}</label>{mode === "login" && <Link href="/forgot-password">Forgot password?</Link>}</div><div className="pp-input-icon"><LockKeyhole size={18} /><input id="login-password" type={showPassword ? "text" : "password"} autoComplete={mode === "reset" ? "new-password" : "current-password"} placeholder={mode === "reset" ? "At least 12 characters" : "Enter your password"} value={password} onChange={e => setPassword(e.target.value)} minLength={mode === "reset" ? 12 : 1} maxLength={mode === "reset" ? 72 : undefined} required disabled={busy} /><button type="button" className="pp-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></>}
          {mode === "reset" && <><label htmlFor="login-confirm">Confirm new password</label><div className="pp-input-icon"><LockKeyhole size={18} /><input id="login-confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Re-enter your new password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required disabled={busy} minLength={12} maxLength={72} /></div>{token === "" && <p className="pp-error" role="alert">Open the reset link from your email, or <Link href="/forgot-password">request a new link</Link>.</p>}</>}
          <p className="pp-login-hint"><ShieldCheck size={15} />{mode === "forgot" ? "Reset links expire in 30 minutes and can be used once." : mode === "reset" ? "Use at least 12 characters. Existing sessions will be signed out." : "Sign in with your work account to access your workspace."}</p>
          {error && <div className="pp-error" role="alert">{error}</div>}
          <button type="submit" className="pp-button pp-button-primary pp-signin" disabled={busy || (mode === "reset" && !token)}>{busy ? <><LoaderCircle className="pp-spin" size={18} /> {mode === "login" ? "Signing you in…" : "Processing…"}</> : <>{mode === "forgot" ? "Send reset link" : mode === "reset" ? "Reset password" : "Sign in to workspace"}<ArrowRight size={18} /></>}</button>
        </form>}
        <div className="pp-login-help">{mode !== "login" && <Link className="pp-text-button" href="/login">Back to sign in</Link>}<span>Need access or help signing in?</span><p>Contact your organization’s account administrator.</p></div>
      </div>
    </section>
    <footer className="pp-story-footer"><span>© {new Date().getFullYear()} PeoplePay360. All rights reserved.</span><span>Made for the people behind your business.</span></footer>
  </main>;
}
