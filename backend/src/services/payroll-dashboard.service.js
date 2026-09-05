import prisma from "../lib/prisma.js";
import { D, json } from "../lib/workspace.js";
import { reports } from "./reports.service.js";

export async function payrollDashboard(query) {
  const start = new Date(`${query.month}-01T00:00:00Z`), end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const scope = { ...(query.departmentId ? { departmentId: query.departmentId } : {}), ...(query.employeeType ? { employeeType: query.employeeType } : {}) };
  const where = { ...scope, currency: query.currency, periodStart: { gte: start, lt: end }, status: { not: "CANCELLED" } };
  const [report, slips, runs, warnings, missingCheckout] = await Promise.all([
    reports(query),
    prisma.payslip.findMany({ where, include: { payments: { where: { status: "SUCCEEDED" } }, lines: true } }),
    prisma.payrun.findMany({ where: { currency: query.currency, period: { startDate: { gte: start, lt: end } }, ...(Object.keys(scope).length ? { employees: { some: { employee: scope } } } : {}) }, include: { period: true, _count: { select: { employees: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.payrollWarning.findMany({ where: { status: "OPEN", payrun: { currency: query.currency, period: { startDate: { gte: start, lt: end } } }, ...(Object.keys(scope).length ? { employee: scope } : {}) }, select: { id: true, message: true, severity: true, payrunId: true }, take: 20 }),
    prisma.attendance.count({ where: { voidedAt: null, checkOut: null, day: { workDate: { gte: start, lt: end }, employee: scope } } }),
  ]);
  const computed = slips.filter(s => s.status !== "DRAFT");
  const sum = key => computed.reduce((n, s) => n.plus(s[key]), D());
  const paid = slips.reduce((n, s) => n.plus(s.payments.reduce((p, payment) => p.plus(payment.amount), D())), D());
  const bonuses = computed.reduce((n, s) => n.plus(s.lines.filter(l => l.effect === "EARNING" && /(^|_)BONUS($|_)/i.test(l.code)).reduce((n, l) => n.plus(l.total), D())), D());
  return json({ ...report, metrics: { totalPayroll: sum("netAmount"), totalPaid: paid, employeesPaid: new Set(slips.filter(s => s.status === "PAID").map(s => s.employeeId)).size, pendingPayroll: sum("netAmount").minus(paid), pendingPayslips: slips.filter(s => !["PAID", "CANCELLED"].includes(s.status)).length, totalDeductions: sum("deductionAmount"), totalBonuses: bonuses, payslipsGenerated: slips.length, averageSalary: computed.length ? sum("netAmount").div(computed.length) : D(), currentCycles: runs.filter(r => !["PAID", "CANCELLED"].includes(r.status)).length, missingCheckout }, statuses: ["DRAFT", "COMPUTED", "VALIDATED", "PARTIALLY_PAID", "PAID", "CANCELLED"].map(status => ({ status, count: runs.filter(r => r.status === status).length })), recentRuns: runs.slice(0, 8), warnings });
}
