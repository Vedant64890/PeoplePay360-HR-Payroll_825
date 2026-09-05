import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import app from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { expression, validateSchedule } from "../src/lib/workspace.js";
import { getSettings, writeSettings } from "../src/services/settings.service.js";
import { settingsSchema } from "../src/validators/workspace.validator.js";

test("restricted salary arithmetic and overnight schedule validation", () => {
  assert.equal(expression("WAGE * 0.1 + (BONUS / 2)", { WAGE: "123.45", BONUS: "10" }).toString(), "17.345");
  for (const source of ["process.exit()", "WAGE.constructor", "1 / 0", "MISSING + 1", "1 +", "(1+2", "1;2"]) assert.throws(() => expression(source, { WAGE: 1 }));
  assert.throws(() => validateSchedule([{ day: "SUNDAY", startMinute: 1380, endMinute: 120, endDayOffset: 1, breakMinutes: 0 }, { day: "MONDAY", startMinute: 60, endMinute: 180, endDayOffset: 0, breakMinutes: 0 }]));
});

test("connected administrator HR and payroll workflows", { timeout: 180000 }, async t => {
  const tag = `T${Date.now()}`, password = randomUUID();
  const ids = { users: [], employees: [], departments: [], positions: [], schedules: [], categories: [], rules: [], structures: [], leaveTypes: [], runs: [] };
  let server, cookie;
  try {
    const admin = await prisma.user.create({ data: { name: tag, email: `${tag.toLowerCase()}@example.test`, password: await hashPassword(password), role: "ADMIN" } }); ids.users.push(admin.id);
    const low = await prisma.user.create({ data: { name: tag + " low", email: `${tag.toLowerCase()}-low@example.test`, password: await hashPassword(password), role: "EMPLOYEE" } }); ids.users.push(low.id);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, method = "GET", body, override = {}) {
      const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: process.env.FRONTEND_URL || "http://localhost:3000", ...(cookie ? { Cookie: cookie } : {}), ...override }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const content = response.headers.get("content-type") || "";
      return { status: response.status, data: content.includes("json") ? await response.json() : await response.text(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
    }
    const root = "/admin/workspace/";
    const create = async (name, payload, collection) => { const r = await request(root + name, "POST", payload); assert.equal(r.status, 201, JSON.stringify(r.data)); if (collection) ids[collection].push(r.data.data.id); return r.data.data; };
    let department, position, employee, schedule, basic, deduction, structure, contract, attendance, type, allocation, leave, run, slip;
    const schedulePayload = { code: tag, name: tag, timezone: "Asia/Kolkata", lines: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(day => ({ day, sequence: 10, startMinute: 540, endMinute: 1080, endDayOffset: 0, breakMinutes: 60 })) };
    await t.test("new endpoints require administrator authentication", async () => {
      assert.equal((await request(root + "contracts")).status, 401);
      const login = await request("/auth/login", "POST", { email: low.email, password });
      assert.equal((await request(root + "reports", "GET", undefined, { Cookie: login.cookie })).status, 403);
      const adminLogin = await request("/auth/admin/login", "POST", { email: admin.email, password }); cookie = adminLogin.cookie;
      assert.equal(adminLogin.status, 200);
      assert.equal((await request(root + "departments", "POST", { code: tag, name: tag }, { Origin: "https://invalid.test" })).status, 403);
    });
    await t.test("employee, schedule and salary configuration CRUD", async () => {
      department = await create("departments", { code: tag, name: tag }, "departments");
      position = await create("positions", { code: tag, title: tag, departmentId: department.id }, "positions");
      employee = await create("employees", { employeeCode: tag, firstName: "Test", lastName: tag, employeeType: "FULL_TIME", hireDate: "2026-09-01", departmentId: department.id, jobPositionId: position.id }, "employees");
      schedule = await create("schedules", schedulePayload, "schedules");
      const badSchedule = await request(root + "schedules", "POST", { ...schedulePayload, code: tag + "BAD", lines: [{ day: "MONDAY", sequence: 10, startMinute: 540, endMinute: 500, breakMinutes: 0 }] }); assert.equal(badSchedule.status, 400);
      const category = await create("categories", { code: tag + "B", name: tag + " basic", type: "BASIC" }, "categories");
      const dedCategory = await create("categories", { code: tag + "D", name: tag + " deduction", type: "DEDUCTION" }, "categories");
      basic = await create("rules", { code: tag + "B", name: "Basic", categoryId: category.id, effect: "EARNING", computationMethod: "FORMULA", formula: "WAGE" }, "rules");
      deduction = await create("rules", { code: tag + "D", name: "Test deduction", categoryId: dedCategory.id, effect: "DEDUCTION", computationMethod: "PERCENTAGE", percentageRate: "10", percentageBase: basic.code }, "rules");
      structure = await create("structures", { code: tag, name: tag, currency: "INR", rules: [{ salaryRuleId: basic.id, sequence: 10 }, { salaryRuleId: deduction.id, sequence: 20 }] }, "structures");
      const catalog = await request(root + "lookups"); assert.ok(catalog.data.data.employees.some(e => e.id === employee.id)); assert.ok(catalog.data.data.users.every(u => !u.password));
      assert.equal((await request(root + "employees?q=" + tag)).data.data.total, 1);
    });
    await t.test("workspace settings validate, persist and reject stale saves", async () => {
      assert.equal((await request(root + "settings", "GET", undefined, { Cookie: "" })).status, 401);
      const current = (await request(root + "settings")).data.data;
      assert.equal((await request(root + "settings", "PUT", { organizationName: tag, supportEmail: null, defaultCurrency: "INR", timezone: "Not/AZone", reportMonths: 6, version: current.version })).status, 400);
      const rollback = new Error("Rollback isolated settings test");
      await assert.rejects(prisma.$transaction(async tx => {
        const before = await getSettings(tx);
        const payload = settingsSchema.parse({ organizationName: tag, supportEmail: "help@example.test", defaultCurrency: "USD", timezone: "UTC", reportMonths: 12, version: before.version });
        const saved = await writeSettings(tx, payload, admin.id);
        assert.equal(saved.version, before.version + 1);
        assert.equal((await getSettings(tx)).organizationName, tag);
        await assert.rejects(writeSettings(tx, payload, admin.id), /updated elsewhere/);
        throw rollback;
      }), error => error === rollback);
      assert.equal((await request(root + "settings")).data.data.organizationName, current.organizationName);
    });
    await t.test("approved contracts reject overlaps and preserve referenced schedules", async () => {
      const payload = { reference: tag, name: tag, employeeId: employee.id, departmentId: department.id, jobPositionId: position.id, employeeType: "FULL_TIME", startDate: "2026-09-01", wage: "30000", currency: "INR", salaryStructureId: structure.id, workingScheduleId: schedule.id, status: "OPEN" };
      contract = await create("contracts", payload);
      assert.equal((await request(root + "contracts", "POST", { ...payload, reference: tag + "OVERLAP" })).status, 409);
      assert.equal((await request(root + `schedules/${schedule.id}`, "PUT", schedulePayload)).status, 409);
      assert.equal((await request(root + `employees/${employee.id}`, "PUT", { employeeCode: tag, firstName: "Test", lastName: tag, employeeType: "FULL_TIME", hireDate: "2026-09-01", managerId: employee.id })).status, 400);
    });
    await t.test("concurrent contract creation and activation cannot approve overlapping dates", async () => {
      const e = await create("employees", { employeeCode: tag + "CONCURRENT", firstName: "Contract", lastName: tag, employeeType: "FULL_TIME", hireDate: "2026-08-01" }, "employees");
      const payload = { name: tag, employeeId: e.id, departmentId: department.id, jobPositionId: position.id, employeeType: "FULL_TIME", startDate: "2026-08-01", endDate: "2026-08-31", wage: "31000", currency: "INR", salaryStructureId: structure.id, workingScheduleId: schedule.id, status: "OPEN" };
      const results = await Promise.all(["A", "B"].map(suffix => request(root + "contracts", "POST", { ...payload, reference: tag + "RACE" + suffix })));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409], JSON.stringify(results));
      assert.equal(await prisma.contract.count({ where: { employeeId: e.id, status: "OPEN" } }), 1);
      const draft = await create("contracts", { ...payload, reference: tag + "DRAFT", status: "DRAFT" });
      assert.equal((await request(root + `contracts/${draft.id}`, "PUT", { ...payload, reference: draft.reference })).status, 409);
      assert.equal((await request(root + `contracts/${draft.id}`, "PUT", { ...payload, reference: draft.reference, status: "DRAFT", employeeId: employee.id })).status, 409);
      assert.equal((await request(root + "contracts", "POST", { ...payload, reference: tag + "BOUNDARY", startDate: "2026-08-31", endDate: "2026-09-30" })).status, 409);
      await create("contracts", { ...payload, reference: tag + "NEXT", startDate: "2026-09-01", endDate: null });
    });
    await t.test("payroll selects historical contracts and blocks uncovered or multiple-contract periods", async () => {
      const cases = [
        { key: "HISTORY", status: "EXPIRED", endDate: "2026-08-31", expected: "COMPUTED", successor: true },
        { key: "TERMINATED", status: "TERMINATED", endDate: null, terminationDate: "2026-08-01", expected: "COMPUTED" },
        { key: "GAP", status: "TERMINATED", endDate: "2026-08-01", terminationDate: "2026-08-02", periodEnd: "2026-08-02", expected: "DRAFT", warning: /ends inside/ },
        { key: "CHANGE", status: "EXPIRED", endDate: "2026-08-31", successor: true, periodEnd: "2026-09-01", expected: "DRAFT", warning: /Multiple contracts/ },
        { key: "UNAPPROVED", status: "DRAFT", endDate: null, expected: "DRAFT", warning: /No approved contract/ },
      ];
      for (const c of cases) {
        const e = await create("employees", { employeeCode: tag + c.key, firstName: "Period", lastName: tag, employeeType: "FULL_TIME", hireDate: "2026-08-01" }, "employees");
        const payload = { reference: tag + c.key, name: tag, employeeId: e.id, departmentId: department.id, jobPositionId: position.id, employeeType: "FULL_TIME", startDate: "2026-08-01", endDate: c.endDate, terminationDate: c.terminationDate || null, terminationReason: c.terminationDate ? "Contract completed" : null, wage: "31000", currency: "INR", salaryStructureId: structure.id, workingScheduleId: schedule.id, status: c.status };
        const historical = await create("contracts", payload);
        if (c.successor) await create("contracts", { ...payload, reference: payload.reference + "NEW", startDate: "2026-09-01", endDate: null, wage: "62000", status: "OPEN" });
        const periodRun = await create("payruns", { name: tag + c.key, startDate: "2026-08-01", endDate: c.periodEnd || "2026-08-01", salaryStructureId: structure.id, employeeIds: [e.id], idempotencyKey: randomUUID() }, "runs");
        const result = await request(root + `payruns/${periodRun.id}/actions`, "POST", { action: "compute", version: periodRun.version });
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.equal(result.data.data.status, c.expected, JSON.stringify(result.data));
        if (c.warning) assert.match(result.data.data.warnings[0].message, c.warning);
        else {
          const calculated = await prisma.payslip.findUnique({ where: { payrunId_employeeId: { payrunId: periodRun.id, employeeId: e.id } } });
          assert.equal(calculated.contractId, historical.id);
          assert.equal(calculated.grossAmount.toString(), "1000");
        }
      }
    });
    await t.test("attendance records actual hours and audits corrections", async () => {
      const payload = { employeeId: employee.id, checkIn: "2026-09-01T03:30:00Z", checkOut: "2026-09-01T12:30:00Z", breakMinutes: 60 };
      attendance = await create("attendance", payload);
      assert.equal((await request(root + "attendance", "POST", payload)).status, 409);
      const result = await request(root + `attendance/${attendance.id}`, "PUT", { ...payload, reason: "Verified timesheet" }); assert.equal(result.status, 200, JSON.stringify(result.data));
      const detail = await request(root + `attendance/${attendance.id}`); assert.equal(detail.data.data.day.workedMinutes, 480); assert.equal(detail.data.data.corrections.length, 1);
    });
    await t.test("leave approvals consume allocation and cancellation restores it", async () => {
      type = await create("leave-types", { code: tag, name: tag, requiresAllocation: true }, "leaveTypes");
      allocation = await create("allocations", { employeeId: employee.id, leaveTypeId: type.id, name: tag, amount: "1", validFrom: "2026-09-01", validUntil: "2026-09-30" });
      assert.equal((await request(root + `allocations/${allocation.id}/actions`, "POST", { action: "approve" })).status, 200);
      leave = await create("leave", { employeeId: employee.id, leaveTypeId: type.id, startDate: "2026-09-02", endDate: "2026-09-02" });
      assert.equal((await request(root + `leave/${leave.id}/actions`, "POST", { action: "approve" })).status, 200);
      let balances = await request(root + "allocations?employeeId=" + employee.id); assert.equal(balances.data.data.items[0].remaining, "0");
      const second = await create("leave", { employeeId: employee.id, leaveTypeId: type.id, startDate: "2026-09-03", endDate: "2026-09-03" });
      assert.equal((await request(root + `leave/${second.id}/actions`, "POST", { action: "approve" })).status, 409);
      assert.equal((await request(root + `leave/${leave.id}/actions`, "POST", { action: "cancel", reason: "Plans changed" })).status, 200);
      balances = await request(root + "allocations?employeeId=" + employee.id); assert.equal(balances.data.data.items[0].remaining, "1");
    });
    await t.test("concurrent approvals cannot spend the same leave balance twice", async () => {
      const a = await create("leave", { employeeId: employee.id, leaveTypeId: type.id, startDate: "2026-09-07", endDate: "2026-09-07" });
      const b = await create("leave", { employeeId: employee.id, leaveTypeId: type.id, startDate: "2026-09-08", endDate: "2026-09-08" });
      const results = await Promise.all([a, b].map(r => request(root + `leave/${r.id}/actions`, "POST", { action: "approve" })));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const balance = (await request(root + "allocations?employeeId=" + employee.id)).data.data.items[0]; assert.equal(balance.remaining, "0");
      const approved = results[0].status === 200 ? a : b;
      assert.equal((await request(root + `leave/${approved.id}/actions`, "POST", { action: "cancel", reason: "Test cleanup" })).status, 200);
    });
    await t.test("two-step approval requires distinct administrators", async () => {
      const type2 = await create("leave-types", { code: tag + "TWO", name: tag + " two", requiresAllocation: false, requestApprovalPolicy: "TWO_LEVEL_APPROVAL" }, "leaveTypes");
      const request2 = await create("leave", { employeeId: employee.id, leaveTypeId: type2.id, startDate: "2026-09-10", endDate: "2026-09-10" });
      assert.equal((await request(root + `leave/${request2.id}/actions`, "POST", { action: "approve" })).data.data.status, "FIRST_APPROVED");
      assert.equal((await request(root + `leave/${request2.id}/actions`, "POST", { action: "approve" })).status, 409);
      const other = await prisma.user.create({ data: { name: tag + " second", email: `${tag.toLowerCase()}-second@example.test`, password: await hashPassword(password), role: "ADMIN" } }); ids.users.push(other.id);
      const login = await request("/auth/admin/login", "POST", { email: other.email, password });
      assert.equal((await request(root + `leave/${request2.id}/actions`, "POST", { action: "approve" }, { Cookie: login.cookie })).data.data.status, "APPROVED");
    });
    await t.test("payrun computes exact salary, validates and records payment once", async () => {
      const payload = { name: tag, startDate: "2026-09-01", endDate: "2026-09-01", salaryStructureId: structure.id, employeeIds: [employee.id], idempotencyKey: randomUUID() };
      run = await create("payruns", payload, "runs");
      assert.equal((await request(root + "payruns", "POST", payload)).data.data.id, run.id);
      assert.equal((await request(root + `payruns/${run.id}/actions`, "POST", { action: "validate", version: run.version })).status, 409);
      let r = await request(root + `payruns/${run.id}/actions`, "POST", { action: "compute", version: run.version }); assert.equal(r.status, 200, JSON.stringify(r.data)); run = r.data.data; assert.equal(run.status, "COMPUTED", JSON.stringify(run.warnings));
      slip = (await request(root + "payslips?employeeId=" + employee.id)).data.data.items[0]; assert.equal(slip.grossAmount, "1000"); assert.equal(slip.netAmount, "900");
      const correction = await request(root + `attendance/${attendance.id}`, "PUT", { employeeId: employee.id, checkIn: "2026-09-01T03:30:00Z", checkOut: "2026-09-01T12:30:00Z", breakMinutes: 60, reason: "Reverified after computation" }); assert.equal(correction.status, 200);
      assert.equal((await request(root + `payruns/${run.id}/actions`, "POST", { action: "validate", version: run.version })).status, 409);
      r = await request(root + `payruns/${run.id}/actions`, "POST", { action: "compute", version: run.version }); assert.equal(r.status, 200); run = r.data.data;
      r = await request(root + `payruns/${run.id}/actions`, "POST", { action: "validate", version: run.version }); assert.equal(r.status, 200, JSON.stringify(r.data)); run = r.data.data;
      assert.equal((await request(root + `payslips/${slip.id}/inputs`, "PUT", { inputs: [] })).status, 409);
      const payment = { action: "pay", version: run.version, method: "OTHER", externalReference: tag, idempotencyKey: randomUUID() };
      r = await request(root + `payruns/${run.id}/actions`, "POST", payment); assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal((await request(root + `payruns/${run.id}/actions`, "POST", payment)).status, 200);
      assert.equal(await prisma.payrollPayment.count({ where: { payslipId: slip.id } }), 1);
      const detail = (await request(root + `payslips/${slip.id}`)).data.data; assert.equal(detail.employeeSnapshot.employeeCode, tag); assert.equal(detail.lines.length, 2); assert.equal(detail.status, "PAID");
      assert.equal((await request(root + `payruns/${run.id}/actions`, "POST", { action: "compute", version: r.data.data.version })).status, 409);
    });
    await t.test("duplicate finalized payroll is rejected and reports use real payments", async () => {
      const duplicate = await create("payruns", { name: tag + " duplicate", startDate: "2026-09-01", endDate: "2026-09-01", salaryStructureId: structure.id, employeeIds: [employee.id], idempotencyKey: randomUUID() }, "runs");
      const computed = await request(root + `payruns/${duplicate.id}/actions`, "POST", { action: "compute", version: duplicate.version });
      assert.equal(computed.status, 200); assert.equal((await request(root + `payruns/${duplicate.id}/actions`, "POST", { action: "validate", version: computed.data.data.version })).status, 409);
      const report = await request(root + "reports?month=2026-09&currency=INR"); assert.equal(report.status, 200); assert.ok(report.data.data.departments.some(d => d.department === tag && d.net === "900"));
      const filtered = (await request(root + `reports?month=2026-09&currency=INR&departmentId=${department.id}&trendMonths=3`)).data.data;
      assert.equal(filtered.totals.net, "900.00"); assert.equal(filtered.payrollTrend.length, 3); assert.deepEqual(filtered.payrollTrend.map(p => p.month), ["2026-07", "2026-08", "2026-09"]);
      assert.equal(filtered.payrollTrend[0].net, "0.00"); assert.equal(filtered.payrollTrend[2].net, "900.00");
      assert.equal(filtered.attendanceTrend.length, 30); assert.equal(filtered.attendanceTrend[0].present, 1);
      assert.equal(filtered.attendanceTrend[0].workedHours, 8);
      const otherCurrency = (await request(root + `reports?month=2026-09&currency=USD&departmentId=${department.id}`)).data.data;
      assert.equal(otherCurrency.totals.net, "0.00"); assert.equal(otherCurrency.totals.paymentsRecorded, "0");
      assert.equal((await request(root + "reports?trendMonths=500")).status, 400);
      const csv = await request(root + "reports/export?month=2026-09&currency=INR"); assert.equal(csv.status, 200); assert.match(csv.data, /Employer cost/);
      for (const name of ["departments", "positions", "employees", "contracts", "schedules", "assignments", "categories", "structures", "rules", "leave-types", "allocations", "leave", "attendance", "payruns", "payslips", "roles", "activity"]) assert.equal((await request(root + name)).status, 200, name);
      assert.equal((await request(root + "reports?month=wrong")).status, 400);
    });
    await t.test("HR Manager permissions and connected HR operations", async t => {
      const hrUser = await prisma.user.create({ data: { name: tag + " HR", email: `${tag.toLowerCase()}-hr@example.test`, password: await hashPassword(password), role: "HR_MANAGER" } }); ids.users.push(hrUser.id);
      assert.equal((await request("/auth/hr/login", "POST", { email: low.email, password })).status, 403);
      const hrLogin = await request("/auth/hr/login", "POST", { email: hrUser.email, password }); assert.equal(hrLogin.status, 200);
      const hroot = "/hr/workspace/";
      const hr = (path, method = "GET", body) => request(path, method, body, { Cookie: hrLogin.cookie });
      const hcreate = async (name, body, bucket) => { const r = await hr(hroot + name, "POST", body); assert.equal(r.status, 201, JSON.stringify(r.data)); if (bucket) ids[bucket].push(r.data.data.id); return r.data.data; };
      let he, hs, hc, ht, ha, hl, at;
      await t.test("blocks every payroll/admin route and removes sensitive lookup fields", async () => {
        assert.equal((await request("/hr/dashboard?month=2026-09", "GET", undefined, { Cookie: "" })).status, 401);
        const lowLogin = await request("/auth/login", "POST", { email: low.email, password });
        assert.equal((await request(hroot + "employees", "GET", undefined, { Cookie: lowLogin.cookie })).status, 403);
        for (const name of ["payruns", "payslips", "structures", "rules", "categories", "users", "roles", "activity", "reports"]) {
          for (const method of ["GET", "POST", "PUT", "DELETE"]) assert.equal((await hr(hroot + name + (method === "PUT" || method === "DELETE" ? "/1" : ""), method, method === "GET" ? undefined : {})).status, 403, `${method} ${name}`);
          assert.equal((await hr(root + name)).status, 403);
        }
        assert.equal((await hr(`/admin/workspace/payslips/${slip.id}/inputs`, "PUT", { inputs: [] })).status, 403);
        assert.equal((await hr(`/admin/workspace/payruns/${run.id}/actions`, "POST", { action: "pay" })).status, 403);
        const settings = await hr(hroot + "settings");
        assert.equal(settings.status, 200);
        assert.deepEqual(Object.keys(settings.data.data).sort(), ["organizationName", "supportEmail", "timezone", "version"]);
        assert.equal((await hr(hroot + "settings", "PUT", { ...settings.data.data, defaultCurrency: "USD" })).status, 400);
        assert.equal((await hr(hroot + "settings", "PUT", { ...settings.data.data, timezone: "Invalid/Zone" })).status, 400);
        assert.equal((await request(hroot + "settings", "GET", undefined, { Cookie: lowLogin.cookie })).status, 403);
        const rollbackSettings = new Error("Rollback HR settings test");
        await assert.rejects(prisma.$transaction(async tx => {
          const before = await getSettings(tx);
          const input = { organizationName: tag + " HR", supportEmail: "hr@example.test", timezone: "UTC", version: before.version };
          const result = await writeSettings(tx, input, hrUser.id, true);
          assert.equal(result.organizationName, input.organizationName);
          assert.equal(result.timezone, "UTC");
          assert.equal(result.defaultCurrency, before.defaultCurrency);
          assert.equal(result.reportMonths, before.reportMonths);
          await assert.rejects(writeSettings(tx, input, hrUser.id, true), /updated elsewhere/);
          throw rollbackSettings;
        }), e => e === rollbackSettings);
        const catalog = (await hr(hroot + "lookups")).data.data;
        for (const key of ["users", "structures", "rules", "categories"]) assert.equal(key in catalog, false);
        const contractView = (await hr(hroot + `contracts/${contract.id}`)).data.data;
        assert.equal("salaryStructure" in contractView, false); assert.equal("salaryStructureId" in contractView, false);
        const dashboard = await hr("/hr/dashboard?month=2026-09"); assert.equal(dashboard.status, 200, JSON.stringify(dashboard.data));
        assert.equal("paidSalary" in dashboard.data.data.metrics, false); assert.equal("payruns" in dashboard.data.data, false);
        assert.equal((await request(hroot + "departments", "POST", { code: tag + "HR", name: "Cross origin" }, { Cookie: hrLogin.cookie, Origin: "https://invalid.test" })).status, 403);
      });
      await t.test("creates and edits employees, schedules, assignments and contracts without payroll setup", async () => {
        const employeeBody = { employeeCode: tag + "HR", firstName: "HR", lastName: tag, employeeType: "FULL_TIME", hireDate: "2026-09-01", departmentId: department.id, jobPositionId: position.id, managerId: employee.id };
        he = await hcreate("employees", employeeBody, "employees");
        assert.equal((await hr(hroot + `employees/${he.id}`, "PUT", { ...employeeBody, workLocation: "Chennai" })).status, 200);
        assert.equal((await hr(hroot + `employees/${he.id}`, "PUT", { ...employeeBody, userId: admin.id })).status, 403);
        hs = await hcreate("schedules", { ...schedulePayload, code: tag + "HR", name: tag + " HR" }, "schedules");
        assert.equal((await hr(hroot + `schedules/${hs.id}`, "PUT", { ...schedulePayload, code: tag + "HR", name: tag + " HR edited" })).status, 200);
        const assignment = await hcreate("assignments", { employeeId: he.id, workingScheduleId: hs.id, startDate: "2026-09-01" });
        assert.equal((await hr(hroot + `assignments/${assignment.id}`, "PUT", { employeeId: he.id, workingScheduleId: hs.id, startDate: "2026-09-01", endDate: "2026-09-30" })).status, 200);
        const contractBody = { reference: tag + "HR", name: "HR employment agreement", employeeId: he.id, departmentId: department.id, jobPositionId: position.id, employeeType: "FULL_TIME", startDate: "2026-09-01", wage: "25000", currency: "INR", workingScheduleId: hs.id, status: "OPEN" };
        hc = await hcreate("contracts", contractBody);
        assert.equal((await prisma.contract.findUnique({ where: { id: hc.id } })).salaryStructureId, null);
        assert.equal((await hr(hroot + `contracts/${hc.id}`, "PUT", { ...contractBody, wage: "28000" })).status, 200);
        assert.equal((await hr(hroot + `contracts/${hc.id}`, "PUT", { ...contractBody, salaryStructureId: structure.id })).status, 403);
        const profile = (await hr(hroot + `employees/${he.id}`)).data.data;
        assert.equal(profile.contracts.length, 1); assert.equal(profile.assignments.length, 1); assert.ok(profile.history.length >= 2); assert.equal(profile.currentSchedule.id, hs.id); assert.equal(profile.workLocation, "Chennai");
      });
      await t.test("HR operations persist reviews/documents and restrict review transitions and profile access", async () => {
        const cycle = await hcreate("review-cycles", { name: tag + " Review", startDate: "2026-09-01", endDate: "2026-09-30" });
        const reviewBody = { name: tag + " Performance", employeeId: he.id, reviewerId: employee.id, cycleId: cycle.id, goals: "Complete onboarding goals", status: "SELF_REVIEW" };
        let review = await hcreate("reviews", reviewBody);
        assert.equal((await hr(hroot + `reviews/${review.id}`, "PUT", { ...reviewBody, status: "FINAL", version: review.version })).status, 409);
        assert.equal((await hr(hroot + `reviews/${review.id}`, "PUT", { ...reviewBody, status: "MANAGER_REVIEW", version: review.version })).status, 400);
        let response = await hr(hroot + `reviews/${review.id}`, "PUT", { ...reviewBody, selfReview: "Goals achieved", status: "MANAGER_REVIEW", version: review.version });
        assert.equal(response.status, 200, JSON.stringify(response.data)); review = response.data.data;
        assert.equal((await hr(hroot + `reviews/${review.id}`, "PUT", { ...reviewBody, selfReview: "Goals achieved", status: "MANAGER_REVIEW", version: 1 })).status, 409);
        response = await hr(hroot + `reviews/${review.id}`, "PUT", { ...reviewBody, selfReview: "Goals achieved", managerReview: "Verified outcomes", rating: 4, status: "FINAL", version: review.version });
        assert.equal(response.status, 200, JSON.stringify(response.data));
        assert.equal((await hr(hroot + `reviews/${review.id}`, "PUT", { ...reviewBody, version: response.data.data.version })).status, 409);
        const doc = { name: tag + " Contract reference", employeeId: he.id, category: "EMPLOYMENT", url: "https://example.test/documents/contract" };
        assert.equal((await hr(hroot + "documents", "POST", { ...doc, url: "javascript:alert(1)" })).status, 400);
        const document = await hcreate("documents", doc);
        assert.equal((await hr(hroot + `documents/${document.id}`)).data.data.employee.id, he.id);
        assert.equal((await hr(hroot + "notifications")).status, 200);
        const report = await hr(hroot + "hr-reports?month=2026-09"); assert.equal(report.status, 200); assert.equal("paidSalary" in report.data.data.metrics, false);
        assert.equal((await hr(hroot + "holidays")).status, 200);
        assert.equal((await hr("/hr/profile", "PUT", { name: "Changed", role: "ADMIN" })).status, 400);
        const profile = await hr("/hr/profile", "PUT", { name: tag + " HR updated" }); assert.equal(profile.status, 200); assert.equal(profile.data.data.role, "HR_MANAGER");
        assert.equal((await request(hroot + "reviews", "GET", undefined, { Cookie: "" })).status, 401);
        assert.equal((await request(hroot + "reviews", "POST", reviewBody, { Cookie: hrLogin.cookie, Origin: "https://invalid.test" })).status, 403);
      });
      await t.test("records late/overtime, corrects and removes attendance without deleting its audit history", async () => {
        const body = { employeeId: he.id, checkIn: "2026-09-02T03:45:00Z", checkOut: "2026-09-02T13:00:00Z", breakMinutes: 60 };
        at = await hcreate("attendance", body);
        let detail = (await hr(hroot + `attendance/${at.id}`)).data.data;
        assert.equal(detail.day.workedMinutes, 495); assert.equal(detail.day.lateMinutes, 15); assert.equal(detail.day.overtimeMinutes, 15);
        assert.equal((await hr(hroot + `attendance/${at.id}`, "PUT", { ...body, checkOut: "2026-09-02T13:15:00Z", reason: "HR timesheet correction" })).status, 200);
        assert.equal((await hr(hroot + `attendance/${at.id}`, "DELETE", { reason: "Duplicate manual entry" })).status, 200);
        detail = (await hr(hroot + `attendance/${at.id}`)).data.data;
        assert.ok(detail.voidedAt); assert.equal(detail.corrections.length, 1); assert.equal(detail.day.status, "ABSENT");
        assert.equal((await hr(hroot + `attendance?employeeId=${he.id}`)).data.data.total, 0);
        await hcreate("attendance", body);
      });
      await t.test("edits pending leave, approves/refuses and restores balances on cancellation", async () => {
        ht = await hcreate("leave-types", { code: tag + "HR", name: "HR paid leave", requiresAllocation: true }, "leaveTypes");
        const allocationBody = { employeeId: he.id, leaveTypeId: ht.id, name: "HR allocation", amount: "2", validFrom: "2026-09-01", validUntil: "2026-09-30" };
        ha = await hcreate("allocations", allocationBody);
        assert.equal((await hr(hroot + `allocations/${ha.id}`, "PUT", { ...allocationBody, amount: "3" })).status, 200);
        assert.equal((await hr(hroot + `allocations/${ha.id}/actions`, "POST", { action: "approve" })).status, 200);
        const leaveBody = { employeeId: he.id, leaveTypeId: ht.id, startDate: "2026-09-03", endDate: "2026-09-03" };
        hl = await hcreate("leave", leaveBody);
        assert.equal((await hr(hroot + `leave/${hl.id}`, "PUT", { ...leaveBody, startDate: "2026-09-04", endDate: "2026-09-04" })).status, 200);
        assert.equal((await hr(hroot + `leave/${hl.id}/actions`, "POST", { action: "approve" })).status, 200);
        assert.equal((await hr(hroot + `allocations?employeeId=${he.id}`)).data.data.items[0].remaining, "2");
        assert.equal((await hr(hroot + `leave/${hl.id}`, "PUT", leaveBody)).status, 409);
        assert.equal((await hr(hroot + `leave/${hl.id}/actions`, "POST", { action: "cancel", reason: "Travel cancelled" })).status, 200);
        assert.equal((await hr(hroot + `allocations?employeeId=${he.id}`)).data.data.items[0].remaining, "3");
        const refused = await hcreate("leave", leaveBody);
        assert.equal((await hr(hroot + `leave/${refused.id}/actions`, "POST", { action: "refuse", reason: "Discuss alternate dates" })).status, 200);
        assert.equal((await hr(hroot + `leave?employeeId=${he.id}&status=REFUSED`)).data.data.total, 1);
        assert.equal((await hr(hroot + `leave/${refused.id}/actions`, "POST", { action: "approve" })).status, 409);
        const twoType = await hcreate("leave-types", { code: tag + "HRTWO", name: "Two approvals", requiresAllocation: false, requestApprovalPolicy: "TWO_LEVEL_APPROVAL" }, "leaveTypes");
        const two = await hcreate("leave", { ...leaveBody, leaveTypeId: twoType.id });
        assert.equal((await hr(hroot + `leave/${two.id}/actions`, "POST", { action: "approve" })).data.data.status, "FIRST_APPROVED");
        assert.equal((await hr(hroot + `leave/${two.id}/actions`, "POST", { action: "approve" })).status, 409);
        assert.equal((await request(hroot + `leave/${two.id}/actions`, "POST", { action: "approve" })).data.data.status, "APPROVED");
      });
      await t.test("refreshes daily absence summaries, archives HR records and revokes disabled sessions", async () => {
        const rebuilt = await hr(hroot + "attendance-days/recalculate", "POST", { month: "2026-09", employeeId: he.id }); assert.equal(rebuilt.status, 200, JSON.stringify(rebuilt.data));
        const days = await hr(hroot + `attendance-days?month=2026-09&employeeId=${he.id}`); assert.equal(days.status, 200); assert.ok(days.data.data.items.some(d => d.status === "ABSENT"));
        const summary = await hr("/hr/dashboard?month=2026-09"); assert.equal(summary.status, 200); assert.equal(summary.data.data.trend.length, 30); assert.ok(summary.data.data.metrics.activeContracts >= 1);
        assert.equal((await hr(hroot + `contracts/${hc.id}`, "DELETE", { reason: "Agreement replaced" })).status, 200);
        assert.equal((await hr(hroot + `employees/${he.id}`, "DELETE", { reason: "Archived employee" })).status, 200);
        assert.equal((await hr(hroot + `employees/${he.id}`)).data.data.status, "ARCHIVED");
        assert.equal((await hr(hroot + `schedules/${hs.id}/actions`, "POST", { action: "archive" })).status, 200);
        await prisma.user.update({ where: { id: hrUser.id }, data: { isActive: false } });
        assert.equal((await hr(hroot + "employees")).status, 401);
      });
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    const employees = { employeeId: { in: ids.employees } }, runs = { payrunId: { in: ids.runs } }, slips = { payslip: runs };
    await prisma.payrollPayment.deleteMany({ where: slips }); await prisma.payrollWarning.deleteMany({ where: runs });
    await prisma.payslipLine.deleteMany({ where: slips }); await prisma.payslipWorkedTime.deleteMany({ where: slips }); await prisma.payslipInput.deleteMany({ where: slips });
    await prisma.payslip.deleteMany({ where: runs }); await prisma.payrunEmployee.deleteMany({ where: runs }); await prisma.payrun.deleteMany({ where: { id: { in: ids.runs } } });
    await prisma.leaveAllocationConsumption.deleteMany({ where: { allocation: employees } }); await prisma.leaveRequestApproval.deleteMany({ where: { leaveRequest: employees } }); await prisma.leaveRequestDay.deleteMany({ where: { leaveRequest: employees } }); await prisma.leaveRequest.deleteMany({ where: employees }); await prisma.leaveAllocationApproval.deleteMany({ where: { allocation: employees } }); await prisma.leaveAllocation.deleteMany({ where: employees });
    await prisma.attendanceCorrection.deleteMany({ where: { attendance: { day: employees } } }); await prisma.attendance.deleteMany({ where: { day: employees } }); await prisma.attendanceException.deleteMany({ where: { day: employees } }); await prisma.attendanceDay.deleteMany({ where: employees });
    await prisma.hrReview.deleteMany({ where: { employeeId: { in: ids.employees } } }); await prisma.hrDocument.deleteMany({ where: { employeeId: { in: ids.employees } } }); await prisma.hrReviewCycle.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employeeScheduleAssignment.deleteMany({ where: employees }); await prisma.contract.deleteMany({ where: employees }); await prisma.employmentHistory.deleteMany({ where: employees }); await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
    await prisma.salaryStructureRule.deleteMany({ where: { salaryStructureId: { in: ids.structures } } }); await prisma.salaryStructure.deleteMany({ where: { id: { in: ids.structures } } }); await prisma.salaryRule.deleteMany({ where: { id: { in: ids.rules } } }); await prisma.salaryRuleCategory.deleteMany({ where: { id: { in: ids.categories } } });
    await prisma.workingSchedule.deleteMany({ where: { id: { in: ids.schedules } } }); await prisma.leaveType.deleteMany({ where: { id: { in: ids.leaveTypes } } }); await prisma.jobPosition.deleteMany({ where: { id: { in: ids.positions } } }); await prisma.department.deleteMany({ where: { id: { in: ids.departments } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids.users } } }); await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.$disconnect();
  }
});
