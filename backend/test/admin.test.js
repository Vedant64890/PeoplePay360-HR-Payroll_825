import "dotenv/config";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import app from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { removeRole } from "../src/services/admin.service.js";
import { hashPassword } from "../src/lib/password.js";

test("admin authentication, authorization and workspace actions", async (t) => {
  const tag = `admin-test-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const password = randomBytes(18).toString("base64url");
  const hash = await hashPassword(password);
  const fixtureIds = [];
  let employeeId;
  let server;
  try {
    const admin = await prisma.user.create({ data: { name: "Admin test fixture", email: `${tag}@example.test`, password: hash, role: "ADMIN" } });
    fixtureIds.push(admin.id);
    const employee = await prisma.user.create({ data: { name: "Employee test fixture", email: `${tag}-employee@example.test`, password: hash, role: "EMPLOYEE" } });
    fixtureIds.push(employee.id);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, { method = "GET", body, cookie, origin = process.env.FRONTEND_URL || "http://localhost:3000" } = {}) => {
      const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], json: await response.json() };
    };
    let adminCookie;
    let employeeCookie;

    await t.test("anonymous requests cannot read the dashboard", async () => {
      assert.equal((await request("/admin/dashboard")).status, 401);
    });
    await t.test("employee credentials do not create an admin session", async () => {
      const denied = await request("/auth/admin/login", { method: "POST", body: { email: employee.email, password } });
      assert.equal(denied.status, 403); assert.equal(denied.cookie, undefined);
      const login = await request("/auth/login", { method: "POST", body: { email: employee.email, password } });
      employeeCookie = login.cookie;
      assert.equal((await request("/admin/users", { cookie: employeeCookie })).status, 403);
    });
    await t.test("valid admin receives an HTTP-only session and real dashboard data", async () => {
      const response = await fetch(base + "/auth/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: admin.email, password }) });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
      adminCookie = response.headers.get("set-cookie").split(";")[0];
      const dashboard = await request("/admin/dashboard?month=2026-09&currency=INR", { cookie: adminCookie });
      assert.equal(dashboard.status, 200); assert.equal(dashboard.json.data.trend.length, 6);
      assert.equal(dashboard.json.data.metrics.employees, await prisma.employee.count({ where: { status: { notIn: ["ARCHIVED", "TERMINATED"] } } }));
      assert.equal((await request("/admin/dashboard?month=invalid", { cookie: adminCookie })).status, 400);
    });
    await t.test("searchable accounts omit password hashes", async () => {
      const result = await request(`/admin/users?q=${tag}`, { cookie: adminCookie });
      assert.equal(result.status, 200); assert.equal(result.json.data.total, 2);
      assert.ok(result.json.data.items.every((user) => !Object.hasOwn(user, "password")));
    });
    await t.test("admins cannot disable themselves or change access cross-origin", async () => {
      assert.equal((await request(`/admin/users/${admin.id}`, { method: "PATCH", cookie: adminCookie, body: { isActive: false } })).status, 409);
      assert.equal((await request(`/admin/users/${employee.id}`, { method: "PATCH", cookie: adminCookie, origin: "https://untrusted.example", body: { role: "ADMIN" } })).status, 403);
    });
    await t.test("account creation is validated, audited and rejects duplicate email", async () => {
      const payload = { name: "Created account fixture", email: `${tag}-created@example.test`, password, role: "HR_MANAGER" };
      const result = await request("/admin/users", { method: "POST", cookie: adminCookie, body: payload });
      assert.equal(result.status, 201); fixtureIds.push(result.json.user.id);
      assert.equal(result.json.user.role, "HR_MANAGER"); assert.equal(result.json.user.password, undefined);
      assert.equal((await request("/admin/users", { method: "POST", cookie: adminCookie, body: payload })).status, 409);
      assert.equal(await prisma.auditLog.count({ where: { actorId: admin.id, action: "USER_CREATED" } }), 1);
    });
    await t.test("employee creation updates the searchable directory and employment history", async () => {
      const result = await request("/admin/employees", { method: "POST", cookie: adminCookie, body: { employeeCode: tag, firstName: "API", lastName: "Fixture", employeeType: "FULL_TIME", hireDate: "2026-09-01" } });
      assert.equal(result.status, 201); employeeId = result.json.employee.id;
      assert.equal((await request(`/admin/employees?q=${tag}`, { cookie: adminCookie })).json.data.total, 1);
      assert.equal(await prisma.employmentHistory.count({ where: { employeeId } }), 1);
    });
    await t.test("account deletion is authorized, audited and protects linked history", async () => {
      const disposable = await prisma.user.create({ data: { name: "Deletion fixture", email: `${tag}-delete@example.test`, password: hash, role: "EMPLOYEE" } }); fixtureIds.push(disposable.id);
      const login = await request("/auth/login", { method: "POST", body: { email: disposable.email, password } });
      const path = `/admin/users/${disposable.id}`;
      assert.equal((await request(path, { method: "DELETE" })).status, 401);
      assert.equal((await request(path, { method: "DELETE", cookie: employeeCookie })).status, 403);
      assert.equal((await request(path, { method: "DELETE", cookie: adminCookie, origin: "https://untrusted.example" })).status, 403);
      assert.equal((await request(`/admin/users/${admin.id}`, { method: "DELETE", cookie: adminCookie })).status, 409);
      assert.equal((await request("/admin/users/not-an-id", { method: "DELETE", cookie: adminCookie })).status, 400);
      await prisma.employee.update({ where: { id: employeeId }, data: { userId: disposable.id } });
      assert.equal((await request(path, { method: "DELETE", cookie: adminCookie })).status, 409);
      await prisma.employee.update({ where: { id: employeeId }, data: { userId: null } });
      const deletion = await request(path, { method: "DELETE", cookie: adminCookie }); assert.equal(deletion.status, 200, JSON.stringify(deletion.json));
      assert.equal(await prisma.user.findUnique({ where: { id: disposable.id } }), null);
      assert.equal((await request("/users/me", { cookie: login.cookie })).status, 401);
      assert.equal((await request(path, { method: "DELETE", cookie: adminCookie })).status, 404);
      const logged = await prisma.auditLog.findFirst({ where: { action: "USER_DELETED", entityId: String(disposable.id), actorId: admin.id } }); assert.ok(logged); assert.equal("password" in logged.before, false);
      const historical = await prisma.user.create({ data: { name: "History fixture", email: `${tag}-history@example.test`, password: hash, role: "EMPLOYEE" } }); fixtureIds.push(historical.id);
      await prisma.auditLog.create({ data: { actorId: historical.id, action: "TEST_HISTORY", entityType: "User", entityId: String(historical.id) } });
      assert.equal((await request(`/admin/users/${historical.id}`, { method: "DELETE", cookie: adminCookie })).status, 409);
    });
    await t.test("role deletion protects system and assigned roles and removes grants atomically", async () => {
      assert.equal((await request("/admin/workspace/roles/HR_MANAGER", { method: "DELETE", cookie: employeeCookie })).status, 403);
      for (const code of ["ADMIN", "USER", "EMPLOYEE"]) assert.equal((await request(`/admin/workspace/roles/${code}`, { method: "DELETE", cookie: adminCookie })).status, 409);
      assert.equal((await request("/admin/workspace/roles/INVALID", { method: "DELETE", cookie: adminCookie })).status, 400);
      const unused = await prisma.role.findFirst({ where: { code: { notIn: ["ADMIN", "USER"] }, users: { none: {} } } });
      assert.ok(unused, "An unused role is required for the rollback-only deletion test");
      const rollback = new Error("Rollback role deletion test");
      await assert.rejects(prisma.$transaction(async tx => {
        const result = await removeRole(tx, unused.code, admin.id); assert.equal(result.code, unused.code);
        assert.equal(await tx.role.findUnique({ where: { code: unused.code } }), null);
        assert.equal(await tx.rolePermission.count({ where: { role: unused.code } }), 0);
        assert.ok(await tx.auditLog.findFirst({ where: { action: "ROLE_DELETED", entityId: unused.code, actorId: admin.id } }));
        throw rollback;
      }), error => error === rollback);
      assert.ok(await prisma.role.findUnique({ where: { code: unused.code } }));
    });
    await t.test("disabling an account blocks its existing session and further login", async () => {
      assert.equal((await request(`/admin/users/${employee.id}`, { method: "PATCH", cookie: adminCookie, body: { isActive: false } })).status, 200);
      assert.equal((await request("/users/me", { cookie: employeeCookie })).status, 401);
      assert.equal((await request("/auth/login", { method: "POST", body: { email: employee.email, password } })).status, 403);
      await prisma.user.update({ where: { id: admin.id }, data: { isActive: false } });
      assert.equal((await request("/admin/dashboard", { cookie: adminCookie })).status, 401);
      assert.equal((await request("/auth/admin/login", { method: "POST", body: { email: admin.email, password } })).status, 403);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (employeeId) { await prisma.employmentHistory.deleteMany({ where: { employeeId } }); await prisma.employee.delete({ where: { id: employeeId } }); }
    await prisma.auditLog.deleteMany({ where: { actorId: { in: fixtureIds } } });
    await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } });
    await prisma.$disconnect();
  }
});
