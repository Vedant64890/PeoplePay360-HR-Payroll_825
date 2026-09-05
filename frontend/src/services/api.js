import axios from "axios";

const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:5000/api",

  withCredentials: true,

  headers: {
    "Content-Type": "application/json",
  },
});

const sessionKey = "peoplepay360-tab-session";
let memorySession;
function currentSession() {
  try {
    const saved = window.sessionStorage.getItem(sessionKey);
    if (saved) return saved;
  } catch { /* Keep this tab working when storage is unavailable. */ }
  if (!memorySession) memorySession = crypto.randomUUID();
  persistSession(memorySession);
  return memorySession;
}
function persistSession(session) {
  memorySession = session;
  try { window.sessionStorage.setItem(sessionKey, session); } catch { /* In-memory fallback. */ }
}
api.interceptors.request.use(config => {
  if (typeof window === "undefined") return config;
  // A duplicated tab can initially inherit sessionStorage. Every successful
  // login gets a fresh selector so it never replaces the originating tab.
  const login = /\/auth\/(?:admin\/|hr\/)?login$/.test(config.url || "");
  const session = login ? crypto.randomUUID() : currentSession();
  config.headers.set("X-Workspace-Session", session);
  config.workspaceSession = session;
  config.workspaceLogin = login;
  return config;
});
api.interceptors.response.use(response => {
  if (typeof window !== "undefined") {
    if (response.config.workspaceLogin) persistSession(response.config.workspaceSession);
    if (response.config.url === "/auth/logout" && currentSession() === response.config.workspaceSession) persistSession(crypto.randomUUID());
  }
  return response;
});

export default api;
