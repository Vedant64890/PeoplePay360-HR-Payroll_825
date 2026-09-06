import "dotenv/config";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { generateToken } from "../src/lib/jwt.js";
import { addDays, applicableSchedule, dayKey } from "../src/lib/workspace.js";

test("schedule assignment edits preserve attendance and support dated schedule changes", { timeout: 60000 }, async t => {
  const tag = `ASSIGN${Date.now()}`, employeeIds = [], scheduleIds = [];
  const payrollFixture = {};
  let actor, server;
  try {
    actor = await prisma.user.create({ data: { name: tag, email: `${tag}@example.test`, password: randomUUID(), role: "ADMIN" } });
    for (let i = 0; i < 2; i++) {
      const employee = await prisma.employee.create({ data: { employeeCode: `${tag}-${i}`, firstName: tag, lastName: "Test", hireDate: new Date("2019-01-01") } });
      employeeIds.push(employee.id);
      const schedule = await prisma.workingSchedule.create({ data: { code: `${tag}-${i}`, name: `${tag} shift ${i}`, timezone: "Asia/Kolkata", lines: { create: { day: "MONDAY", sequence: 10, startMinute: 540 + i * 60, endMinute: 1080 + i * 60, breakMinutes: 60 } } } });
      scheduleIds.push(schedule.id);
    }
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`, token = generateToken(actor.id);
    async function request(path, method = "GET", body) {
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    }
    const root = "/admin/workspace/assignments";
    const payload = { employeeId: employeeIds[0], workingScheduleId: scheduleIds[0], startDate: "2020-01-01", endDate: null };
    const created = await request(root, "POST", payload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const attendance = await request("/admin/workspace/attendance", "POST", { employeeId: employeeIds[0], checkIn: "2020-01-06T03:30:00Z", checkOut: "2020-01-06T12:30:00Z", breakMinutes: 60 });
    assert.equal(attendance.status, 201, JSON.stringify(attendance.body));
    const recorded = await prisma.attendanceDay.findMany({ where: { employeeId: employeeIds[0] } });

    await t.test("all workspaces expose attendance dates and accept unchanged saves", async () => {
      for (const workspace of ["admin", "hr", "payroll"]) {
        const path = `/${workspace}/workspace/assignments/${id}`;
        const detail = await request(path);
        assert.equal(detail.status, 200, JSON.stringify(detail.body));
        assert.deepEqual(detail.body.data.attendanceHistory, { lastDate: "2020-01-06", nextStartDate: "2020-01-07" });
        const saved = await request(path, "PUT", payload);
        assert.equal(saved.status, 200, JSON.stringify(saved.body));
        assert.equal(saved.body.data.id, id);
      }
    });
    await t.test("end date can be set, extended, or cleared without removing attendance", async () => {
      for (const endDate of ["2020-01-06", "2020-01-31", null]) {
        const saved = await request(`${root}/${id}`, "PUT", { ...payload, endDate });
        assert.equal(saved.status, 200, JSON.stringify(saved.body));
        assert.equal(saved.body.data.endDate?.slice(0, 10) ?? null, endDate);
      }
    });
    await t.test("historical dates, employees, and retroactive schedule changes are protected", async () => {
      for (const change of [
        { endDate: "2020-01-05" }, { startDate: "2020-01-07" }, { employeeId: employeeIds[1] },
        { workingScheduleId: scheduleIds[1] }, { workingScheduleId: scheduleIds[1], effectiveDate: "2020-01-06" },
      ]) {
        const result = await request(`${root}/${id}`, "PUT", { ...payload, ...change });
        assert.equal(result.status, 409, JSON.stringify(result.body));
      }
      assert.equal((await request(`${root}/${id}`, "PUT", { ...payload, workingScheduleId: scheduleIds[1], effectiveDate: "2020-02-01", endDate: "2020-01-31" })).status, 400);
    });
    await t.test("overlapping schedule changes leave the original assignment intact", async () => {
      assert.equal((await request(`${root}/${id}`, "PUT", { ...payload, endDate: "2020-01-31" })).status, 200);
      const future = await request(root, "POST", { ...payload, startDate: "2020-02-01", endDate: "2020-02-28" });
      assert.equal(future.status, 201, JSON.stringify(future.body));
      const result = await request(`${root}/${id}`, "PUT", { ...payload, workingScheduleId: scheduleIds[1], effectiveDate: "2020-01-07", endDate: "2020-02-01" });
      assert.equal(result.status, 409); assert.match(result.body.message, /overlap/);
      const unchanged = await prisma.employeeScheduleAssignment.findUnique({ where: { id } });
      assert.equal(unchanged.workingScheduleId, scheduleIds[0]);
      assert.equal(unchanged.endDate.toISOString().slice(0, 10), "2020-01-31");
    });
    await t.test("saving a new schedule splits at the selected date and retains historical results", async () => {
      const result = await request(`${root}/${id}`, "PUT", { ...payload, workingScheduleId: scheduleIds[1], effectiveDate: "2020-01-07", endDate: "2020-01-31" });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.notEqual(result.body.data.id, id); assert.equal(result.body.data.previousAssignmentId, id);
      assert.equal(result.body.data.startDate.slice(0, 10), "2020-01-07");
      const previous = await prisma.employeeScheduleAssignment.findUnique({ where: { id } });
      assert.equal(previous.endDate.toISOString().slice(0, 10), "2020-01-06");
      assert.equal((await applicableSchedule(prisma, employeeIds[0], new Date("2020-01-06"))).id, scheduleIds[0]);
      assert.equal((await applicableSchedule(prisma, employeeIds[0], new Date("2020-01-07"))).id, scheduleIds[1]);
      assert.deepEqual(await prisma.attendanceDay.findMany({ where: { employeeId: employeeIds[0] } }), recorded);
      assert.equal(await prisma.auditLog.count({ where: { actorId: actor.id, action: "ASSIGNMENTS_CREATED", entityId: String(result.body.data.id) } }), 1);
    });
    await t.test("assignments without history remain directly editable", async () => {
      const fresh = await request(root, "POST", { ...payload, employeeId: employeeIds[1] });
      assert.equal(fresh.status, 201);
      const saved = await request(`${root}/${fresh.body.data.id}`, "PUT", { ...payload, employeeId: employeeIds[1], workingScheduleId: scheduleIds[1], startDate: "2020-01-10", endDate: "2020-01-20" });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.equal(saved.body.data.id, fresh.body.data.id); assert.equal(saved.body.data.workingScheduleId, scheduleIds[1]);
    });
    await t.test("extending an assignment cannot capture other recorded days", async () => {
      await prisma.attendanceDay.create({ data: { employeeId: employeeIds[1], workDate: new Date("2020-01-21"), workingScheduleId: scheduleIds[0] } });
      const fresh = await prisma.employeeScheduleAssignment.findFirst({ where: { employeeId: employeeIds[1] } });
      const result = await request(`${root}/${fresh.id}`, "PUT", { ...payload, employeeId: employeeIds[1], workingScheduleId: scheduleIds[1], startDate: "2020-01-10", endDate: null });
      assert.equal(result.status, 409); assert.match(result.body.message, /recorded attendance/);
      assert.match(result.body.message, /2020-01-21/);
      assert.match(result.body.message, /2020-01-22/);
    });
    const futureDate = addDays(new Date(dayKey(new Date())), 14);
    futureDate.setUTCDate(futureDate.getUTCDate() + (8 - futureDate.getUTCDay()) % 7);
    const futurePayload = { ...payload, employeeId: employeeIds[1], startDate: dayKey(addDays(futureDate, -2)), endDate: dayKey(addDays(futureDate, 1)) };
    let futureAssignment;
    await t.test("future absence summaries allow assignment creation and editing and are recalculated", async () => {
      await prisma.attendanceDay.create({ data: { employeeId: employeeIds[1], workDate: futureDate, workingScheduleId: scheduleIds[1], expectedMinutes: 999 } });
      const created = await request(root, "POST", futurePayload);
      assert.equal(created.status, 201, JSON.stringify(created.body)); futureAssignment = created.body.data;
      let day = await prisma.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId: employeeIds[1], workDate: futureDate } } });
      assert.equal(day.workingScheduleId, scheduleIds[0]); assert.equal(day.expectedMinutes, 480);
      assert.equal((await request(`${root}/${futureAssignment.id}`)).body.data.attendanceHistory, null);
      const saved = await request(`${root}/${futureAssignment.id}`, "PUT", { ...futurePayload, workingScheduleId: scheduleIds[1] });
      assert.equal(saved.status, 200, JSON.stringify(saved.body)); assert.equal(saved.body.data.id, futureAssignment.id);
      day = await prisma.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId: employeeIds[1], workDate: futureDate } } });
      assert.equal(day.workingScheduleId, scheduleIds[1]); assert.equal(day.status, "ABSENT");
    });
    await t.test("future approved leave remains protected", async () => {
      const where = { employeeId_workDate: { employeeId: employeeIds[1], workDate: futureDate } };
      await prisma.attendanceDay.update({ where, data: { approvedLeaveMinutes: 60 } });
      const saved = await request(`${root}/${futureAssignment.id}`, "PUT", futurePayload);
      assert.equal(saved.status, 409); assert.match(saved.body.message, new RegExp(dayKey(futureDate)));
      await prisma.attendanceDay.update({ where, data: { approvedLeaveMinutes: 0 } });
    });
    await t.test("future days used by computed payroll remain protected", async () => {
      payrollFixture.structure = await prisma.salaryStructure.create({ data: { code: tag, name: tag, currency: "INR", payFrequency: "CUSTOM" } });
      const periodKey = { startDate_endDate_frequency: { startDate: futureDate, endDate: futureDate, frequency: "CUSTOM" } };
      payrollFixture.period = await prisma.payrollPeriod.findUnique({ where: periodKey });
      if (!payrollFixture.period) {
        payrollFixture.period = await prisma.payrollPeriod.create({ data: { name: tag, ...periodKey.startDate_endDate_frequency } });
        payrollFixture.createdPeriod = true;
      }
      payrollFixture.run = await prisma.payrun.create({ data: { reference: tag, name: tag, payrollPeriodId: payrollFixture.period.id, salaryStructureId: payrollFixture.structure.id, currency: "INR", createdById: actor.id, idempotencyKey: randomUUID(), employees: { create: { employeeId: employeeIds[1] } } } });
      payrollFixture.slip = await prisma.payslip.create({ data: { number: tag, payrunId: payrollFixture.run.id, employeeId: employeeIds[1], payrollPeriodId: payrollFixture.period.id, salaryStructureId: payrollFixture.structure.id, employeeType: "FULL_TIME", periodStart: futureDate, periodEnd: futureDate, currency: "INR", status: "COMPUTED", workingScheduleId: scheduleIds[1], employeeSnapshot: {}, contractSnapshot: {}, scheduleSnapshot: {}, structureSnapshot: {} } });
      const saved = await request(`${root}/${futureAssignment.id}`, "PUT", futurePayload);
      assert.equal(saved.status, 409, JSON.stringify(saved.body));
      const day = await prisma.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId: employeeIds[1], workDate: futureDate } } });
      assert.equal(day.workingScheduleId, scheduleIds[1]);
      await prisma.payslip.update({ where: { id: payrollFixture.slip.id }, data: { status: "CANCELLED" } });
    });
    await t.test("shortening an unused future assignment refreshes days removed from its coverage", async () => {
      const saved = await request(`${root}/${futureAssignment.id}`, "PUT", { ...futurePayload, workingScheduleId: scheduleIds[1], endDate: dayKey(addDays(futureDate, -1)) });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const day = await prisma.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId: employeeIds[1], workDate: futureDate } } });
      assert.equal(day.workingScheduleId, null); assert.equal(day.expectedMinutes, 0); assert.equal(day.status, "REST_DAY");
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    const employees = { employeeId: { in: employeeIds } };
    if (payrollFixture.slip) await prisma.payslip.delete({ where: { id: payrollFixture.slip.id } });
    if (payrollFixture.run) {
      await prisma.payrunEmployee.deleteMany({ where: { payrunId: payrollFixture.run.id } });
      await prisma.payrun.delete({ where: { id: payrollFixture.run.id } });
    }
    if (payrollFixture.createdPeriod) await prisma.payrollPeriod.delete({ where: { id: payrollFixture.period.id } });
    if (payrollFixture.structure) await prisma.salaryStructure.delete({ where: { id: payrollFixture.structure.id } });
    await prisma.attendance.deleteMany({ where: { day: employees } });
    await prisma.attendanceDay.deleteMany({ where: employees });
    await prisma.employeeScheduleAssignment.deleteMany({ where: employees });
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    await prisma.workingSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
    if (actor) {
      await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
      await prisma.user.delete({ where: { id: actor.id } });
    }
    await prisma.$disconnect();
  }
});
