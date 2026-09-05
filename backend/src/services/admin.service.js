import prisma from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import AppError from "../utils/AppError.js";

export const accountSelect = { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true };
const pageSize = 10;
const activeEmployee = { status: { notIn: ["ARCHIVED", "TERMINATED"] } };
const auditSelect = { id: true, action: true, entityType: true, entityId: true, createdAt: true, actor: { select: { name: true } } };
const serializeAudit = (events) => events.map((event) => ({ ...event, id: event.id.toString() }));
const audit = (actorId, action, entityType, entityId, before, after) => ({ actorId, action, entityType, entityId: String(entityId), ...(before ? { before } : {}), ...(after ? { after } : {}) });

export async function getDashboard({ month, currency }) {
  const now = new Date();
  const currentMonth = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).slice(0, 7);
  const selectedMonth = month || currentMonth;
  const start = new Date(`${selectedMonth}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const trendStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 5, 1));
  const today = new Date(now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const leaveWhere = { startDate: { lt: end }, endDate: { gte: start } };
  const [employees, activeEmployees, accounts, departments, attendance, pendingLeave, approvedLeave, payments, trends, recentPayruns, recentLeave, recentAttendance, activity, warnings, currencies] = await Promise.all([
    prisma.employee.count({ where: activeEmployee }),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true, _count: { select: { employees: { where: activeEmployee } } } }, orderBy: { name: "asc" } }),
    prisma.attendanceDay.groupBy({ by: ["status"], where: { workDate: { gte: start, lt: end, lte: today } }, _count: { _all: true } }),
    prisma.leaveRequest.count({ where: { ...leaveWhere, status: { in: ["SUBMITTED", "FIRST_APPROVED"] } } }),
    prisma.leaveRequest.count({ where: { ...leaveWhere, status: "APPROVED" } }),
    prisma.payrollPayment.aggregate({ where: { currency, status: "SUCCEEDED", paidAt: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.$queryRaw`SELECT to_char("paidAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month, SUM(amount)::text AS total FROM "payroll"."PayrollPayment" WHERE status = 'SUCCEEDED' AND currency = ${currency} AND "paidAt" >= ${trendStart} AND "paidAt" < ${end} GROUP BY 1 ORDER BY 1`,
    prisma.payrun.findMany({ where: { period: { startDate: { lt: end }, endDate: { gte: start } } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, name: true, reference: true, currency: true, status: true, createdAt: true, period: { select: { name: true, startDate: true, endDate: true } }, _count: { select: { payslips: true } } } }),
    prisma.leaveRequest.findMany({ where: leaveWhere, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, reference: true, status: true, startDate: true, endDate: true, duration: true, unit: true, employee: { select: { firstName: true, lastName: true } }, leaveType: { select: { name: true } } } }),
    prisma.attendanceDay.findMany({ where: { workDate: { gte: start, lt: end, lte: today } }, orderBy: [{ workDate: "desc" }, { id: "desc" }], take: 20, select: { id: true, workDate: true, status: true, workedMinutes: true, lateMinutes: true, employee: { select: { firstName: true, lastName: true } } } }),
    prisma.auditLog.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: auditSelect }),
    prisma.payrollWarning.count({ where: { status: "OPEN", severity: "BLOCKING" } }),
    prisma.salaryStructure.findMany({ distinct: ["currency"], select: { currency: true } }),
  ]);
  const statusCount = (status) => attendance.find((row) => row.status === status)?._count._all || 0;
  const present = statusCount("PRESENT");
  const absent = statusCount("ABSENT");
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(trendStart.getUTCFullYear(), trendStart.getUTCMonth() + index, 1));
    const key = date.toISOString().slice(0, 7);
    return { month: key, total: trends.find((row) => row.month === key)?.total || "0" };
  });
  return {
    month: selectedMonth, currency, updatedAt: now,
    currencies: [...new Set([currency, "INR", ...currencies.map((row) => row.currency)])].sort(),
    metrics: { employees, activeEmployees, accounts, pendingLeave, approvedLeave, present, absent, attendanceRate: present + absent ? Math.round(present / (present + absent) * 100) : null, paidSalary: payments._sum.amount?.toString() || "0", warnings },
    departments: departments.map((department) => ({ id: department.id, name: department.name, employees: department._count.employees })),
    trend: months, payruns: recentPayruns, leave: recentLeave, attendance: recentAttendance, activity: serializeAudit(activity),
  };
}

