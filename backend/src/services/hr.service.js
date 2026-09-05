import prisma from "../lib/prisma.js";
import { getSettings } from "./settings.service.js";
import { audit, date, dateRange, dayKey, fail, json, lockEmployee, applicableSchedule } from "../lib/workspace.js";
import { resource, archiveResource, detailResource } from "./workspace.service.js";
import { refreshDay, decideLeave } from "./time.service.js";

export const hrResources = new Set(["employees", "departments", "positions", "contracts", "schedules", "assignments", "attendance", "leave", "allocations", "leave-types"]);
const person = { select: { id: true, employeeCode: true, firstName: true, lastName: true } };
// Apply to nested contract/history snapshots too; the HR API never returns payroll setup or account links.
export function hrData(value) {
  const hidden = new Set(["salaryStructure", "salaryStructureId", "payFrequency", "userId", "policySnapshot", "scheduleSnapshot", "before", "after"]);
  function clean(v) { return Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([key]) => !hidden.has(key)).map(([key, child]) => [key, clean(child)])) : v; }
  return clean(json(value));
}
export async function hrLookups() {
  const [employees, departments, positions, schedules, leaveTypes, settings, cycles] = await Promise.all([
    prisma.employee.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, firstName: true, lastName: true, employeeCode: true }, orderBy: { firstName: "asc" } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.jobPosition.findMany({ where: { isActive: true }, orderBy: { title: "asc" } }),
    prisma.workingSchedule.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), getSettings(), prisma.hrReviewCycle.findMany({ select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  return hrData({ employees, departments, positions, schedules, leaveTypes, cycles, settings: { organizationName: settings.organizationName, supportEmail: settings.supportEmail, timezone: settings.timezone, defaultCurrency: settings.defaultCurrency } });
}
function period(month) { const start = date(`${month}-01`); return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) }; }
export async function hrDashboard({ month }) {
  const settings = await getSettings();
  const today = date(new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone }));
  const { start, end } = period(month);
  const dayWhere = { workDate: { gte: start, lt: end, lte: today } };
  const leaveWhere = { startDate: { lt: end }, endDate: { gte: start } };
  const [employees, activeEmployees, activeContracts, pendingLeave, leaveToday, days, departments, leave, attendance, missingCheckout] = await Promise.all([
    prisma.employee.count({ where: { status: { notIn: ["ARCHIVED", "TERMINATED"] } } }),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.contract.count({ where: { status: "OPEN", startDate: { lte: today }, AND: [{ OR: [{ endDate: null }, { endDate: { gte: today } }] }, { OR: [{ terminationDate: null }, { terminationDate: { gte: today } }] }] } }),
    prisma.leaveRequest.count({ where: { ...leaveWhere, status: { in: ["SUBMITTED", "FIRST_APPROVED"] } } }),
    prisma.leaveRequestDay.findMany({ where: { date: today, leaveRequest: { status: "APPROVED" } }, select: { leaveRequest: { select: { employeeId: true } } } }),
    prisma.attendanceDay.findMany({ where: dayWhere, select: { workDate: true, status: true, lateMinutes: true, overtimeMinutes: true, workedMinutes: true } }),
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true, _count: { select: { employees: { where: { status: { notIn: ["ARCHIVED", "TERMINATED"] } } } } } }, orderBy: { name: "asc" } }),
    prisma.leaveRequest.findMany({ where: { ...leaveWhere, status: { in: ["SUBMITTED", "FIRST_APPROVED"] } }, include: { employee: person, leaveType: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.attendanceDay.findMany({ where: dayWhere, include: { employee: person }, orderBy: { workDate: "desc" }, take: 6 }),
    prisma.attendance.count({ where: { day: dayWhere, checkOut: null, voidedAt: null } }),
  ]);
  const todayDays = await prisma.attendanceDay.findMany({ where: { workDate: today }, select: { status: true, lateMinutes: true } });
  const upcoming = await prisma.employee.findMany({ where: { status: { notIn: ["ARCHIVED", "TERMINATED"] } }, select: { id: true, firstName: true, lastName: true, hireDate: true, birthDate: true } });
  const until = new Date(+today + 30 * 86400000);
  const upcomingJoining = upcoming.filter(e => e.hireDate > today && e.hireDate <= until);
  const upcomingBirthdays = upcoming.filter(e => { if (!e.birthDate) return false; const next = new Date(Date.UTC(today.getUTCFullYear(), e.birthDate.getUTCMonth(), e.birthDate.getUTCDate())); if (next < today) next.setUTCFullYear(next.getUTCFullYear() + 1); return next <= until; }).map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));
  const present = days.filter(d => d.status === "PRESENT").length, absent = days.filter(d => d.status === "ABSENT").length;
  return hrData({ month, today, organizationName: settings.organizationName, updatedAt: new Date(),
    metrics: { presentToday: todayDays.filter(d => d.status === "PRESENT").length, absentToday: todayDays.filter(d => d.status === "ABSENT").length, lateToday: todayDays.filter(d => d.lateMinutes > 0).length, upcomingJoining: upcomingJoining.length, upcomingBirthdays: upcomingBirthdays.length, employees, activeEmployees, activeContracts, pendingLeave, employeesOnLeave: new Set(leaveToday.map(d => d.leaveRequest.employeeId)).size, present, absent, late: days.filter(d => d.lateMinutes > 0).length, overtimeMinutes: days.reduce((n, d) => n + d.overtimeMinutes, 0), workedMinutes: days.reduce((n, d) => n + d.workedMinutes, 0), missingCheckout, attendanceRate: present + absent ? Math.round(present / (present + absent) * 100) : null },
    departments: departments.map(d => ({ id: d.id, name: d.name, employees: d._count.employees })), leave, attendance,
    trend: dateRange(start, new Date(end.getTime() - 86400000)).map(day => { const rows = days.filter(d => dayKey(d.workDate) === dayKey(day)); return { date: dayKey(day), present: rows.filter(d => d.status === "PRESENT").length, absent: rows.filter(d => d.status === "ABSENT").length, leave: rows.filter(d => d.status === "ON_LEAVE").length }; }),
  });
}
export async function hrDetail(name, id) {
  const result = await detailResource(name, id);
  if (name === "employees") {
    const [contracts, assignments, history] = await Promise.all([
      prisma.contract.findMany({ where: { employeeId: id }, include: { workingSchedule: { select: { name: true } } }, orderBy: { startDate: "desc" } }),
      prisma.employeeScheduleAssignment.findMany({ where: { employeeId: id }, include: { workingSchedule: { select: { name: true } } }, orderBy: { startDate: "desc" } }),
      prisma.employmentHistory.findMany({ where: { employeeId: id }, select: { id: true, eventType: true, effectiveDate: true, reason: true }, orderBy: { effectiveDate: "desc" } }),
    ]);
    const settings = await getSettings();
    const today = date(new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone }));
    const currentSchedule = await applicableSchedule(prisma, id, today);
    return hrData({ ...result, contracts, assignments, history, currentSchedule: currentSchedule ? { id: currentSchedule.id, name: currentSchedule.name } : null });
  }
  return hrData(result);
}
export async function attendanceDays(query) {
  const { start, end } = period(query.month);
  const where = { workDate: { gte: start, lt: end }, ...(query.employeeId ? { employeeId: query.employeeId } : {}), ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.attendanceDay.findMany({ where, include: { employee: person }, orderBy: [{ workDate: "desc" }, { id: "desc" }], skip: (query.page - 1) * 20, take: 20 }), prisma.attendanceDay.count({ where }),
  ]);
  return hrData({ items, total, page: query.page, pageSize: 20 });
}
export async function rebuildAttendance(query, actorId) {
  const { start, end } = period(query.month), today = date(dayKey(new Date()));
  // Only completed calendar days can become an absence through this operation.
  const last = new Date(Math.min(end.getTime(), today.getTime()) - 86400000);
  if (last < start) fail("Choose a month with completed days.");
  const employees = await prisma.employee.findMany({ where: query.employeeId ? { id: query.employeeId } : { status: { in: ["ACTIVE", "ON_LEAVE", "ONBOARDING"] } }, select: { id: true, hireDate: true, terminationDate: true }, take: 201 });
  if (employees.length > 200) fail("Choose an employee filter to refresh attendance for a workspace with more than 200 employees.");
  let updated = 0;
  for (const employee of employees) await prisma.$transaction(async tx => {
    await lockEmployee(tx, employee.id);
    for (const day of dateRange(start, last)) if (day >= employee.hireDate && (!employee.terminationDate || day <= employee.terminationDate) && await applicableSchedule(tx, employee.id, day)) { await refreshDay(tx, employee.id, day); updated++; }
    await audit(tx, actorId, "ATTENDANCE_SUMMARY_REFRESHED", "Employee", employee.id, { month: query.month });
  }, { timeout: 30000 });
  return { updated };
}
export async function removeHrRecord(name, id, actorId, reason) {
  if (!reason?.trim()) fail("Provide a reason for removing this record.");
  if (["employees", "departments", "positions", "schedules", "leave-types"].includes(name)) return archiveResource(name, id, actorId);
  if (["leave", "allocations"].includes(name)) return decideLeave(name, id, "cancel", actorId, reason);
  return prisma.$transaction(async tx => {
    const model = resource(name).model;
    const before = await tx[model].findUnique({ where: { id }, ...(name === "attendance" ? { include: { day: true } } : {}) });
    if (!before) fail("Record not found.", 404);
    await lockEmployee(tx, name === "attendance" ? before.day.employeeId : before.employeeId);
    if (name === "attendance") {
      if (before.voidedAt) fail("This session is already removed.", 409);
      await tx.attendance.update({ where: { id }, data: { voidedAt: new Date() } });
      await refreshDay(tx, before.day.employeeId, before.day.workDate);
    } else if (name === "contracts") {
      if (await tx.payslip.count({ where: { contractId: id, status: { not: "CANCELLED" } } })) fail("This contract is part of recorded salary history. End the contract instead.", 409);
      await tx.contract.update({ where: { id }, data: { status: "CANCELLED", archivedAt: new Date() } });
    } else if (name === "assignments") {
      if (await tx.attendanceDay.count({ where: { employeeId: before.employeeId, workDate: { gte: before.startDate, ...(before.endDate ? { lte: before.endDate } : {}) } } })) fail("This assignment is part of attendance history. Keep it and create a new dated assignment.", 409);
      await tx.employeeScheduleAssignment.delete({ where: { id } });
    } else fail("Removal is not available for this record.", 405);
    await audit(tx, actorId, `${name.toUpperCase()}_REMOVED`, model, id, { reason });
    return { id, removed: true };
  }, { isolationLevel: "Serializable", timeout: 20000 });
}
