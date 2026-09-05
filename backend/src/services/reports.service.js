import prisma from "../lib/prisma.js";
import { D, date, dateRange, dayKey, json } from "../lib/workspace.js";

export async function reports({ month, currency = "INR", departmentId, employeeType, trendMonths = 6 }) {
  const start = date(`${month || dayKey(new Date()).slice(0, 7)}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const trendStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - trendMonths + 1, 1));
  const departmentScope = { ...(departmentId ? { departmentId } : {}), ...(employeeType ? { employeeType } : {}) };
  const [slips, days, leaves, payments, contracts, departmentOptions, currentEmployees, headcount, pendingLeave, allocations, manualEdits] = await Promise.all([
    prisma.payslip.findMany({ where: { currency, ...departmentScope, periodStart: { gte: trendStart, lt: end }, status: { in: ["VALIDATED", "PARTIALLY_PAID", "PAID"] } }, select: { id: true, periodStart: true, departmentId: true, department: { select: { name: true } }, grossAmount: true, deductionAmount: true, netAmount: true, employerCostAmount: true } }),
    prisma.attendanceDay.findMany({ where: { workDate: { gte: start, lt: end }, ...(Object.keys(departmentScope).length ? { employee: departmentScope } : {}) }, select: { workDate: true, status: true, workedMinutes: true, lateMinutes: true, overtimeMinutes: true } }),
    prisma.leaveRequestDay.findMany({ where: { date: { gte: start, lt: end }, leaveRequest: { status: "APPROVED", ...(Object.keys(departmentScope).length ? { employee: departmentScope } : {}) } }, select: { durationDays: true, durationHours: true, leaveRequest: { select: { leaveTypeId: true, leaveType: { select: { name: true } } } } } }),
    prisma.payrollPayment.aggregate({ where: { currency, status: "SUCCEEDED", paidAt: { gte: start, lt: end }, ...(Object.keys(departmentScope).length ? { payslip: departmentScope } : {}) }, _sum: { amount: true } }),
    prisma.contract.count({ where: { ...departmentScope, status: "OPEN", endDate: { gte: start, lt: end } } }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.count({ where: { ...departmentScope, status: { notIn: ["ARCHIVED", "TERMINATED"] } } }),
    prisma.employee.groupBy({ by: ["departmentId"], where: { ...departmentScope, status: { notIn: ["ARCHIVED", "TERMINATED"] } }, _count: true }),
    prisma.leaveRequest.findMany({ where: { employee: departmentScope, status: { in: ["SUBMITTED", "FIRST_APPROVED"] }, startDate: { lt: end }, endDate: { gte: start } }, select: { leaveTypeId: true, leaveType: { select: { name: true } } } }),
    prisma.leaveAllocation.findMany({ where: { employee: departmentScope, status: "APPROVED", validFrom: { lt: end }, OR: [{ validUntil: null }, { validUntil: { gte: start } }] }, select: { leaveTypeId: true, unit: true, amount: true, leaveType: { select: { name: true } }, consumptions: { where: { releasedAt: null }, select: { amount: true } } } }),
    prisma.attendanceCorrection.count({ where: { attendance: { day: { employee: departmentScope, workDate: { gte: start, lt: end } } } } }),
  ]);
  const selected = slips.filter(s => s.periodStart >= start);
  const total = field => selected.reduce((n, s) => n.plus(s[field]), D()).toFixed(2);
  const payrollTrend = Array.from({ length: trendMonths }, (_, i) => {
    const key = dayKey(new Date(Date.UTC(trendStart.getUTCFullYear(), trendStart.getUTCMonth() + i, 1))).slice(0, 7);
    const rows = slips.filter(s => dayKey(s.periodStart).startsWith(key));
    const sum = field => rows.reduce((n, s) => n.plus(s[field]), D()).toFixed(2);
    return { month: key, payslips: rows.length, gross: sum("grossAmount"), net: sum("netAmount"), deductions: sum("deductionAmount"), cost: sum("employerCostAmount") };
  });
  const departmentMap = new Map();
  for (const group of headcount) departmentMap.set(group.departmentId || 0, { departmentId: group.departmentId, department: departmentOptions.find(d => d.id === group.departmentId)?.name || "Unassigned", employees: group._count, payslips: 0, gross: D(), net: D(), deductions: D(), cost: D() });
  for (const slip of selected) {
    const key = slip.departmentId || 0, row = departmentMap.get(key) || { departmentId: slip.departmentId, department: slip.department?.name || "Unassigned", employees: 0, payslips: 0, gross: D(), net: D(), deductions: D(), cost: D() };
    row.payslips++; row.gross = row.gross.plus(slip.grossAmount); row.net = row.net.plus(slip.netAmount); row.deductions = row.deductions.plus(slip.deductionAmount); row.cost = row.cost.plus(slip.employerCostAmount); departmentMap.set(key, row);
  }
  const attendance = ["PRESENT", "ABSENT", "ON_LEAVE", "HOLIDAY", "REST_DAY"].map(status => {
    const rows = days.filter(d => d.status === status);
    return { status, days: rows.length, workedMinutes: rows.reduce((n, d) => n + d.workedMinutes, 0), lateMinutes: rows.reduce((n, d) => n + d.lateMinutes, 0), overtimeMinutes: rows.reduce((n, d) => n + d.overtimeMinutes, 0) };
  });
  const attendanceTrend = dateRange(start, new Date(end - 86400000)).map(day => {
    const rows = days.filter(d => dayKey(d.workDate) === dayKey(day));
    return { date: dayKey(day), present: rows.filter(d => d.status === "PRESENT").length, absent: rows.filter(d => d.status === "ABSENT").length, leave: rows.filter(d => d.status === "ON_LEAVE").length, workedHours: rows.reduce((n, d) => n + d.workedMinutes, 0) / 60, overtimeHours: rows.reduce((n, d) => n + d.overtimeMinutes, 0) / 60 };
  });
  const leave = [...new Set([...leaves.map(l => l.leaveRequest.leaveTypeId), ...pendingLeave.map(l => l.leaveTypeId), ...allocations.map(a => a.leaveTypeId)])].map(id => {
    const rows = leaves.filter(l => l.leaveRequest.leaveTypeId === id);
    const pending = pendingLeave.filter(l => l.leaveTypeId === id), assigned = allocations.filter(a => a.leaveTypeId === id);
    const remaining = unit => assigned.filter(a => a.unit === unit).reduce((sum, a) => sum.plus(D(a.amount).minus(a.consumptions.reduce((n, c) => n.plus(c.amount), D()))), D());
    return { leaveTypeId: id, type: rows[0]?.leaveRequest.leaveType.name || pending[0]?.leaveType.name || assigned[0]?.leaveType.name, days: rows.reduce((n, l) => n.plus(l.durationDays), D()), hours: rows.reduce((n, l) => n.plus(l.durationHours), D()), pendingRequests: pending.length, remainingDays: remaining("DAYS"), remainingHours: remaining("HOURS") };
  });
  const present = attendance.find(a => a.status === "PRESENT").days, absent = attendance.find(a => a.status === "ABSENT").days;
  return json({ month: dayKey(start).slice(0, 7), currency, departmentId: departmentId || null, trendMonths, generatedAt: new Date(), totals: { finalizedPayslips: selected.length, gross: total("grossAmount"), deductions: total("deductionAmount"), net: total("netAmount"), employerCost: total("employerCostAmount"), averageNetPerPayslip: selected.length ? D(total("netAmount")).div(selected.length).toFixed(2) : "0.00", paymentsRecorded: payments._sum.amount || "0", contractsExpiring: contracts, currentEmployees, pendingLeaveRequests: pendingLeave.length, manualEdits, lateDays: days.filter(d => d.lateMinutes > 0).length, recordedAttendanceRate: present + absent ? Math.round(present / (present + absent) * 1000) / 10 : null, recordedDays: days.length, workedHours: days.reduce((n, d) => n + d.workedMinutes, 0) / 60, overtimeHours: days.reduce((n, d) => n + d.overtimeMinutes, 0) / 60, approvedLeaveDays: leave.reduce((n, l) => n.plus(l.days), D()) }, payrollTrend, attendanceTrend, departments: [...departmentMap.values()].sort((a, b) => b.cost.comparedTo(a.cost)), departmentOptions, attendance, leave });
}
export function reportCsv(report) {
  const rows = [["Report month", report.month], ["Currency", report.currency], ["Department", report.departmentOptions.find(d => d.id === report.departmentId)?.name || "All departments"], ["Payroll basis", "Finalized payslips grouped by period start; payments by recorded payment date (UTC)"], ...Object.entries(report.totals), [], ["Payroll month", "Payslips", "Gross", "Net", "Deductions", "Employer cost"], ...report.payrollTrend.map(p => [p.month, p.payslips, p.gross, p.net, p.deductions, p.cost]), [], ["Department", "Finalized payslips", "Net salary", "Employer cost"], ...report.departments.map(d => [d.department, d.payslips, d.net, d.cost]), [], ["Attendance", "Recorded days", "Worked minutes", "Late minutes", "Overtime minutes"], ...report.attendance.map(a => [a.status, a.days, a.workedMinutes, a.lateMinutes, a.overtimeMinutes]), [], ["Date", "Present", "Absent", "On leave", "Worked hours", "Overtime hours"], ...report.attendanceTrend.map(d => [d.date, d.present, d.absent, d.leave, d.workedHours, d.overtimeHours]), [], ["Leave type", "Approved days", "Approved hours"], ...report.leave.map(l => [l.type, l.days, l.hours])];
  return "\uFEFF" + rows.map(row => row.map(v => { const text = String(v ?? ""); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`; }).join(",")).join("\r\n");
}