export async function listAccounts({ q, page }) {
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {};
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ where, select: accountSelect, orderBy: { id: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function listEmployees({ q, page }) {
  const where = { ...activeEmployee, ...(q ? { OR: ["firstName", "lastName", "employeeCode", "workEmail"].map((field) => ({ [field]: { contains: q, mode: "insensitive" } })) } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.employee.findMany({ where, select: { id: true, employeeCode: true, firstName: true, lastName: true, workEmail: true, employeeType: true, status: true, hireDate: true, department: { select: { name: true } }, jobPosition: { select: { title: true } } }, orderBy: { id: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.employee.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function createAccount(data, actorId) {
  const password = await hashPassword(data.password);
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await tx.role.findUnique({ where: { code: data.role } })) throw new AppError("This role is no longer available. Choose another role.", 409);
      const user = await tx.user.create({ data: { ...data, password }, select: accountSelect });
      await tx.auditLog.create({ data: audit(actorId, "USER_CREATED", "User", user.id, null, { name: user.name, role: user.role }) });
      return user;
    });
  } catch (error) {
    if (error.code === "P2002") throw new AppError("An account with this email already exists.", 409);
    throw error;
  }
}

export async function updateAccount(id, changes, actorId) {
  if (id === actorId && (changes.isActive === false || (changes.role && changes.role !== "ADMIN"))) {
    throw new AppError("You cannot disable your own account or remove your administrator role.", 409);
  }
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: accountSelect });
    if (!before) throw new AppError("Account not found.", 404);
    if (changes.role && !await tx.role.findUnique({ where: { code: changes.role } })) throw new AppError("This role is no longer available. Choose another role.", 409);
    const user = await tx.user.update({ where: { id }, data: changes, select: accountSelect });
    await tx.auditLog.create({ data: audit(actorId, "USER_ACCESS_UPDATED", "User", id, { role: before.role, isActive: before.isActive }, { role: user.role, isActive: user.isActive }) });
    return user;
  });
}

export async function deleteAccount(id, actorId) {
  if (id === actorId) throw new AppError("You cannot delete your own account.", 409);
  try {
    return await prisma.$transaction(async tx => {
      const before = await tx.user.findUnique({ where: { id }, select: accountSelect });
      if (!before) throw new AppError("Account not found.", 404);
      if (await tx.employee.count({ where: { userId: id } })) throw new AppError("This account is linked to an employee. Disable its access instead to preserve the employee record.", 409);
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({ data: audit(actorId, "USER_DELETED", "User", id, { name: before.name, email: before.email, role: before.role }, { deleted: true }) });
      return { id };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error.code === "P2003") throw new AppError("This account has recorded activity or approvals. Disable its access instead to preserve history.", 409);
    if (error.code === "P2034") throw new AppError("The account changed during deletion. Refresh and try again.", 409);
    throw error;
  }
}

export async function removeRole(tx, code, actorId) {
  if (["ADMIN", "USER"].includes(code)) throw new AppError("The Administrator and default registration roles are required by the application and cannot be deleted.", 409);
  const before = await tx.role.findUnique({ where: { code } });
  if (!before) throw new AppError("Role not found.", 404);
  if (await tx.user.count({ where: { role: code } })) throw new AppError("This role is assigned to accounts. Reassign those accounts before deleting it.", 409);
  await tx.rolePermission.deleteMany({ where: { role: code } });
  await tx.role.delete({ where: { code } });
  await tx.auditLog.create({ data: audit(actorId, "ROLE_DELETED", "Role", code, { name: before.name, code }, { deleted: true }) });
  return { code };
}
export const deleteRole = (code, actorId) => prisma.$transaction(tx => removeRole(tx, code, actorId), { isolationLevel: "Serializable" });

export async function createEmployee(data, actorId) {
  try {
    return await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({ data: { ...data, hireDate: new Date(data.hireDate), status: "ACTIVE" } });
      await tx.employmentHistory.create({ data: { employeeId: employee.id, eventType: "HIRED", effectiveDate: employee.hireDate, after: { employeeCode: employee.employeeCode, employeeType: employee.employeeType, status: employee.status }, changedById: actorId } });
      await tx.auditLog.create({ data: audit(actorId, "EMPLOYEE_CREATED", "Employee", employee.id, null, { name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode }) });
      return { id: employee.id, employeeCode: employee.employeeCode };
    });
  } catch (error) {
    if (error.code === "P2002") throw new AppError("An employee with this code or work email already exists.", 409);
    if (error.code === "P2003") throw new AppError("The selected department no longer exists.", 400);
    throw error;
  }
}
