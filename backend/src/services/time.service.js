import prisma from "../lib/prisma.js";
import { randomUUID } from "node:crypto";
import { D, addDays, applicableSchedule, audit, date, dateRange, dayKey, fail, json, localInstant, localParts, lockEmployee, scheduleDay } from "../lib/workspace.js";

export async function refreshDay(tx, employeeId, workDate) {
  const schedule = await applicableSchedule(tx, employeeId, workDate);
  const expected = scheduleDay(schedule, workDate);
  const existing = await tx.attendanceDay.findUnique({ where: { employeeId_workDate: { employeeId, workDate } }, include: { entries: { where: { voidedAt: null } } } });
  const entries = existing?.entries || [];
  const workedMinutes = entries.reduce((n, e) => n + (e.checkOut ? Math.max(0, Math.floor((e.checkOut - e.checkIn) / 60000) - e.breakMinutes) : 0), 0);
  const leave = await tx.leaveRequestDay.findMany({ where: { date: workDate, leaveRequest: { employeeId, status: "APPROVED" } } });
  const approvedLeaveMinutes = Math.round(leave.reduce((n, l) => n + Number(l.durationHours) * 60, 0));
  const first = [...entries].sort((a, b) => a.checkIn - b.checkIn)[0];
  const shiftStart = expected.lines.length ? localInstant(workDate, Math.min(...expected.lines.map(l => l.startMinute)), schedule.timezone) : null;
  const lateMinutes = first && shiftStart ? Math.max(0, Math.floor((first.checkIn - shiftStart) / 60000) - schedule.lateGraceMinutes) : 0;
  const status = entries.length ? "PRESENT" : approvedLeaveMinutes > 0 ? "ON_LEAVE" : expected.holiday ? "HOLIDAY" : expected.minutes ? "ABSENT" : "REST_DAY";
  const data = { workingScheduleId: schedule?.id || null, expectedMinutes: expected.minutes, workedMinutes, approvedLeaveMinutes, lateMinutes, overtimeMinutes: Math.max(0, workedMinutes - expected.minutes - (schedule?.overtimeThresholdMinutes || 0)), status, scheduleSnapshot: json(schedule || {}), calculatedAt: new Date() };
  return tx.attendanceDay.upsert({ where: { employeeId_workDate: { employeeId, workDate } }, create: { employeeId, workDate, ...data }, update: data });
}
export async function saveAttendance(input, actorId, id, { selfService = false } = {}) {
  return prisma.$transaction(async tx => {
    await lockEmployee(tx, input.employeeId);
    const before = id ? await tx.attendance.findUnique({ where: { id }, include: { day: true } }) : null;
    if (id && !before) fail("Attendance session not found.", 404);
    if (before?.voidedAt) fail("This attendance session has been removed.", 409);
    if (before && (before.day.employeeId !== input.employeeId || !input.reason)) fail("Corrections require the same employee and a reason.");
    const checkIn = date(input.checkIn), checkOut = input.checkOut ? date(input.checkOut) : null;
    if (checkIn > new Date() || (checkOut && checkOut > new Date())) fail("Attendance cannot be recorded in the future.");
    if (checkOut && ((checkOut - checkIn) > 48 * 3600000 || input.breakMinutes >= (checkOut - checkIn) / 60000)) fail("Session must be at most 48 hours, with breaks shorter than elapsed time.");
    if (!checkOut && input.breakMinutes) fail("Record breaks when closing the session.");
    const overlaps = await tx.attendance.count({ where: { voidedAt: null, id: { not: id || 0 }, day: { employeeId: input.employeeId }, ...(checkOut ? { checkIn: { lt: checkOut } } : {}), OR: [{ checkOut: null }, { checkOut: { gt: checkIn } }] } });
    if (overlaps) fail("This employee already has an overlapping or open attendance session.", 409);
    let workDate = date(dayKey(checkIn));
    let schedule = await applicableSchedule(tx, input.employeeId, workDate);
    if (!schedule) fail("Assign a working schedule or approved contract before recording attendance.");
    const local = localParts(checkIn, schedule.timezone);
    workDate = date(`${local.year}-${local.month}-${local.day}`);
    const priorDate = addDays(workDate, -1), prior = await applicableSchedule(tx, input.employeeId, priorDate);
    if (prior && scheduleDay(prior, priorDate).lines.some(l => l.endDayOffset && checkIn >= localInstant(priorDate, l.startMinute, prior.timezone) && checkIn < localInstant(priorDate, l.endMinute + 1440, prior.timezone))) workDate = priorDate;
    const day = await refreshDay(tx, input.employeeId, workDate);
    const data = { attendanceDayId: day.id, checkIn, checkOut, breakMinutes: input.breakMinutes, notes: input.notes };
    const item = id ? await tx.attendance.update({ where: { id }, data }) : await tx.attendance.create({ data: { ...data, source: selfService ? "SELF_SERVICE" : "MANUAL", createdById: actorId } });
    if (before) await tx.attendanceCorrection.create({ data: { attendanceId: id, previousCheckIn: before.checkIn, previousCheckOut: before.checkOut, correctedCheckIn: checkIn, correctedCheckOut: checkOut, previousBreakMinutes: before.breakMinutes, correctedBreakMinutes: input.breakMinutes, reason: input.reason, correctedById: actorId } });
    await refreshDay(tx, input.employeeId, workDate);
    if (before && dayKey(before.day.workDate) !== dayKey(workDate)) await refreshDay(tx, input.employeeId, before.day.workDate);
    await audit(tx, actorId, id ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_RECORDED", "Attendance", item.id);
    return json(item);
  }, { isolationLevel: "Serializable", timeout: 20000 });
}

export async function createAllocation(input, actorId, id) {
  return prisma.$transaction(async tx => {
    await lockEmployee(tx, input.employeeId);
    const type = await tx.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!type?.isActive) fail("Choose an active leave type.");
    if (id) {
      const before = await tx.leaveAllocation.findUnique({ where: { id }, include: { approvals: true } });
      if (!before) fail("Allocation not found.", 404);
      if (before.employeeId !== input.employeeId || before.status !== "SUBMITTED" || before.approvals.length) fail("Only undecided allocations for the same employee can be edited.", 409);
    }
    const data = { ...input, validFrom: date(input.validFrom), validUntil: input.validUntil ? date(input.validUntil) : null, unit: type.unit, approvalPolicy: type.allocationApprovalPolicy };
    const allocation = id ? await tx.leaveAllocation.update({ where: { id }, data }) : await tx.leaveAllocation.create({ data: { ...data, reference: `ALLOC-${randomUUID()}`, createdById: actorId, status: "SUBMITTED", submittedAt: new Date() } });
    await audit(tx, actorId, id ? "LEAVE_ALLOCATION_UPDATED" : "LEAVE_ALLOCATION_SUBMITTED", "LeaveAllocation", allocation.id);
    return json(allocation);
  });
}
async function consumeLeave(tx, request) {
  if (!request.policySnapshot.requiresAllocation) return;
  for (const day of request.days) {
    let remaining = D(request.unit === "HOURS" ? day.durationHours : day.durationDays);
    const allocations = await tx.leaveAllocation.findMany({ where: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, unit: request.unit, status: "APPROVED", validFrom: { lte: day.date }, OR: [{ validUntil: null }, { validUntil: { gte: day.date } }] }, include: { consumptions: { where: { releasedAt: null } } }, orderBy: [{ validUntil: { sort: "asc", nulls: "last" } }, { id: "asc" }] });
    for (const allocation of allocations) {
      const available = D(allocation.amount).minus(allocation.consumptions.reduce((n, c) => n.plus(c.amount), D()));
      if (available.lte(0)) continue;
      const amount = D(available.lt(remaining) ? available : remaining);
      await tx.leaveAllocationConsumption.create({ data: { allocationId: allocation.id, leaveRequestDayId: day.id, amount } });
      remaining = remaining.minus(amount);
      if (remaining.lte(0)) break;
    }
    if (remaining.gt(0)) fail(`Insufficient approved leave balance on ${dayKey(day.date)}. Add or approve an allocation first.`, 409);
  }
}
export async function createLeave(input, actorId, id) {
  return prisma.$transaction(async tx => {
    await lockEmployee(tx, input.employeeId);
    if (id) {
      const before = await tx.leaveRequest.findUnique({ where: { id }, include: { approvals: true } });
      if (!before) fail("Time-off request not found.", 404);
      if (before.employeeId !== input.employeeId || before.status !== "SUBMITTED" || before.approvals.length) fail("Only undecided requests for the same employee can be edited. Cancel approved leave to restore its balance.", 409);
    }
    const type = await tx.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!type?.isActive) fail("Choose an active leave type.");
    if (input.fraction === "0.5" && !type.allowHalfDay) fail("This leave type does not allow half days.");
    if (type.unit === "HOURS" && !input.hoursPerDay) fail("Enter hours per day for hourly leave.");
    const days = [];
    for (const day of dateRange(date(input.startDate), date(input.endDate))) {
      const schedule = await applicableSchedule(tx, input.employeeId, day);
      if (!schedule) fail(`No working schedule is assigned on ${dayKey(day)}.`);
      const info = scheduleDay(schedule, day);
      if (!info.minutes) { if (type.includeNonWorkingDays) fail("Leave including rest days requires a working interval; choose scheduled days or change the policy."); continue; }
      const durationHours = type.unit === "HOURS" ? D(input.hoursPerDay) : D(info.minutes).div(60).mul(input.fraction);
      if (durationHours.mul(60).gt(info.minutes)) fail("Leave hours exceed the scheduled working day.");
      const startMinute = Math.min(...info.lines.map(l => l.startMinute));
      const startAt = localInstant(day, startMinute, schedule.timezone);
      const lastEnd = Math.max(...info.lines.map(l => l.endMinute + l.endDayOffset * 1440));
      const endAt = input.fraction === "1" && type.unit === "DAYS" ? localInstant(day, lastEnd, schedule.timezone) : new Date(startAt.getTime() + durationHours.mul(3600000).toNumber());
      const overlap = await tx.leaveRequestDay.count({ where: { leaveRequest: { id: { not: id || 0 }, employeeId: input.employeeId, status: { in: ["SUBMITTED", "FIRST_APPROVED", "APPROVED"] } }, startAt: { lt: endAt }, endAt: { gt: startAt } } });
      if (overlap) fail(`Leave overlaps an existing request on ${dayKey(day)}.`, 409);
      days.push({ date: day, startAt, endAt, scheduledMinutes: info.minutes, durationHours, durationDays: durationHours.mul(60).div(info.minutes) });
    }
    if (!days.length) fail("The selected range contains no working days.");
    const durationDays = days.reduce((n, d) => n.plus(d.durationDays), D()), durationHours = days.reduce((n, d) => n.plus(d.durationHours), D());
    const data = { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId, startDate: date(input.startDate), endDate: date(input.endDate), unit: type.unit, duration: type.unit === "DAYS" ? durationDays : durationHours, durationDays, durationHours, approvalPolicy: type.requestApprovalPolicy, payrollTreatment: type.payrollTreatment, paidPercentage: type.paidPercentage, policySnapshot: json(type), reason: input.reason, days: { ...(id ? { deleteMany: {} } : {}), create: days } };
    const item = id ? await tx.leaveRequest.update({ where: { id }, data, include: { days: true } }) : await tx.leaveRequest.create({ data: { ...data, reference: `LEAVE-${randomUUID()}`, requestedById: actorId, status: "SUBMITTED", submittedAt: new Date() }, include: { days: true } });
    if (type.requestApprovalPolicy === "AUTOMATIC") { await consumeLeave(tx, item); await tx.leaveRequest.update({ where: { id: item.id }, data: { status: "APPROVED", approvedAt: new Date() } }); for (const day of days) await refreshDay(tx, input.employeeId, day.date); }
    await audit(tx, actorId, id ? "LEAVE_UPDATED" : "LEAVE_SUBMITTED", "LeaveRequest", item.id);
    return json(await tx.leaveRequest.findUnique({ where: { id: item.id }, include: { days: true } }));
  }, { isolationLevel: "Serializable", timeout: 30000 });
}

