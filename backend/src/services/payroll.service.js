import prisma from "../lib/prisma.js";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { D, addDays, audit, date, dateRange, dayKey, daysBetween, expression, fail, json, lockEmployee, scheduleDay } from "../lib/workspace.js";
import { refreshDay } from "./time.service.js";

export function calculateRules(memberships, values) {
  const context = { ...values, GROSS: D(), NET: D() }, lines = [];
  let basic = D(), allowance = D(), deduction = D(), contribution = D();
  for (const member of [...memberships].sort((a, b) => a.sequence - b.sequence)) {
    const rule = member.salaryRule;
    if (!member.isActive || !rule.isActive) continue;
    let enabled = true;
    if (rule.conditionMethod === "RANGE") { const base = expression(rule.conditionBase, context); enabled = base.gte(rule.conditionMinimum) && base.lte(rule.conditionMaximum); }
    if (rule.conditionMethod === "FORMULA") enabled = !expression(rule.conditionFormula, context).isZero();
    let amount = D(), quantity = D(1);
    if (enabled) {
      quantity = rule.quantityFormula ? expression(rule.quantityFormula, context) : D(1);
      amount = rule.computationMethod === "FIXED" ? D(rule.fixedAmount) : rule.computationMethod === "PERCENTAGE" ? expression(rule.percentageBase, context).mul(rule.percentageRate).div(100) : expression(rule.formula, context);
    }
    const total = amount.mul(quantity).toDecimalPlaces(4);
    if (total.lt(0) || quantity.lt(0) || total.gte("1000000000000000")) fail(`Rule ${rule.code} produces an invalid amount. Use a positive deduction with Deduction effect.`);
    context[rule.code] = total;
    if (rule.effect === "EARNING") { if (rule.category.type === "BASIC") basic = basic.plus(total); else allowance = allowance.plus(total); }
    if (rule.effect === "DEDUCTION") deduction = deduction.plus(total);
    if (rule.effect === "EMPLOYER_COST") contribution = contribution.plus(total);
    context.GROSS = basic.plus(allowance); context.NET = context.GROSS.minus(deduction);
    lines.push({ salaryRuleId: rule.id, code: rule.code, name: rule.name, categoryCode: rule.category.code, categoryType: rule.category.type, effect: rule.effect, sequence: member.sequence, amount: amount.toDecimalPlaces(4), total, quantity, appearsOnPayslip: rule.appearsOnPayslip, ruleSnapshot: json(rule), calculationDetails: json({ method: rule.computationMethod, enabled }) });
  }
  if (!lines.some(l => l.effect === "EARNING")) fail("The salary structure needs at least one active earning rule.");
  if (context.NET.lt(0)) fail("Salary deductions exceed earnings; net salary cannot be negative.");
  return { lines, totals: { basicAmount: basic, allowanceAmount: allowance, grossAmount: context.GROSS, deductionAmount: deduction, employerContributionAmount: contribution, netAmount: context.NET, employerCostAmount: context.GROSS.plus(contribution) } };
}

