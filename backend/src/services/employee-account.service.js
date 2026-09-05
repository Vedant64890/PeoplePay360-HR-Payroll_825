import { randomUUID } from "node:crypto";
import { audit, date, fail } from "../lib/workspace.js";
import { getSettings } from "./settings.service.js";

// Disabling sign-in does not remove an employee from HR records.
export const employeeAccountFilter = { user: { is: { role: "EMPLOYEE" } } };

export async function requireEmployeeAccount(tx, data, before) {
  const userId = data.userId === undefined ? before?.userId : data.userId;
  if (!userId) fail("Create an Employee workspace account in Users and roles first. Employee profiles must be linked to an account.");
  if (before?.userId && before.userId !== userId) fail("An employee profile cannot be reassigned to another workspace account.", 409);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "EMPLOYEE") fail("The linked account must have the Employee workspace role.");
  data.userId = userId;
}

// Run inside the account transaction so login access and its profile stay together.
export async function ensureEmployeeProfile(tx, user, actorId) {
  if (user.role !== "EMPLOYEE") return null;
  const linked = await tx.employee.findUnique({ where: { userId: user.id } });
  if (linked) return linked;

  const existing = await tx.employee.findFirst({ where: { workEmail: { equals: user.email, mode: "insensitive" } } });
  if (existing) {
    if (existing.userId) fail("An employee with this email is already linked to another account.", 409);
    const updated = await tx.employee.updateMany({ where: { id: existing.id, userId: null }, data: { userId: user.id } });
    if (!updated.count) fail("This employee was linked elsewhere. Refresh and try again.", 409);
    await audit(tx, actorId, "EMPLOYEE_ACCOUNT_LINKED", "Employee", existing.id, { userId: user.id });
    return { ...existing, userId: user.id };
  }

  const [firstName, ...lastName] = user.name.trim().split(/\s+/);
  const settings = await getSettings(tx);
  const hireDate = date(new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone }));
  let employeeCode = `EMP-${String(user.id).padStart(5, "0")}`;
  if (await tx.employee.findUnique({ where: { employeeCode }, select: { id: true } })) employeeCode += `-${randomUUID().slice(0, 8).toUpperCase()}`;
  const employee = await tx.employee.create({ data: {
    userId: user.id, employeeCode, firstName, lastName: lastName.join(" "),
    workEmail: user.email, hireDate, employeeType: "FULL_TIME", status: "ONBOARDING",
  } });
  await tx.employmentHistory.create({ data: {
    employeeId: employee.id, eventType: "HIRED", effectiveDate: hireDate, changedById: actorId,
    after: { employeeCode, userId: user.id, employeeType: employee.employeeType, status: employee.status },
  } });
  await audit(tx, actorId, "EMPLOYEE_CREATED", "Employee", employee.id, { employeeCode, userId: user.id });
  return employee;
}