export async function decideLeave(name, id, action, actorId, reason, { pendingOnly = false } = {}) {
  if (!["approve", "refuse", "cancel"].includes(action)) fail("Invalid leave action.");
  if (["refuse", "cancel"].includes(action) && !reason?.trim()) fail("Provide a reason for this decision.");
  return prisma.$transaction(async tx => {
    const allocation = name === "allocations", model = allocation ? "leaveAllocation" : "leaveRequest";
    const initial = await tx[model].findUnique({ where: { id } });
    if (!initial) fail("Leave record not found.", 404);
    await lockEmployee(tx, initial.employeeId);
    const item = await tx[model].findUnique({ where: { id }, include: { approvals: true, ...(allocation ? { consumptions: true } : { days: true }) } });
    if (action === "cancel") {
      if (pendingOnly && !["SUBMITTED", "FIRST_APPROVED"].includes(item.status)) fail("This request has already been decided. Contact HR to change approved leave.", 409);
      if (["CANCELLED", "REFUSED"].includes(item.status)) fail("This record is already closed.", 409);
      if (allocation && item.consumptions.some(c => !c.releasedAt)) fail("Cancel consuming leave requests before cancelling their allocation.", 409);
      if (!allocation) await tx.leaveAllocationConsumption.updateMany({ where: { requestDay: { leaveRequestId: id }, releasedAt: null }, data: { releasedAt: new Date(), releaseReason: reason } });
      await tx[model].update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), ...(!allocation ? { cancellationReason: reason } : {}) } });
    } else {
      if (!["SUBMITTED", "FIRST_APPROVED"].includes(item.status)) fail("Only pending requests can be approved or refused.", 409);
      const step = item.status === "FIRST_APPROVED" ? 2 : 1;
      if (step === 2 && item.approvals.some(a => a.approverId === actorId && a.status === "APPROVED")) fail("The second approval must come from a different approver.", 409);
      const approved = action === "approve", final = item.approvalPolicy !== "TWO_LEVEL_APPROVAL" || step === 2;
      if (approved && final && !allocation) await consumeLeave(tx, item);
      await tx[allocation ? "leaveAllocationApproval" : "leaveRequestApproval"].create({ data: { [allocation ? "allocationId" : "leaveRequestId"]: id, step, status: approved ? "APPROVED" : "REFUSED", approverId: actorId, comment: reason, decidedAt: new Date() } });
      await tx[model].update({ where: { id }, data: { status: !approved ? "REFUSED" : final ? "APPROVED" : "FIRST_APPROVED", ...(!approved ? { refusedAt: new Date(), ...(!allocation ? { refusalReason: reason } : {}) } : final ? { approvedAt: new Date() } : {}) } });
    }
    if (!allocation) for (const day of item.days) await refreshDay(tx, item.employeeId, day.date);
    await audit(tx, actorId, `LEAVE_${allocation ? "ALLOCATION_" : ""}${action.toUpperCase()}`, model, id);
    return json(await tx[model].findUnique({ where: { id } }));
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
