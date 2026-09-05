"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, Leaf, LoaderCircle, LogOut, ShieldCheck, X } from "lucide-react";
import Brand from "./brand";

const mobileQuery = "(max-width: 720px)";
const subscribeMobile = callback => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverSnapshot = () => false;

export default function WorkspaceSidebar({
  groups, section, onNavigate, mobileOpen, onMobileChange, organizationName,
  workspaceLabel, navigationLabel, homeHref, user, role, onSignOut,
  signingOut = false, counts = {}, workspaceIcon: WorkspaceIcon = Leaf,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const onClose = useCallback(() => onMobileChange(false), [onMobileChange]);
  const isMobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, serverSnapshot);
  const sidebarRef = useRef(null);
  const scrollTimer = useRef(null);
  const compact = collapsed && !isMobile;
  const initials = (user.name || "").split(" ").filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();

  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const sidebar = sidebarRef.current;
    const main = sidebar.parentElement.querySelector(".pp-workspace-main");
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const previousInert = main?.inert;
    document.body.style.overflow = "hidden";
    if (main) main.inert = true;
    sidebar.querySelector(".pp-mobile-close")?.focus({ preventScroll: true });

    function handleKeyDown(event) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const focusable = [...sidebar.querySelectorAll('a[href], button:not(:disabled), [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (main) main.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isMobile, mobileOpen, onClose]);

  function onNavScroll(event) {
    const nav = event.currentTarget;
    nav.classList.add("pp-nav-scrolling");
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => nav.classList.remove("pp-nav-scrolling"), 900);
  }

  return <>
    <button type="button" className={`pp-nav-scrim pp-sidebar-scrim ${mobileOpen ? "pp-sidebar-scrim-open" : ""}`} aria-label="Close navigation" tabIndex={-1} aria-hidden={!isMobile || !mobileOpen} onClick={onClose} />
    <aside ref={sidebarRef} id="workspace-sidebar" className={`pp-sidebar pp-sidebar-enhanced${mobileOpen ? " pp-sidebar-open" : ""}${compact ? " pp-sidebar-collapsed" : ""}`} aria-label={workspaceLabel} role={isMobile && mobileOpen ? "dialog" : undefined} aria-modal={isMobile && mobileOpen ? true : undefined} inert={isMobile && !mobileOpen}>
      <div className="pp-sidebar-brand">
        <Brand href={homeHref} />
        <button type="button" className="pp-icon-button pp-mobile-close" aria-label="Close navigation" onClick={onClose}><X size={20} /></button>
      </div>

      <div className="pp-workspace-picker" title={`${organizationName || "Your organization"} · ${workspaceLabel}`}>
        <span className="pp-workspace-icon"><WorkspaceIcon size={19} strokeWidth={1.8} /></span>
        <div className="pp-sidebar-copy"><strong>{organizationName || "Your organization"}</strong><small>{workspaceLabel}</small></div>
        <ShieldCheck className="pp-workspace-shield" size={16} aria-hidden="true" />
      </div>

      <nav aria-label={navigationLabel} onScroll={onNavScroll}>
        {groups.map(([group, items]) => <div className="pp-nav-group" key={group}>
          <p className="pp-nav-label"><span>{group}</span></p>
          {items.map(([id, label, Icon]) => <button type="button" key={id}
            className={`pp-nav-item${section === id ? " pp-nav-active" : ""}`}
            aria-current={section === id ? "page" : undefined}
            aria-label={counts[id] ? `${label}, ${counts[id]} pending` : label}
            title={compact ? label : undefined} onClick={() => onNavigate(id)}>
            <span className="pp-nav-icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="pp-nav-text">{label}</span>
            {!!counts[id] && <span className="pp-nav-count" aria-hidden="true">{counts[id] > 99 ? "99+" : counts[id]}</span>}
          </button>)}
        </div>)}
      </nav>

      <div className="pp-sidebar-bottom">
        <div className="pp-sidebar-user">
          <span className="pp-avatar pp-avatar-light" title={`${user.name} · ${role}`}>{initials}</span>
          <div className="pp-sidebar-copy"><strong title={user.name}>{user.name}</strong><small>{role}</small></div>
          <button type="button" className="pp-icon-button pp-sidebar-signout" aria-label="Sign out" title="Sign out" disabled={signingOut} onClick={onSignOut}>{signingOut ? <LoaderCircle size={17} className="pp-spin" /> : <LogOut size={17} />}</button>
        </div>
        <button type="button" className="pp-sidebar-collapse" onClick={() => setCollapsed(value => !value)} aria-expanded={!compact} aria-controls="workspace-sidebar" aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} title={compact ? "Expand sidebar" : undefined}>
          <ChevronLeft size={17} /><span>{compact ? "Expand sidebar" : "Collapse sidebar"}</span>
        </button>
      </div>
    </aside>
  </>;
}