export async function createPayrun(input, actorId) {
  dateRange(date(input.startDate), date(input.endDate));
  return prisma.$transaction(async tx => {
    const existing = await tx.payrun.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) { if (!isDeepStrictEqual(existing.scopeSnapshot, json(input))) fail("This submission key belongs to a different payrun.", 409); return json(existing); }
    const structure = await tx.salaryStructure.findUnique({ where: { id: input.salaryStructureId } });
    if (!structure?.isActive) fail("Choose an active salary structure.");
    const employeeIds = [...input.employeeIds].sort((a, b) => a - b);
    for (const id of employeeIds) await lockEmployee(tx, id);
    if (await tx.employee.count({ where: { id: { in: employeeIds }, status: { not: "ARCHIVED" } } }) !== employeeIds.length) fail("Select existing, unarchived employees.");
    const period = await tx.payrollPeriod.upsert({ where: { startDate_endDate_frequency: { startDate: date(input.startDate), endDate: date(input.endDate), frequency: structure.payFrequency } }, create: { name: `${input.startDate} – ${input.endDate}`, startDate: date(input.startDate), endDate: date(input.endDate), frequency: structure.payFrequency, paymentDate: input.paymentDate ? date(input.paymentDate) : null }, update: {} });
    if (period.isClosed) fail("This payroll period is closed.", 409);
    const item = await tx.payrun.create({ data: { name: input.name, reference: `RUN-${randomUUID()}`, payrollPeriodId: period.id, salaryStructureId: structure.id, currency: structure.currency, idempotencyKey: input.idempotencyKey, scopeSnapshot: json(input), notes: input.notes, createdById: actorId, employees: { create: employeeIds.map(employeeId => ({ employeeId })) } } });
    await audit(tx, actorId, "PAYRUN_CREATED", "Payrun", item.id);
    return json(item);
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
async function computeEmployee(tx, run, selection) {
  const employee = selection.employee;
  const employmentStart = new Date(Math.max(+run.period.startDate, +employee.hireDate));
  const employmentEnd = new Date(Math.min(+run.period.endDate, employee.terminationDate ? +employee.terminationDate : Infinity));
  if (employmentStart > employmentEnd) fail("The employee was not employed in this payroll period.");
  // Historical approved contracts remain applicable to their effective dates.
  const contracts = await tx.contract.findMany({ where: { employeeId: employee.id, status: { in: ["OPEN", "EXPIRED", "TERMINATED"] }, startDate: { lte: employmentEnd }, AND: [{ OR: [{ endDate: null }, { endDate: { gte: employmentStart } }] }, { OR: [{ terminationDate: null }, { terminationDate: { gte: employmentStart } }] }] }, include: { workingSchedule: { include: { lines: true, holidays: true } } } });
  if (contracts.length !== 1) fail(contracts.length ? "Multiple contracts intersect this payroll period. Split the period at the contract change." : "No approved contract covers this payroll period.");
  const contract = contracts[0];
  if (contract.salaryStructureId !== run.salaryStructureId || contract.currency !== run.currency || contract.payFrequency !== run.period.frequency) fail("Contract salary structure, currency or pay frequency does not match this payrun.");
  const schedule = contract.workingSchedule;
  if (!schedule) fail("The contract needs a working schedule before payroll can be computed.");
  const start = new Date(Math.max(+run.period.startDate, +employee.hireDate, +contract.startDate));
  const end = new Date(Math.min(+run.period.endDate, ...[contract.endDate, contract.terminationDate, employee.terminationDate].filter(Boolean).map(Number)));
  if (start > end) fail("The employee was not employed in this payroll period.");
  if (contract.startDate > employmentStart) fail("Contract coverage has a gap. Split or correct the payroll period.");
  const requiredEnd = new Date(Math.min(+employmentEnd, contract.terminationDate ? +contract.terminationDate : Infinity));
  if (contract.endDate && contract.endDate < requiredEnd) fail("Contract ends inside the period. Split or correct the payroll period.");
  const previous = await tx.payslip.findUnique({ where: { payrunId_employeeId: { payrunId: run.id, employeeId: employee.id } }, include: { inputs: true } });
  if (previous && !["DRAFT", "COMPUTED"].includes(previous.status)) fail("A finalized payslip cannot be recomputed.", 409);
  const leaveDays = await tx.leaveRequestDay.findMany({ where: { date: { gte: start, lte: end }, leaveRequest: { employeeId: employee.id, status: "APPROVED" } }, include: { leaveRequest: true } });
  let scheduledDays = D(), paidDays = D(), workedDays = D(), workedHours = D(), paidLeaveHours = D(), unpaidDays = D(), proratedBase = D();
  const attendanceSnapshots = [];
  for (const workDate of dateRange(start, end)) {
    const info = scheduleDay(schedule, workDate);
    if (["MONTHLY", "ANNUAL"].includes(contract.wageBasis)) {
      const daysInMonth = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth() + 1, 0)).getUTCDate();
      proratedBase = proratedBase.plus(D(contract.wage).div(contract.wageBasis === "ANNUAL" ? 12 : 1).div(daysInMonth));
    }
    if (info.holiday && info.scheduledMinutes) {
      scheduledDays = scheduledDays.plus(1);
      if (info.holiday.isPaid) { paidDays = paidDays.plus(1); paidLeaveHours = paidLeaveHours.plus(D(info.scheduledMinutes).div(60)); } else unpaidDays = unpaidDays.plus(1);
      continue;
    }
    if (!info.minutes) continue;
    if (workDate > date(dayKey(new Date()))) fail("The payroll period includes future working days. Wait until the period is complete or shorten it.");
    scheduledDays = scheduledDays.plus(1);
    const day = await refreshDay(tx, employee.id, workDate);
    if (await tx.attendance.count({ where: { attendanceDayId: day.id, checkOut: null, voidedAt: null } })) fail(`Close attendance sessions on ${dayKey(workDate)} before computing payroll.`);
    const workedFraction = D(day.workedMinutes).div(info.minutes);
    const cappedWork = workedFraction.gt(1) ? D(1) : workedFraction;
    workedDays = workedDays.plus(cappedWork); workedHours = workedHours.plus(D(day.workedMinutes).div(60));
    let leaveFraction = D();
    for (const leave of leaveDays.filter(l => dayKey(l.date) === dayKey(workDate))) leaveFraction = leaveFraction.plus(D(leave.durationHours).mul(60).div(info.minutes).mul(leave.leaveRequest.paidPercentage).div(100));
    const payable = cappedWork.plus(leaveFraction);
    const capped = payable.gt(1) ? D(1) : payable;
    paidLeaveHours = paidLeaveHours.plus(capped.minus(cappedWork).mul(info.minutes).div(60));
    paidDays = paidDays.plus(capped); unpaidDays = unpaidDays.plus(D(1).minus(capped));
    attendanceSnapshots.push(json(day));
  }
  const payFraction = scheduledDays.isZero() ? D(1) : paidDays.div(scheduledDays);
  const wage = contract.wageBasis === "HOURLY" ? D(contract.wage).mul(workedHours.plus(paidLeaveHours)) : contract.wageBasis === "DAILY" ? D(contract.wage).mul(paidDays) : proratedBase.mul(payFraction);
  const context = { WAGE: wage, CONTRACT_WAGE: contract.wage, WORKED_HOURS: workedHours, WORKED_DAYS: workedDays, SCHEDULED_DAYS: scheduledDays, PAID_DAYS: paidDays };
  for (const input of previous?.inputs || []) { if (Object.hasOwn(context, input.code) || ["GROSS", "NET"].includes(input.code)) fail("A variable input cannot replace a reserved payroll value."); context[input.code] = D(input.amount).mul(input.quantity); }
  const computed = calculateRules(run.salaryStructure.rules, context);
  const data = { contractId: contract.id, workingScheduleId: schedule.id, departmentId: contract.departmentId, employeeType: contract.employeeType, status: "COMPUTED", ...computed.totals, scheduledDays, workedDays, workedHours, employeeSnapshot: json({ id: employee.id, employeeCode: employee.employeeCode, firstName: employee.firstName, lastName: employee.lastName, workEmail: employee.workEmail }), contractSnapshot: json(contract), scheduleSnapshot: json(schedule), structureSnapshot: json(run.salaryStructure), computationInputs: json({ context, attendance: attendanceSnapshots, leaveDays, proration: "Calendar-day wage proration; scheduled-day pay fraction from closed attendance and approved paid leave. Hourly wages use worked hours; daily wages use paid days." }), computedAt: new Date(), computationVersion: run.computationVersion + 1 };
  if (previous) { await tx.payslipLine.deleteMany({ where: { payslipId: previous.id } }); await tx.payslipWorkedTime.deleteMany({ where: { payslipId: previous.id } }); }
  const slip = previous ? await tx.payslip.update({ where: { id: previous.id }, data: { ...data, version: { increment: 1 } } }) : await tx.payslip.create({ data: { ...data, number: `SLIP-${randomUUID()}`, payrunId: run.id, employeeId: employee.id, payrollPeriodId: run.payrollPeriodId, salaryStructureId: run.salaryStructureId, periodStart: run.period.startDate, periodEnd: run.period.endDate, currency: run.currency } });
  await tx.payslipLine.createMany({ data: computed.lines.map(line => ({ ...line, payslipId: slip.id })) });
  await tx.payslipWorkedTime.createMany({ data: [{ payslipId: slip.id, code: "WORK", name: "Recorded work", type: "REGULAR", days: workedDays, hours: workedHours, sourceSnapshot: json(attendanceSnapshots) }, { payslipId: slip.id, code: "UNPAID", name: "Unpaid leave and absence", type: "ABSENCE", days: unpaidDays, hours: D(), paidPercentage: D(), sourceSnapshot: json({ leaveDays, paidDays }) }] });
  await tx.payrunEmployee.update({ where: { payrunId_employeeId: { payrunId: run.id, employeeId: employee.id } }, data: { status: "COMPUTED", errorMessage: null } });
  return slip;
}
export async function payrunAction(id, input, actorId) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM payroll."Payrun" WHERE id = ${id} FOR UPDATE`;
    const run = await tx.payrun.findUnique({ where: { id }, include: { period: true, salaryStructure: { include: { rules: { include: { salaryRule: { include: { category: true } } } } } }, employees: { include: { employee: true }, orderBy: { employeeId: "asc" } }, payslips: { include: { payments: true } } } });
    if (!run) fail("Payrun not found.", 404);
    if (input.action === "pay" && input.idempotencyKey && run.payslips.length && run.payslips.every(s => D(s.netAmount).isZero() || s.payments.some(p => p.idempotencyKey === `${input.idempotencyKey}:${s.id}`))) {
      const recorded = run.payslips.flatMap(s => s.payments).filter(p => p.idempotencyKey.startsWith(`${input.idempotencyKey}:`));
      if (run.status === "PAID" && recorded.every(p => p.method === input.method && p.externalReference === input.externalReference)) return json(run);
      if (recorded.length) fail("This payment key was used with different payment details.", 409);
    }
    if (!input.version || run.version !== input.version) fail("This payrun changed. Refresh it before trying again.", 409);
    if (run.period.isClosed) fail("The payroll period is closed.", 409);
    for (const selection of run.employees) await lockEmployee(tx, selection.employeeId);
    if (input.action === "compute") {
      if (!["DRAFT", "COMPUTED"].includes(run.status)) fail("Only draft or computed payruns can be computed.", 409);
      if (!run.salaryStructure.isActive) fail("This salary structure is inactive.");
      await tx.payrollWarning.updateMany({ where: { payrunId: id, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date(), resolutionNote: "Rechecked during computation" } });
      let failures = 0;
      for (const selection of run.employees) {
        await tx.payslip.upsert({ where: { payrunId_employeeId: { payrunId: id, employeeId: selection.employeeId } }, create: { number: `SLIP-${randomUUID()}`, payrunId: id, employeeId: selection.employeeId, payrollPeriodId: run.payrollPeriodId, salaryStructureId: run.salaryStructureId, employeeType: selection.employee.employeeType, periodStart: run.period.startDate, periodEnd: run.period.endDate, currency: run.currency }, update: {} });
        try { await computeEmployee(tx, run, selection); }
        catch (error) {
          if (!error.statusCode) throw error;
          failures++;
          await tx.payrunEmployee.update({ where: { payrunId_employeeId: { payrunId: id, employeeId: selection.employeeId } }, data: { status: "FAILED", errorMessage: error.message } });
          await tx.payslip.updateMany({ where: { payrunId: id, employeeId: selection.employeeId }, data: { status: "DRAFT" } });
          await tx.payrollWarning.upsert({ where: { payrunId_deduplicationKey: { payrunId: id, deduplicationKey: `compute:${selection.employeeId}` } }, create: { payrunId: id, employeeId: selection.employeeId, deduplicationKey: `compute:${selection.employeeId}`, code: "RULE_COMPUTATION_ERROR", severity: "BLOCKING", message: error.message }, update: { status: "OPEN", message: error.message, resolvedAt: null } });
        }
      }
      await tx.payrun.update({ where: { id }, data: { status: failures ? "DRAFT" : "COMPUTED", computedAt: new Date(), computationVersion: { increment: 1 }, version: { increment: 1 }, structureSnapshot: json(run.salaryStructure) } });
    } else if (input.action === "validate") {
      if (run.status !== "COMPUTED" || !run.payslips.length || run.payslips.length !== run.employees.length || run.payslips.some(s => s.status !== "COMPUTED") || run.employees.some(e => e.status !== "COMPUTED")) fail("Compute every selected employee successfully before validating.", 409);
      if (await tx.payrollWarning.count({ where: { payrunId: id, status: "OPEN", severity: "BLOCKING" } })) fail("Resolve blocking payroll warnings first.", 409);
      for (const slip of run.payslips) {
        if (JSON.stringify(json(slip.structureSnapshot?.revision)) !== JSON.stringify(run.salaryStructure.revision) || run.salaryStructure.rules.some(member => {
          const frozen = slip.structureSnapshot?.rules?.find(r => r.salaryRuleId === member.salaryRuleId);
          return !frozen || frozen.salaryRule.revision !== member.salaryRule.revision || frozen.salaryRule.isActive !== member.salaryRule.isActive || frozen.salaryRule.category.type !== member.salaryRule.category.type;
        })) fail("Salary rules or structure changed after computation. Recompute before validating.", 409);
        if (await tx.attendance.count({ where: { day: { employeeId: slip.employeeId, workDate: { gte: slip.periodStart, lte: slip.periodEnd } }, updatedAt: { gt: slip.computedAt } } }) || await tx.leaveRequest.count({ where: { employeeId: slip.employeeId, startDate: { lte: slip.periodEnd }, endDate: { gte: slip.periodStart }, updatedAt: { gt: slip.computedAt } } })) fail("Attendance or time off changed after computation. Recompute before validating.", 409);
        if (await tx.payslip.count({ where: { employeeId: slip.employeeId, id: { not: slip.id }, status: { in: ["VALIDATED", "PARTIALLY_PAID", "PAID"] }, periodStart: { lte: slip.periodEnd }, periodEnd: { gte: slip.periodStart } } })) fail("A selected employee already has finalized payroll in this date range.", 409);
        if (!slip.employeeSnapshot || !slip.contractSnapshot || !slip.structureSnapshot) fail("Payroll snapshots are missing. Recompute first.", 409);
      }
      await tx.payslip.updateMany({ where: { payrunId: id }, data: { status: "VALIDATED", validatedAt: new Date(), validatedById: actorId, version: { increment: 1 } } });
      await tx.payrun.update({ where: { id }, data: { status: "VALIDATED", validatedAt: new Date(), validatedById: actorId, version: { increment: 1 } } });
    } else if (input.action === "pay") {
      if (!["VALIDATED", "PARTIALLY_PAID"].includes(run.status)) fail("Validate the payrun before recording payment.", 409);
      if (!input.idempotencyKey || !input.method || !input.externalReference) fail("Provide a payment method, reference and submission key.");
      for (const slip of run.payslips) {
        const paid = slip.payments.filter(p => p.status === "SUCCEEDED").reduce((n, p) => n.plus(p.amount), D());
        const remaining = D(slip.netAmount).minus(paid);
        if (remaining.lt(0)) fail("Recorded payments exceed net pay.", 409);
        if (remaining.gt(0)) await tx.payrollPayment.create({ data: { payslipId: slip.id, amount: remaining, currency: slip.currency, method: input.method, status: "SUCCEEDED", idempotencyKey: `${input.idempotencyKey}:${slip.id}`, externalReference: input.externalReference, paidAt: new Date(), recordedById: actorId } });
        await tx.payslip.update({ where: { id: slip.id }, data: { status: "PAID", paidAt: new Date(), version: { increment: 1 } } });
      }
      await tx.payrun.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), version: { increment: 1 } } });
    } else if (input.action === "cancel") {
      if (!["DRAFT", "COMPUTED", "VALIDATED"].includes(run.status) || run.payslips.some(s => s.payments.some(p => ["SUCCEEDED", "PENDING", "PROCESSING"].includes(p.status)))) fail("Paid or processing payroll cannot be cancelled.", 409);
      if (!input.reason?.trim()) fail("Provide a cancellation reason.");
      await tx.payslip.updateMany({ where: { payrunId: id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: input.reason, version: { increment: 1 } } });
      await tx.payrun.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: input.reason, version: { increment: 1 } } });
    } else fail("Invalid payroll action.");
    await audit(tx, actorId, `PAYRUN_${input.action.toUpperCase()}`, "Payrun", id);
    return json(await tx.payrun.findUnique({ where: { id }, include: { warnings: { where: { status: "OPEN" } } } }));
  }, { isolationLevel: "Serializable", timeout: 120000, maxWait: 10000 });
}
export async function savePayslipInputs(id, inputs, actorId) {
  return prisma.$transaction(async tx => {
    const slip = await tx.payslip.findUnique({ where: { id } });
    if (!slip) fail("Payslip not found.", 404);
    await tx.$queryRaw`SELECT id FROM payroll."Payrun" WHERE id = ${slip.payrunId} FOR UPDATE`;
    const run = await tx.payrun.findUnique({ where: { id: slip.payrunId } });
    if (!["DRAFT", "COMPUTED"].includes(run.status)) fail("Finalized payslip inputs cannot be edited.", 409);
    if (new Set(inputs.map(i => i.code)).size !== inputs.length) fail("Input codes must be unique.");
    await tx.payslipInput.deleteMany({ where: { payslipId: id } });
    await tx.payslipInput.createMany({ data: inputs.map(i => ({ ...i, payslipId: id })) });
    await tx.payslip.update({ where: { id }, data: { status: "DRAFT", version: { increment: 1 } } });
    await tx.payrun.update({ where: { id: slip.payrunId }, data: { status: "DRAFT", version: { increment: 1 } } });
    await audit(tx, actorId, "PAYSLIP_INPUTS_UPDATED", "Payslip", id);
    return { id };
  }, { isolationLevel: "Serializable" });
}
