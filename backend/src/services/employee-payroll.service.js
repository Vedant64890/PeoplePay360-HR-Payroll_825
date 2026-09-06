import prisma from "../lib/prisma.js";
import { D, fail, json } from "../lib/workspace.js";
import { ownEmployee } from "./employee.service.js";
import { ensurePayslipDocument } from "./payslip-document.service.js";

export const releasedStatuses = ["VALIDATED", "PARTIALLY_PAID", "PAID"];
const slipSelect = {
  id: true,
  number: true,
  periodStart: true,
  periodEnd: true,
  currency: true,
  status: true,
  basicAmount: true,
  allowanceAmount: true,
  grossAmount: true,
  deductionAmount: true,
  netAmount: true,
  employerContributionAmount: true,
  scheduledDays: true,
  workedDays: true,
  workedHours: true,
  validatedAt: true,
  paidAt: true,
};
export async function employeeContracts(userId) {
  const employee = await ownEmployee(userId);
  return json(
    await prisma.contract.findMany({
      where: {
        employeeId: employee.id,
        status: { in: ["OPEN", "EXPIRED", "TERMINATED"] },
      },
      select: {
        id: true,
        reference: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        terminationDate: true,
        probationEndDate: true,
        signedAt: true,
        wage: true,
        currency: true,
        wageBasis: true,
        payFrequency: true,
        employeeType: true,
        terms: true,
        department: { select: { name: true } },
        jobPosition: { select: { title: true } },
        workingSchedule: { select: { name: true } },
        salaryStructure: { select: { name: true } },
      },
      orderBy: { startDate: "desc" },
    }),
  );
}
export async function employeePayroll(
  userId,
  year = new Date().getUTCFullYear(),
) {
  const employee = await ownEmployee(userId);
  const where = { employeeId: employee.id, status: { in: releasedStatuses } };
  const periodEnd = {
    gte: new Date(`${year}-01-01`),
    lt: new Date(`${year + 1}-01-01`),
  };
  const [slips, pendingSlips, periods, bankAccounts] = await Promise.all([
    prisma.payslip.findMany({
      where: {
        ...where,
        periodEnd,
      },
      select: slipSelect,
      orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
    }),
    // Employees can track preparation without seeing unapproved salary values.
    prisma.payslip.findMany({
      where: {
        employeeId: employee.id,
        status: { in: ["DRAFT", "COMPUTED"] },
        periodEnd,
      },
      select: {
        id: true,
        number: true,
        periodStart: true,
        periodEnd: true,
        status: true,
      },
      orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
    }),
    prisma.payslip.findMany({
      where: {
        employeeId: employee.id,
        status: { in: [...releasedStatuses, "DRAFT", "COMPUTED"] },
      },
      select: { periodEnd: true },
      distinct: ["periodEnd"],
    }),
    prisma.employeeBankAccount.findMany({
      where: { employeeId: employee.id, isActive: true },
      select: {
        id: true,
        bankName: true,
        accountHolderName: true,
        accountLastFour: true,
        currency: true,
        isPrimary: true,
      },
    }),
  ]);
  // Keep currencies separate: adding unrelated currencies produces misleading totals.
  const totals = Object.values(
    slips.reduce((result, slip) => {
      const row = (result[slip.currency] ||= {
        currency: slip.currency,
        gross: D(),
        deductions: D(),
        net: D(),
        count: 0,
      });
      row.gross = row.gross.plus(slip.grossAmount);
      row.deductions = row.deductions.plus(slip.deductionAmount);
      row.net = row.net.plus(slip.netAmount);
      row.count++;
      return result;
    }, {}),
  );
  return json({
    year,
    years: [
      ...new Set([year, ...periods.map((p) => p.periodEnd.getUTCFullYear())]),
    ].sort((a, b) => b - a),
    slips,
    pendingSlips,
    totals,
    bankAccounts,
  });
}
export async function employeePayslip(userId, id) {
  const employee = await ownEmployee(userId);
  const slip = await prisma.payslip.findFirst({
    where: { id, employeeId: employee.id, status: { in: releasedStatuses } },
    select: {
      ...slipSelect,
      lines: {
        where: { appearsOnPayslip: true },
        select: {
          id: true,
          name: true,
          code: true,
          effect: true,
          quantity: true,
          rate: true,
          amount: true,
          total: true,
        },
        orderBy: { sequence: "asc" },
      },
      workedTime: {
        select: {
          id: true,
          name: true,
          type: true,
          days: true,
          hours: true,
          paidPercentage: true,
        },
      },
      payments: {
        select: {
          id: true,
          amount: true,
          currency: true,
          method: true,
          status: true,
          paidAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!slip) fail("Payslip not found or not yet released.", 404);
  return json(slip);
}
export async function employeePayslipPdf(userId, id) {
  const employee = await ownEmployee(userId);
  return prisma.$transaction(
    async (tx) => {
      const first = await tx.payslip.findFirst({
        where: {
          id,
          employeeId: employee.id,
          status: { in: releasedStatuses },
        },
        select: { payrunId: true },
      });
      if (!first) fail("Payslip not found or not yet released.", 404);
      await tx.$queryRaw`SELECT id FROM payroll."Payrun" WHERE id = ${first.payrunId} FOR UPDATE`;
      const slip = await tx.payslip.findFirst({
        where: {
          id,
          employeeId: employee.id,
          status: { in: releasedStatuses },
        },
        include: { lines: { orderBy: { sequence: "asc" } } },
      });
      if (!slip) fail("Payslip not found or not yet released.", 404);
      return ensurePayslipDocument(tx, slip, userId);
    },
    { timeout: 30000 },
  );
}
