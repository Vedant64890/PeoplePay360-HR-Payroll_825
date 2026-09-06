import { addDays, audit, date, dayKey, fail, json, lockEmployee } from "../lib/workspace.js";
import { getSettings } from "./settings.service.js";
import { refreshDay } from "./time.service.js";

async function protectedAttendance(tx, employeeId) {
  const settings = await getSettings(tx);
  const today = date(new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone }));
  const payroll = await tx.payslip.findMany({ where: { employeeId, status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { periodStart: true, periodEnd: true } });
  return { OR: [
    { workDate: { lte: today } },
    { entries: { some: { voidedAt: null } } },
    { approvedLeaveMinutes: { gt: 0 } },
    ...payroll.map(period => ({ workDate: { gte: period.periodStart, lte: period.periodEnd } })),
  ] };
}

export async function assignmentAttendanceHistory(tx, assignment, protection) {
  const latest = await tx.attendanceDay.findFirst({
    where: { employeeId: assignment.employeeId, workDate: { gte: assignment.startDate, ...(assignment.endDate ? { lte: assignment.endDate } : {}) }, AND: [protection || await protectedAttendance(tx, assignment.employeeId)] },
    orderBy: { workDate: "desc" }, select: { workDate: true },
  });
  return latest ? { lastDate: dayKey(latest.workDate), nextStartDate: dayKey(addDays(latest.workDate, 1)) } : null;
}

export async function saveScheduleAssignment(tx, input, actorId, id) {
  await lockEmployee(tx, input.employeeId);
  const before = id ? await tx.employeeScheduleAssignment.findUnique({ where: { id } }) : null;
  if (id && !before) fail("Record not found.", 404);
  if (before && before.employeeId !== input.employeeId) fail("Keep the same employee when editing a schedule assignment.", 409);
  const data = {
    employeeId: input.employeeId, workingScheduleId: input.workingScheduleId, startDate: date(input.startDate),
    endDate: input.endDate === undefined ? before?.endDate ?? null : input.endDate ? date(input.endDate) : null,
  };
  const scheduleChanged = before && before.workingScheduleId !== data.workingScheduleId;
  const schedule = await tx.workingSchedule.findUnique({ where: { id: data.workingScheduleId } });
  if (!schedule || (!schedule.isActive && (!before || scheduleChanged))) fail("Choose an active working schedule.");
  const protection = await protectedAttendance(tx, data.employeeId);
  const history = before ? await assignmentAttendanceHistory(tx, before, protection) : null;
  const effectiveDate = input.effectiveDate ? date(input.effectiveDate) : null;
  if (effectiveDate && (!before || !scheduleChanged)) fail("Apply changes from is only available when changing an existing assignment's schedule.");
  if (history) {
    if (dayKey(data.startDate) !== dayKey(before.startDate)) fail("Keep the original start date to preserve attendance. Use Apply changes from to start a new schedule.", 409);
    if (scheduleChanged && (!effectiveDate || effectiveDate <= date(history.lastDate))) fail(`Attendance is recorded through ${history.lastDate}. Apply the new schedule from ${history.nextStartDate} or later.`, 409);
    if (!scheduleChanged && data.endDate && data.endDate < date(history.lastDate)) fail(`End date must be ${history.lastDate} or later to preserve recorded attendance.`, 409);
  }
  if (effectiveDate) {
    if (effectiveDate < data.startDate) fail("Apply changes from must be on or after the original start date.");
    data.startDate = effectiveDate;
  }
  if (data.endDate && data.endDate < data.startDate) fail("Assignment end must be on or after its start.");
  const split = !!(history && scheduleChanged);
  // Newly covered recorded days must retain their existing schedule as well.
  const addedRanges = !before || split || scheduleChanged
    ? [{ gte: data.startDate, ...(data.endDate ? { lte: data.endDate } : {}) }]
    : [
      ...(data.startDate < before.startDate ? [{ gte: data.startDate, lt: before.startDate }] : []),
      ...(before.endDate && (!data.endDate || data.endDate > before.endDate) ? [{ gt: before.endDate, ...(data.endDate ? { lte: data.endDate } : {}) }] : []),
    ];
  const conflict = addedRanges.length ? await tx.attendanceDay.findFirst({ where: { employeeId: data.employeeId, OR: addedRanges.map(workDate => ({ workDate })), AND: [protection] }, orderBy: { workDate: "desc" }, select: { workDate: true } }) : null;
  if (conflict) fail(`The new assignment dates include recorded attendance or approved leave/payroll through ${dayKey(conflict.workDate)}. Choose a start date of ${dayKey(addDays(conflict.workDate, 1))} or later, or keep the existing assignment dates.`, 409);
  const overlap = await tx.employeeScheduleAssignment.findFirst({ where: { id: { not: id || 0 }, employeeId: data.employeeId, ...(data.endDate ? { startDate: { lte: data.endDate } } : {}), OR: [{ endDate: null }, { endDate: { gte: data.startDate } }] }, include: { workingSchedule: { select: { name: true } } }, orderBy: { startDate: "asc" } });
  if (overlap) fail(`Schedule assignments cannot overlap. ${overlap.workingSchedule.name} is already assigned from ${dayKey(overlap.startDate)} ${overlap.endDate ? `through ${dayKey(overlap.endDate)}` : "with no end date"}. Adjust that assignment or choose different dates.`, 409);
  const affectedRanges = [data, ...(before ? [before] : [])].map(assignment => ({ workDate: { gte: assignment.startDate, ...(assignment.endDate ? { lte: assignment.endDate } : {}) } }));
  const futureDays = await tx.attendanceDay.findMany({ where: { employeeId: data.employeeId, OR: affectedRanges, NOT: protection }, select: { workDate: true } });
  if (split) {
    const endDate = before.endDate && before.endDate < data.startDate ? before.endDate : addDays(data.startDate, -1);
    await tx.employeeScheduleAssignment.update({ where: { id }, data: { endDate } });
    await audit(tx, actorId, "ASSIGNMENTS_UPDATED", "employeeScheduleAssignment", id, { endDate });
  }
  const item = before && !split
    ? await tx.employeeScheduleAssignment.update({ where: { id }, data })
    : await tx.employeeScheduleAssignment.create({ data });
  // Empty future summaries are derived data; recompute them for the updated coverage.
  for (const day of futureDays) await refreshDay(tx, data.employeeId, day.workDate);
  await audit(tx, actorId, before && !split ? "ASSIGNMENTS_UPDATED" : "ASSIGNMENTS_CREATED", "employeeScheduleAssignment", item.id, split ? { previousAssignmentId: id, effectiveDate: data.startDate } : undefined);
  return json({ ...item, ...(split ? { previousAssignmentId: id } : {}) });
}
