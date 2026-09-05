import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { once } from "node:events";
import app from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { requestPasswordReset } from "../src/services/password-reset.service.js";

test("common sign-in and secure password recovery", { timeout: 120000 }, async t => {
  const tag = `reset-${Date.now()}`, password = randomBytes(18).toString("hex"), nextPassword = randomBytes(18).toString("hex");
  const ids = [], hash = await hashPassword(password);
  let server;
  try {
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, body, cookie) {
      const res = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, data: await res.json(), cookie: res.headers.get("set-cookie")?.split(";")[0] };
    }
    const user = await prisma.user.create({ data: { name: "Reset fixture", email: `${tag}@example.test`, password: hash, role: "ADMIN" } }); ids.push(user.id);
    const originalSession = await request("/auth/login", { email: user.email, password });
    async function issue(email = user.email) {
      let mail;
      const response = await requestPasswordReset(email, async message => { mail = message; });
      const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
      return { response, mail, token: url ? new URLSearchParams(new URL(url).hash.slice(1)).get("token") : null };
    }
    await t.test("one login endpoint accepts all existing role types", async () => {
      for (const role of ["EMPLOYEE", "HR_MANAGER", "HR_PAYROLL_USER", "HR_PAYROLL_MANAGER", "USER", "MANAGER"]) {
        const fixture = await prisma.user.create({ data: { name: `${role} fixture`, email: `${tag}-${role.toLowerCase()}@example.test`, password: hash, role } }); ids.push(fixture.id);
        const login = await request("/auth/login", { email: fixture.email, password }); assert.equal(login.status, 200, role); assert.equal(login.data.user.role, role);
        assert.equal((await request("/admin/users", undefined, login.cookie)).status, 403);
      }
      assert.equal(originalSession.status, 200);
    });
    await t.test("missing mail configuration has the same response for known and unknown emails", async () => {
      const smtp = process.env.SMTP_HOST; delete process.env.SMTP_HOST;
      try {
        const known = await request("/auth/forgot-password", { email: user.email }), unknown = await request("/auth/forgot-password", { email: `${tag}-missing@example.test` });
        assert.equal(known.status, 503); assert.deepEqual(known, unknown);
      } finally { if (smtp !== undefined) process.env.SMTP_HOST = smtp; }
    });
    await t.test("emails a random expiring token and never exposes it in the response or database", async () => {
      const known = await issue(), unknown = await issue(`${tag}-missing@example.test`);
      assert.deepEqual(known.response, unknown.response); assert.equal(unknown.mail, undefined); assert.match(known.token, /^[a-f0-9]{64}$/);
      const row = await prisma.passwordReset.findUnique({ where: { tokenHash: createHash("sha256").update(known.token).digest("hex") } });
      assert.ok(row); assert.ok(row.expiresAt > new Date()); assert.ok(row.expiresAt <= new Date(Date.now() + 30 * 60000));
      assert.equal(JSON.stringify(known.response).includes(known.token), false);
    });
    await t.test("resets once, preserves the role, and invalidates old passwords and sessions", async () => {
      const { token } = await issue();
      assert.equal((await request("/auth/reset-password", { token, password: "short" })).status, 400);
      assert.equal((await request("/auth/reset-password", { token: "0".repeat(64), password: nextPassword })).status, 400);
      const reset = await request("/auth/reset-password", { token, password: nextPassword }); assert.equal(reset.status, 200);
      assert.equal((await request("/auth/reset-password", { token, password })).status, 400);
      assert.equal((await request("/users/me", undefined, originalSession.cookie)).status, 401);
      assert.equal((await request("/auth/login", { email: user.email, password })).status, 401);
      const login = await request("/auth/login", { email: user.email, password: nextPassword }); assert.equal(login.status, 200); assert.equal(login.data.user.role, "ADMIN");
      assert.equal((await request("/users/me", undefined, login.cookie)).status, 200);
      assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).sessionVersion, 1);
    });
    await t.test("rejects expired links and serializes concurrent use of the same token", async () => {
      const expired = await issue();
      await prisma.passwordReset.updateMany({ where: { tokenHash: createHash("sha256").update(expired.token).digest("hex") }, data: { expiresAt: new Date(0) } });
      assert.equal((await request("/auth/reset-password", { token: expired.token, password })).status, 400);
      const current = await issue();
      const outcomes = await Promise.all([1, 2].map(() => request("/auth/reset-password", { token: current.token, password })));
      assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 400]);
      const disabled = await issue(); await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      assert.equal((await request("/auth/reset-password", { token: disabled.token, password: nextPassword })).status, 400);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
