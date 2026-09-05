import { test } from "node:test";
import assert from "node:assert/strict";

test("API client persists only its tab selector and rotates it on successful login", async () => {
  const storage = new Map();
  globalThis.window = { sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  try {
    const { default: api } = await import("../src/services/api.js");
    api.defaults.adapter = async config => ({ status: 200, statusText: "OK", headers: {}, data: {}, config });
    const initial = (await api.get("/users/me")).config.workspaceSession;
    assert.equal((await api.get("/users/me")).config.workspaceSession, initial);
    const loggedIn = await api.post("/auth/login", { email: "test@example.test", password: "test" });
    const sessionA = loggedIn.config.workspaceSession;
    assert.notEqual(sessionA, initial);
    assert.equal(storage.get("peoplepay360-tab-session"), sessionA);
    assert.equal((await api.get("/users/me")).config.headers.get("X-Workspace-Session"), sessionA);
    const { default: reloaded } = await import("../src/services/api.js?reload");
    reloaded.defaults.adapter = api.defaults.adapter;
    assert.equal((await reloaded.get("/users/me")).config.workspaceSession, sessionA);
    // Simulate the cloned storage of a duplicated tab: login must allocate a
    // new selector instead of writing into the original account's cookie.
    const sessionB = (await reloaded.post("/auth/hr/login", {})).config.workspaceSession;
    assert.notEqual(sessionB, sessionA);
    const savedAdapter = api.defaults.adapter;
    api.defaults.adapter = async () => { throw new Error("Invalid credentials"); };
    await assert.rejects(api.post("/auth/login", {}), /Invalid credentials/);
    assert.equal(storage.get("peoplepay360-tab-session"), sessionB);
    api.defaults.adapter = savedAdapter;
    const logout = await api.post("/auth/logout");
    assert.equal(logout.config.workspaceSession, sessionB);
    assert.notEqual(storage.get("peoplepay360-tab-session"), sessionB);
    assert.equal(storage.size, 1); // No passwords or JWTs in browser storage.
  } finally { delete globalThis.window; }
});
