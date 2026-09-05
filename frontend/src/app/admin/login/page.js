"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/admin/theme-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CreditCard, Eye, EyeOff, Fingerprint, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";
import { adminLogin, errorMessage } from "@/services/admin.service";
import { getCurrentUser } from "@/services/auth.service";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentUser().then(({ user }) => { if (active && user.role === "ADMIN") router.replace("/admin/dashboard"); }).catch(() => {});
    return () => { active = false; };
  }, [router]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError(""); setBusy(true);
    try {
      await adminLogin({ email, password });
      router.replace("/admin/dashboard");
    } catch (failure) {
      setError(errorMessage(failure, "Unable to sign in. Check your email and password."));
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
        <Link className="pp-story-brand" href="/admin/login" aria-label="PeoplePay360 administrator sign in">
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
      <div className="pp-login-top"><ThemeToggle /><ShieldCheck size={15} /><span>PeoplePay360 · Administrator access</span></div>
      <div className="pp-login-form-wrap">
        <div className="pp-login-emblem"><Fingerprint size={28} strokeWidth={1.6} /></div>
        <span className="pp-eyebrow pp-admin-label">ADMIN WORKSPACE</span>
        <h2>Welcome back.</h2>
        <p className="pp-login-intro">A fresh view of your workplace is waiting.<br />Sign in to bring it all together.</p>
        <form className="pp-form" onSubmit={submit}>
          <label htmlFor="admin-email">Work email</label>
          <div className="pp-input-icon"><Mail size={18} /><input id="admin-email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} autoFocus /></div>
          <label htmlFor="admin-password">Password</label>
          <div className="pp-input-icon"><LockKeyhole size={18} /><input id="admin-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /><button type="button" className="pp-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <p className="pp-login-hint"><ShieldCheck size={15} /> Only authorized administrators can sign in.</p>
          {error && <div className="pp-error" role="alert">{error}</div>}
          <button type="submit" className="pp-button pp-button-primary pp-signin" disabled={busy}>{busy ? <><LoaderCircle className="pp-spin" size={18} /> Signing you in…</> : <>Sign in to workspace <ArrowRight size={18} /></>}</button>
        </form>
        <div className="pp-login-help"><span>Need access or help signing in?</span><p>Contact your organization’s account administrator.</p></div>
      </div>
    </section>
    <footer className="pp-story-footer"><span>© {new Date().getFullYear()} PeoplePay360. All rights reserved.</span><span>Made for the people behind your business.</span></footer>
  </main>;
}
