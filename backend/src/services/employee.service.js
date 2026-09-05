import prisma from "../lib/prisma.js";
import { D, applicableSchedule, audit, date, dateRange, dayKey, fail, json, localParts, lockEmployee, scheduleDay } from "../lib/workspace.js";
import { getSettings } from "./settings.service.js";
import { refreshDay, saveAttendance } from "./time.service.js";

export async function ownEmployee(userId, tx = prisma) {
  const employee = await tx.employee.findUnique({ where: { userId }, select: { id: true, status: true, hireDate: true, terminationDate: true } });
  if (!employee) fail("Your account is not linked to an employee profile. Ask your administrator to link your account.", 409);
  return employee;
}

export async function employeeDashboard(userId, month) {
  const owner = await ownEmployee(userId), employeeId = owner.id;
  const settings = await getSettings();
  const parts = localParts(new Date(), settings.timezone), today = date(`${parts.year}-${parts.month}-${parts.day}`);
  const start = date(`${month}-01`), end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const [profile, schedule, attendance, requests, allocations, leaveTypes, openSession] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, employeeCode: true, firstName: true, lastName: true, workEmail: true, workPhone: true, personalEmail: true, personalPhone: true, addressLine1: true, city: true, postalCode: true, emergencyContactName: true, emergencyContactPhone: true, employeeType: true, status: true, hireDate: true, workLocation: true, department: { select: { name: true } }, jobPosition: { select: { title: true } }, manager: { select: { firstName: true, lastName: true, workEmail: true } } } }),
    applicableSchedule(prisma, employeeId, today),
    prisma.attendanceDay.findMany({ where: { employeeId, workDate: { gte: start, lt: end, lte: today } }, include: { entries: { where: { voidedAt: null }, orderBy: { checkIn: "asc" }, select: { id: true, checkIn: true, checkOut: true, breakMinutes: true, source: true, notes: true } } }, orderBy: { workDate: "desc" } }),
    prisma.leaveRequest.findMany({ where: { employeeId, startDate: { lt: end }, endDate: { gte: start } }, select: { id: true, reference: true, startDate: true, endDate: true, duration: true, unit: true, status: true, reason: true, refusalReason: true, cancellationReason: true, leaveType: { select: { name: true } }, days: { where: { date: { gte: start, lt: end } }, select: { durationDays: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.leaveAllocation.findMany({ where: { employeeId }, include: { leaveType: { select: { name: true } }, consumptions: { where: { releasedAt: null }, select: { amount: true } } }, orderBy: { validFrom: "desc" } }),
    prisma.leaveType.findMany({ where: { isActive: true }, select: { id: true, name: true, unit: true, requiresAllocation: true, allowHalfDay: true, requestApprovalPolicy: true } }),
    prisma.attendance.findFirst({ where: { day: { employeeId }, checkOut: null, voidedAt: null }, select: { id: true, checkIn: true, breakMinutes: true } }),
  ]);
  const balances = allocations.map(a => {
    const taken = a.consumptions.reduce((sum, c) => sum.plus(c.amount), D());
    const available = a.status === "APPROVED" && a.validFrom <= today && (!a.validUntil || a.validUntil >= today);
    return { id: a.id, name: a.name, type: a.leaveType.name, unit: a.unit, allocated: a.amount, taken, remaining: D(a.amount).minus(taken), available, validFrom: a.validFrom, validUntil: a.validUntil, status: a.status };
  });
  const present = attendance.filter(d => d.status === "PRESENT").length, absent = attendance.filter(d => d.status === "ABSENT").length;
  return json({ profile, month, today, generatedAt: new Date(), settings: { organizationName: settings.organizationName, supportEmail: settings.supportEmail, timezone: settings.timezone },
    schedule: schedule ? { name: schedule.name, timezone: schedule.timezone, weeklyHours: schedule.lines.reduce((n, l) => n + l.endMinute + l.endDayOffset * 1440 - l.startMinute - l.breakMinutes, 0) / 60, lines: schedule.lines, todayMinutes: scheduleDay(schedule, today).minutes } : null,
    metrics: { presentDays: present, absentDays: absent, attendanceRate: present + absent ? Math.round(present / (present + absent) * 1000) / 10 : null, workedHours: attendance.reduce((n, d) => n + d.workedMinutes, 0) / 60, overtimeHours: attendance.reduce((n, d) => n + d.overtimeMinutes, 0) / 60, lateDays: attendance.filter(d => d.lateMinutes > 0).length, pendingRequests: requests.filter(r => ["SUBMITTED", "FIRST_APPROVED"].includes(r.status)).length, approvedLeaveDays: requests.filter(r => r.status === "APPROVED").reduce((n, r) => n + r.days.reduce((n, d) => n + Number(d.durationDays), 0), 0), availableDays: balances.filter(b => b.available && b.unit === "DAYS").reduce((n, b) => n.plus(b.remaining), D()), availableHours: balances.filter(b => b.available && b.unit === "HOURS").reduce((n, b) => n.plus(b.remaining), D()) },
    attendance: attendance.map(({ scheduleSnapshot, ...day }) => day), requests, balances, leaveTypes, openSession,
    trend: dateRange(start, new Date(end - 86400000)).map(d => ({ date: dayKey(d), hours: (attendance.find(a => dayKey(a.workDate) === dayKey(d))?.workedMinutes || 0) / 60 })),
  });
}

export async function employeeClock(userId, input) {
  const employee = await ownEmployee(userId);
  if (!["ACTIVE", "ONBOARDING", "ON_LEAVE"].includes(employee.status)) fail("Attendance is unavailable for your current employment status.", 403);
  if (input.action === "check-in") return saveAttendance({ employeeId: employee.id, checkIn: new Date().toISOString(), breakMinutes: 0 }, userId, undefined, { selfService: true });
  return prisma.$transaction(async tx => {
    await lockEmployee(tx, employee.id);
    const current = await tx.attendance.findFirst({ where: { day: { employeeId: employee.id }, checkOut: null, voidedAt: null }, include: { day: true } });
    if (!current) fail("You do not have an open attendance session.", 409);
    const now = new Date(), elapsed = (now - current.checkIn) / 60000;
    if (elapsed <= input.breakMinutes || elapsed > 48 * 60) fail("Breaks must be shorter than your session. Ask HR to correct sessions older than 48 hours.", 409);
    const saved = await tx.attendance.update({ where: { id: current.id }, data: { checkOut: now, breakMinutes: input.breakMinutes } });
    await refreshDay(tx, employee.id, current.day.workDate);
    await audit(tx, userId, "EMPLOYEE_CHECK_OUT", "Attendance", saved.id);
    return json(saved);
  }, { isolationLevel: "Serializable", timeout: 20000 });
}

export async function updateEmployeeContact(userId, input) {
  const employee = await ownEmployee(userId);
  return prisma.$transaction(async tx => {
    await tx.employee.update({ where: { id: employee.id }, data: input });
    await audit(tx, userId, "EMPLOYEE_CONTACT_UPDATED", "Employee", employee.id);
    return { id: employee.id };
  });
}
