import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import app from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

test("tabs keep separate HttpOnly sessions in one browser cookie jar", async () => {
  const ids = [], jar = new Map(), password = randomUUID(), tag = randomUUID();
  const origin = process.env.FRONTEND_URL || "http://localhost:3000";
  let server;
  try {
    const accounts = [];
    for (const role of ["ADMIN", "HR_MANAGER", "HR_PAYROLL_MANAGER"]) {
      const user = await prisma.user.create({ data: { name: "Session test", email: `${role.toLowerCase()}-${tag}@example.test`, role, password: await hashPassword(password) } });
      ids.push(user.id); accounts.push(user);
    }
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, tab, method = "GET", body, requestOrigin = origin) {
      const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: requestOrigin, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), ...(tab === undefined ? {} : { "X-Workspace-Session": tab }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const cookie = response.headers.get("set-cookie");
      if (cookie) {
        const [key, value] = cookie.split(";")[0].split("=");
        if (value) jar.set(key, value); else jar.delete(key);
      }
      return { status: response.status, data: await response.json(), cookie };
    }
    const tabs = accounts.map(() => randomUUID());
    for (const [index, user] of accounts.entries()) {
      const login = await request("/auth/login", tabs[index], "POST", { email: user.email, password });
      assert.equal(login.status, 200); assert.match(login.cookie, /HttpOnly/i);
      assert.equal(login.data.token, undefined);
    }
    assert.equal(jar.size, 3);
    for (const [i, account] of accounts.entries()) {
      const me = await request("/users/me", tabs[i]);
      assert.equal(me.status, 200); assert.equal(me.data.user.id, account.id);
    }
    assert.equal((await request("/admin/users", tabs[1])).status, 403);
    assert.equal((await request("/admin/users", tabs[0])).status, 200);
    assert.equal((await request("/users/me", randomUUID())).status, 401);
    assert.equal((await request("/auth/logout", tabs[1], "POST", undefined, "https://untrusted.test")).status, 403);
    assert.equal((await request("/auth/logout", tabs[1], "POST")).status, 200);
    assert.equal((await request("/users/me", tabs[1])).status, 401);
    assert.equal((await request("/users/me", tabs[0])).data.user.id, accounts[0].id);
    assert.equal((await request("/users/me", tabs[2])).data.user.id, accounts[2].id);
    // Legacy cookie and failed logins must never take over a tab's identity.
    assert.equal((await request("/auth/login", undefined, "POST", { email: accounts[1].email, password })).status, 200);
    assert.equal((await request("/users/me", randomUUID())).status, 401);
    assert.equal((await request("/auth/login", randomUUID(), "POST", { email: accounts[1].email, password: "wrong-password" })).status, 401);
    assert.equal((await request("/users/me", tabs[0])).data.user.id, accounts[0].id);
    // Duplicating a tab copies its selector initially; a new login selects a new cookie.
    const duplicate = randomUUID();
    assert.equal((await request("/auth/login", duplicate, "POST", { email: accounts[1].email, password })).status, 200);
    assert.equal((await request("/users/me", duplicate)).data.user.id, accounts[1].id);
    assert.equal((await request("/users/me", tabs[0])).data.user.id, accounts[0].id);
    assert.equal((await request("/auth/login", "bad-selector", "POST", { email: accounts[0].email, password })).status, 400);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
