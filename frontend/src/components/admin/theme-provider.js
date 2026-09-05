"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

const storageKey = "peoplepay360-theme";
const eventName = "peoplepay360-theme-change";
const ThemeContext = createContext(null);
const valid = value => ["light", "dark", "system"].includes(value);
let sessionPreference;
function readPreference() {
  if (sessionPreference) return sessionPreference;
  try { const value = localStorage.getItem(storageKey); return valid(value) ? value : "system"; } catch { return "system"; }
}
function snapshot() {
  const preference = readPreference();
  const resolved = preference === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : preference;
  return `${preference}:${resolved}`;
}
function subscribe(callback) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = event => { if (event.key === storageKey || event.key === null) { sessionPreference = undefined; callback(); } };
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", callback);
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener("storage", onStorage); media.removeEventListener("change", callback); };
}
export default function ThemeProvider({ children }) {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [preference, resolved] = value.split(":");
  useEffect(() => { document.documentElement.dataset.ppTheme = resolved; }, [resolved]);
  function setTheme(next) {
    if (!valid(next)) return;
    sessionPreference = next;
    try { localStorage.setItem(storageKey, next); } catch { /* Theme still works for this session when storage is unavailable. */ }
    document.documentElement.dataset.ppTheme = next === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : next;
    window.dispatchEvent(new Event(eventName));
  }
  return <ThemeContext.Provider value={{ preference, resolved, setTheme }}><div className="pp-root">{children}</div></ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const label = `Switch to ${resolved === "dark" ? "light" : "dark"} theme`;
  return <button type="button" className="pp-icon-button pp-theme-toggle" aria-label={label} title={label} onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}>{resolved === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>;
}
export function ThemePicker() {
  const { preference, setTheme } = useTheme();
  return <div className="pp-theme-choices" role="group" aria-label="Appearance theme">{[{ value: "light", name: "Light", Icon: Sun }, { value: "dark", name: "Dark", Icon: Moon }, { value: "system", name: "System", Icon: Monitor }].map(({ value, name, Icon }) => <button key={value} type="button" aria-pressed={preference === value} onClick={() => setTheme(value)}><Icon size={22} /><span>{name}</span></button>)}</div>;
}
