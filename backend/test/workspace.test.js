import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import app from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { expression, validateSchedule } from "../src/lib/workspace.js";

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
    await t.test("approved contracts reject overlaps and preserve referenced schedules", async () => {
      const payload = { reference: tag, name: tag, employeeId: employee.id, departmentId: department.id, jobPositionId: position.id, employeeType: "FULL_TIME", startDate: "2026-09-01", wage: "30000", currency: "INR", salaryStructureId: structure.id, workingScheduleId: schedule.id, status: "OPEN" };
      contract = await create("contracts", payload);
      assert.equal((await request(root + "contracts", "POST", { ...payload, reference: tag + "OVERLAP" })).status, 409);
      assert.equal((await request(root + `schedules/${schedule.id}`, "PUT", schedulePayload)).status, 409);
      assert.equal((await request(root + `employees/${employee.id}`, "PUT", { employeeCode: tag, firstName: "Test", lastName: tag, employeeType: "FULL_TIME", hireDate: "2026-09-01", managerId: employee.id })).status, 400);
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
      const csv = await request(root + "reports/export?month=2026-09&currency=INR"); assert.equal(csv.status, 200); assert.match(csv.data, /Employer cost/);
      for (const name of ["departments", "positions", "employees", "contracts", "schedules", "assignments", "categories", "structures", "rules", "leave-types", "allocations", "leave", "attendance", "payruns", "payslips", "roles", "activity"]) assert.equal((await request(root + name)).status, 200, name);
      assert.equal((await request(root + "reports?month=wrong")).status, 400);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    const employees = { employeeId: { in: ids.employees } }, runs = { payrunId: { in: ids.runs } }, slips = { payslip: runs };
    await prisma.payrollPayment.deleteMany({ where: slips }); await prisma.payrollWarning.deleteMany({ where: runs });
    await prisma.payslipLine.deleteMany({ where: slips }); await prisma.payslipWorkedTime.deleteMany({ where: slips }); await prisma.payslipInput.deleteMany({ where: slips });
    await prisma.payslip.deleteMany({ where: runs }); await prisma.payrunEmployee.deleteMany({ where: runs }); await prisma.payrun.deleteMany({ where: { id: { in: ids.runs } } });
    await prisma.leaveAllocationConsumption.deleteMany({ where: { allocation: employees } }); await prisma.leaveRequestApproval.deleteMany({ where: { leaveRequest: employees } }); await prisma.leaveRequestDay.deleteMany({ where: { leaveRequest: employees } }); await prisma.leaveRequest.deleteMany({ where: employees }); await prisma.leaveAllocationApproval.deleteMany({ where: { allocation: employees } }); await prisma.leaveAllocation.deleteMany({ where: employees });
    await prisma.attendanceCorrection.deleteMany({ where: { attendance: { day: employees } } }); await prisma.attendance.deleteMany({ where: { day: employees } }); await prisma.attendanceException.deleteMany({ where: { day: employees } }); await prisma.attendanceDay.deleteMany({ where: employees });
    await prisma.employeeScheduleAssignment.deleteMany({ where: employees }); await prisma.contract.deleteMany({ where: employees }); await prisma.employmentHistory.deleteMany({ where: employees }); await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
    await prisma.salaryStructureRule.deleteMany({ where: { salaryStructureId: { in: ids.structures } } }); await prisma.salaryStructure.deleteMany({ where: { id: { in: ids.structures } } }); await prisma.salaryRule.deleteMany({ where: { id: { in: ids.rules } } }); await prisma.salaryRuleCategory.deleteMany({ where: { id: { in: ids.categories } } });
    await prisma.workingSchedule.deleteMany({ where: { id: { in: ids.schedules } } }); await prisma.leaveType.deleteMany({ where: { id: { in: ids.leaveTypes } } }); await prisma.jobPosition.deleteMany({ where: { id: { in: ids.positions } } }); await prisma.department.deleteMany({ where: { id: { in: ids.departments } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids.users } } }); await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.$disconnect();
  }
});
