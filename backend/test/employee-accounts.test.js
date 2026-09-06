import "dotenv/config";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

test("employee directories follow Employee workspace accounts", { timeout: 60000 }, async t => {
  const tag = `acct${Date.now()}`, password = randomUUID(), userIds = [], employeeIds = [];
  let server;
  try {
    const hash = await hashPassword(password);
    const admin = await prisma.user.create({ data: { name: tag, email: `${tag}-admin@example.test`, password: hash, role: "ADMIN" } });
    userIds.push(admin.id);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    let cookie;
    async function request(path, method = "GET", body, session = cookie) {
      const response = await fetch(base + path, { method, headers: {
        "Content-Type": "application/json", Origin: process.env.FRONTEND_URL || "http://localhost:3000", ...(session ? { Cookie: session } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
    }
    cookie = (await request("/auth/admin/login", "POST", { email: admin.email, password })).cookie;
    let user, profile;
    await t.test("creating an Employee account creates one usable, audited profile", async () => {
      const result = await request("/admin/users", "POST", { name: tag, email: `${tag}-employee@example.test`, password, role: "EMPLOYEE" });
      assert.equal(result.status, 201); user = result.body.user; userIds.push(user.id);
      assert.equal(user.password, undefined);
      profile = await prisma.employee.findUnique({ where: { userId: user.id } }); employeeIds.push(profile.id);
      assert.equal(profile.firstName, tag); assert.equal(profile.lastName, "");
      assert.equal(profile.workEmail, user.email); assert.equal(profile.status, "ONBOARDING");
      assert.equal(await prisma.employmentHistory.count({ where: { employeeId: profile.id } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { actorId: admin.id, action: "EMPLOYEE_CREATED", entityId: String(profile.id) } }), 1);
      const login = await request("/auth/login", "POST", { email: user.email, password });
      assert.equal((await request("/employee/dashboard?month=2026-09", "GET", undefined, login.cookie)).status, 200);
      assert.equal((await request(`/admin/users/${user.id}`, "PATCH", { isActive: true })).status, 200);
      assert.equal(await prisma.employee.count({ where: { userId: user.id } }), 1);
    });
    await t.test("unlinked and other-role profiles are excluded across workspaces", async () => {
      for (const userId of [null, admin.id]) {
        const orphan = await prisma.employee.create({ data: { employeeCode: `${tag}-${userId || "NONE"}`, firstName: tag, lastName: "Legacy", userId, hireDate: new Date("2026-09-01") } });
        employeeIds.push(orphan.id);
      }
      for (const path of ["/admin/employees", "/admin/workspace/employees", "/hr/workspace/employees", "/payroll/workspace/employees"]) {
        const result = await request(`${path}?q=${tag}`);
        assert.equal(result.status, 200, path); assert.equal(result.body.data.total, 1, path);
        assert.equal(result.body.data.items[0].id, profile.id);
      }
      for (const path of ["/admin/workspace/lookups", "/hr/workspace/lookups", "/payroll/workspace/lookups"]) {
        const result = await request(path); assert.equal(result.status, 200, path);
        const fixtures = result.body.data.employees.filter(e => employeeIds.includes(e.id));
        assert.deepEqual(fixtures.map(e => e.id), [profile.id], path);
      }
      const dashboard = await request("/admin/dashboard?month=2026-09");
      assert.equal(dashboard.body.data.metrics.employees, await prisma.employee.count({ where: { user: { is: { role: "EMPLOYEE" } }, status: { notIn: ["ARCHIVED", "TERMINATED"] } } }));
    });
    await t.test("creation without an Employee account and unlinking are rejected", async () => {
      const payload = { employeeCode: `${tag}-INVALID`, firstName: "Invalid", lastName: "Profile", employeeType: "FULL_TIME", hireDate: "2026-09-01" };
      for (const path of ["/admin/employees", "/admin/workspace/employees", "/hr/workspace/employees", "/payroll/workspace/employees"]) assert.equal((await request(path, "POST", payload)).status, 400, path);
      assert.equal((await request("/admin/workspace/employees", "POST", { ...payload, userId: admin.id })).status, 400);
      assert.equal((await request("/admin/workspace/employees", "POST", { ...payload, userId: user.id })).status, 409);
      const update = { ...payload, employeeCode: profile.employeeCode, firstName: profile.firstName, lastName: "", status: "ONBOARDING" };
      assert.equal((await request(`/admin/workspace/employees/${profile.id}`, "PUT", { ...update, userId: null })).status, 400);
      for (const prefix of ["/admin", "/hr", "/payroll"]) assert.equal((await request(`${prefix}/workspace/employees/${profile.id}`, "PUT", update)).status, 200, prefix);
      assert.equal((await prisma.employee.findUnique({ where: { id: profile.id } })).userId, user.id);
    });
    await t.test("role changes update visibility without duplicating or deleting employment history", async () => {
      assert.equal((await request(`/admin/users/${user.id}`, "PATCH", { role: "HR_MANAGER" })).status, 200);
      assert.equal((await request(`/admin/workspace/employees?q=${tag}`)).body.data.total, 0);
      assert.ok(await prisma.employee.findUnique({ where: { id: profile.id } }));
      assert.equal((await request(`/admin/users/${user.id}`, "PATCH", { role: "EMPLOYEE" })).status, 200);
      assert.equal((await request(`/admin/workspace/employees?q=${tag}`)).body.data.total, 1);
      assert.equal(await prisma.employee.count({ where: { userId: user.id } }), 1);
      assert.equal((await request(`/admin/users/${user.id}`, "PATCH", { isActive: false })).status, 200);
      assert.equal((await request(`/admin/workspace/employees?q=${tag}`)).body.data.total, 1);
    });
    await t.test("an existing unlinked profile is linked by its work email", async () => {
      const email = `${tag}-existing@example.test`;
      const existing = await prisma.employee.create({ data: { employeeCode: `${tag}-EXISTING`, firstName: "Existing", lastName: tag, workEmail: email, hireDate: new Date("2025-01-01"), status: "ACTIVE" } }); employeeIds.push(existing.id);
      const result = await request("/admin/users", "POST", { name: `Existing ${tag}`, email, password, role: "EMPLOYEE" });
      assert.equal(result.status, 201); userIds.push(result.body.user.id);
      const linked = await prisma.employee.findUnique({ where: { userId: result.body.user.id } });
      assert.equal(linked.id, existing.id); assert.equal(linked.hireDate.toISOString(), existing.hireDate.toISOString());
      assert.equal(linked.status, "ACTIVE");
    });
    await t.test("assigning the Employee role provisions a missing profile", async () => {
      const result = await request("/admin/users", "POST", { name: `New role ${tag}`, email: `${tag}-role@example.test`, password, role: "HR_MANAGER" });
      assert.equal(result.status, 201); userIds.push(result.body.user.id);
      assert.equal(await prisma.employee.findUnique({ where: { userId: result.body.user.id } }), null);
      assert.equal((await request(`/admin/users/${result.body.user.id}`, "PATCH", { role: "EMPLOYEE" })).status, 200);
      assert.ok(await prisma.employee.findUnique({ where: { userId: result.body.user.id } }));
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    const employees = { OR: [{ id: { in: employeeIds } }, { userId: { in: userIds } }] };
    await prisma.employmentHistory.deleteMany({ where: { employee: employees } });
    await prisma.employee.deleteMany({ where: employees });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});
