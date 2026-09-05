import prisma from "../lib/prisma.js";
import { D, date, dateRange, dayKey, json } from "../lib/workspace.js";

export async function reports({ month, currency = "INR", departmentId, trendMonths = 6 }) {
  const start = date(`${month || dayKey(new Date()).slice(0, 7)}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const trendStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - trendMonths + 1, 1));
  const departmentScope = departmentId ? { departmentId } : {};
  const [slips, days, leaves, payments, contracts, departmentOptions, currentEmployees] = await Promise.all([
    prisma.payslip.findMany({ where: { currency, ...departmentScope, periodStart: { gte: trendStart, lt: end }, status: { in: ["VALIDATED", "PARTIALLY_PAID", "PAID"] } }, select: { id: true, periodStart: true, departmentId: true, department: { select: { name: true } }, grossAmount: true, deductionAmount: true, netAmount: true, employerCostAmount: true } }),
    prisma.attendanceDay.findMany({ where: { workDate: { gte: start, lt: end }, ...(departmentId ? { employee: departmentScope } : {}) }, select: { workDate: true, status: true, workedMinutes: true, lateMinutes: true, overtimeMinutes: true } }),
    prisma.leaveRequestDay.findMany({ where: { date: { gte: start, lt: end }, leaveRequest: { status: "APPROVED", ...(departmentId ? { employee: departmentScope } : {}) } }, select: { durationDays: true, durationHours: true, leaveRequest: { select: { leaveTypeId: true, leaveType: { select: { name: true } } } } } }),
    prisma.payrollPayment.aggregate({ where: { currency, status: "SUCCEEDED", paidAt: { gte: start, lt: end }, ...(departmentId ? { payslip: departmentScope } : {}) }, _sum: { amount: true } }),
    prisma.contract.count({ where: { ...departmentScope, status: "OPEN", endDate: { gte: start, lt: end } } }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.count({ where: { ...departmentScope, status: { notIn: ["ARCHIVED", "TERMINATED"] } } }),
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
  for (const slip of selected) {
    const key = slip.departmentId || 0, row = departmentMap.get(key) || { departmentId: slip.departmentId, department: slip.department?.name || "Unassigned", payslips: 0, gross: D(), net: D(), deductions: D(), cost: D() };
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
  const leave = [...new Set(leaves.map(l => l.leaveRequest.leaveTypeId))].map(id => {
    const rows = leaves.filter(l => l.leaveRequest.leaveTypeId === id);
    return { leaveTypeId: id, type: rows[0].leaveRequest.leaveType.name, days: rows.reduce((n, l) => n.plus(l.durationDays), D()), hours: rows.reduce((n, l) => n.plus(l.durationHours), D()) };
  });
  const present = attendance.find(a => a.status === "PRESENT").days, absent = attendance.find(a => a.status === "ABSENT").days;
  return json({ month: dayKey(start).slice(0, 7), currency, departmentId: departmentId || null, trendMonths, generatedAt: new Date(), totals: { finalizedPayslips: selected.length, gross: total("grossAmount"), deductions: total("deductionAmount"), net: total("netAmount"), employerCost: total("employerCostAmount"), averageNetPerPayslip: selected.length ? D(total("netAmount")).div(selected.length).toFixed(2) : "0.00", paymentsRecorded: payments._sum.amount || "0", contractsExpiring: contracts, currentEmployees, recordedAttendanceRate: present + absent ? Math.round(present / (present + absent) * 1000) / 10 : null, recordedDays: days.length, workedHours: days.reduce((n, d) => n + d.workedMinutes, 0) / 60, overtimeHours: days.reduce((n, d) => n + d.overtimeMinutes, 0) / 60, approvedLeaveDays: leave.reduce((n, l) => n.plus(l.days), D()) }, payrollTrend, attendanceTrend, departments: [...departmentMap.values()].sort((a, b) => b.cost.comparedTo(a.cost)), departmentOptions, attendance, leave });
}
export function reportCsv(report) {
  const rows = [["Report month", report.month], ["Currency", report.currency], ["Department", report.departmentOptions.find(d => d.id === report.departmentId)?.name || "All departments"], ["Payroll basis", "Finalized payslips grouped by period start; payments by recorded payment date (UTC)"], ...Object.entries(report.totals), [], ["Payroll month", "Payslips", "Gross", "Net", "Deductions", "Employer cost"], ...report.payrollTrend.map(p => [p.month, p.payslips, p.gross, p.net, p.deductions, p.cost]), [], ["Department", "Finalized payslips", "Net salary", "Employer cost"], ...report.departments.map(d => [d.department, d.payslips, d.net, d.cost]), [], ["Attendance", "Recorded days", "Worked minutes", "Late minutes", "Overtime minutes"], ...report.attendance.map(a => [a.status, a.days, a.workedMinutes, a.lateMinutes, a.overtimeMinutes]), [], ["Date", "Present", "Absent", "On leave", "Worked hours", "Overtime hours"], ...report.attendanceTrend.map(d => [d.date, d.present, d.absent, d.leave, d.workedHours, d.overtimeHours]), [], ["Leave type", "Approved days", "Approved hours"], ...report.leave.map(l => [l.type, l.days, l.hours])];
  return "\uFEFF" + rows.map(row => row.map(v => { const text = String(v ?? ""); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`; }).join(",")).join("\r\n");
}
