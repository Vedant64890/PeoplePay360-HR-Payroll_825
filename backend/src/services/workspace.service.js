import prisma from "../lib/prisma.js";
import { getSettings } from "./settings.service.js";
import { audit, date, dayKey, fail, json, lockEmployee, validateSchedule, expression, D } from "../lib/workspace.js";

const person = { select: { id: true, firstName: true, lastName: true, employeeCode: true } };
export const resources = {
  departments: { model: "department", search: ["name", "code"] },
  positions: { model: "jobPosition", search: ["title", "code"], include: { department: true } },
  employees: { model: "employee", search: ["firstName", "lastName", "employeeCode", "workEmail"], include: { department: true, jobPosition: true, manager: person } },
  contracts: { model: "contract", search: ["name", "reference"], include: { employee: person, department: true, jobPosition: true, salaryStructure: true, workingSchedule: true }, period: ["startDate", "endDate"] },
  schedules: { model: "workingSchedule", search: ["code", "name"], include: { lines: { orderBy: [{ day: "asc" }, { sequence: "asc" }] }, holidays: true } },
  assignments: { model: "employeeScheduleAssignment", search: [], include: { employee: person, workingSchedule: true }, period: ["startDate", "endDate"] },
  categories: { model: "salaryRuleCategory", search: ["code", "name"] },
  structures: { model: "salaryStructure", search: ["code", "name"], include: { rules: { orderBy: { sequence: "asc" }, include: { salaryRule: { include: { category: true } } } } } },
  rules: { model: "salaryRule", search: ["code", "name"], include: { category: true } },
  "leave-types": { model: "leaveType", search: ["code", "name"] },
  allocations: { model: "leaveAllocation", search: ["reference", "name"], include: { employee: person, leaveType: true, approvals: true, consumptions: true }, workflow: true },
  leave: { model: "leaveRequest", search: ["reference", "reason"], include: { employee: person, leaveType: true, days: true, approvals: true }, period: ["startDate", "endDate"], workflow: true },
  attendance: { model: "attendance", search: ["notes"], include: { day: { include: { employee: person } }, corrections: true }, workflow: true },
  payruns: { model: "payrun", search: ["name", "reference"], include: { period: true, salaryStructure: true, employees: { include: { employee: person } }, warnings: true, _count: { select: { payslips: true } } }, workflow: true },
  payslips: { model: "payslip", search: ["number"], include: { employee: person, department: true, period: true }, period: ["periodStart", "periodEnd"], workflow: true },
  roles: { model: "role", search: ["name", "description"], include: { _count: { select: { users: true } } }, key: "code" },
  activity: { model: "auditLog", search: ["action", "entityType"], include: { actor: { select: { name: true } } }, readonly: true },
};
export function resource(name) { return Object.hasOwn(resources, name) ? resources[name] : fail("Workspace section not found.", 404); }
export function resourceId(name, value) {
  if (name === "roles") { if (!["ADMIN", "EMPLOYEE", "HR_MANAGER", "HR_PAYROLL_USER", "HR_PAYROLL_MANAGER", "USER", "MANAGER"].includes(value)) fail("Invalid role."); return value; }
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail("Invalid record ID.");
  return Number(value);
}
export async function listResource(name, query) {
  const config = resource(name), where = {};
  if (name === "attendance") where.voidedAt = null;
  if (query.status && ["employees", "contracts", "leave", "allocations", "payruns", "payslips"].includes(name)) where.status = query.status;
  if (query.q) {
    const contains = { contains: query.q, mode: "insensitive" };
    where.OR = config.search.map(field => ({ [field]: contains }));
    if (config.include?.employee) where.OR.push({ employee: { OR: ["firstName", "lastName", "employeeCode"].map(f => ({ [f]: contains })) } });
    if (name === "attendance") where.OR.push({ day: { employee: { OR: ["firstName", "lastName", "employeeCode"].map(f => ({ [f]: contains })) } } });
    if (!where.OR.length) delete where.OR;
  }
  if (query.employeeId) { if (name === "attendance") where.day = { employeeId: query.employeeId }; else if (config.include?.employee) where.employeeId = query.employeeId; }
  if (query.month) {
    const start = date(`${query.month}-01`), end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    if (config.period) { where[config.period[0]] = { lt: end }; where.AND = [{ OR: [{ [config.period[1]]: null }, { [config.period[1]]: { gte: start } }] }]; if (["leave", "payslips"].includes(name)) where.AND = [{ [config.period[1]]: { gte: start } }]; }
    if (name === "attendance") where.day = { ...where.day, workDate: { gte: start, lt: end } };
    if (name === "payruns") where.period = { startDate: { lt: end }, endDate: { gte: start } };
  }
  if (query.currency && ["payruns", "payslips", "structures", "contracts"].includes(name)) where.currency = query.currency;
  if (query.active !== "all" && ["departments", "positions", "schedules", "structures", "rules", "leave-types"].includes(name)) where.isActive = query.active === "true";
  const [items, total] = await prisma.$transaction([prisma[config.model].findMany({ where, include: config.include, orderBy: { [config.key || "id"]: "desc" }, take: 20, skip: (query.page - 1) * 20 }), prisma[config.model].count({ where })]);
  return json({ items: items.map(item => name === "allocations" ? { ...item, remaining: D(item.amount).minus(item.consumptions.filter(c => !c.releasedAt).reduce((n, c) => n.plus(c.amount), D())).toString() } : item), total, page: query.page, pageSize: 20 });
}
export async function detailResource(name, id) {
  const config = resource(name);
  const extra = name === "payslips" ? { lines: { orderBy: { sequence: "asc" } }, inputs: true, workedTime: true, warnings: true, payments: true, payrun: { select: { id: true, version: true, status: true } } } : name === "payruns" ? { payslips: { include: { employee: person } } } : {};
  const item = await prisma[config.model].findUnique({ where: { [config.key || "id"]: id }, include: { ...config.include, ...extra } });
  if (!item) fail("Record not found.", 404);
  return json(item);
}
function dates(data) {
  for (const key of ["hireDate", "terminationDate", "startDate", "endDate", "probationEndDate"]) if (data[key]) data[key] = date(data[key]);
  return data;
}
async function validateRelations(tx, name, data, id, before) {
  if (["employees", "contracts", "assignments"].includes(name)) {
    if (name !== "employees" || id) await lockEmployee(tx, name === "employees" ? id : data.employeeId);
    if (data.jobPositionId) { const pos = await tx.jobPosition.findUnique({ where: { id: data.jobPositionId } }); if (!pos || (pos.departmentId && pos.departmentId !== data.departmentId)) fail("Job position must belong to the selected department."); }
  }
  if (name === "employees") {
    let managerId = data.managerId; const seen = new Set(id ? [id] : []);
    while (managerId) { if (seen.has(managerId)) fail("Employee reporting lines cannot contain a cycle."); seen.add(managerId); const manager = await tx.employee.findUnique({ where: { id: managerId }, select: { managerId: true } }); if (!manager) fail("Manager not found."); managerId = manager.managerId; }
    if (before?.status === "ARCHIVED" && data.status !== "ARCHIVED") data.archivedAt = null;
    if (data.status === "ARCHIVED") data.archivedAt = new Date();
  }
  if (name === "contracts") {
    const computed = id ? await tx.payslip.findMany({ where: { contractId: id, status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { periodEnd: true } }) : [];
    if (computed.length) {
      const lifecycle = ["status", "endDate", "terminationDate", "terminationReason"];
      for (const [key, value] of Object.entries(data)) if (!lifecycle.includes(key) && String(json(value ?? null)) !== String(json(before[key] ?? null))) fail("Payroll already uses these contract terms. End this contract and create a new contract for changed terms.", 409);
      const end = [data.endDate, data.terminationDate].filter(Boolean).sort((a, b) => a - b)[0];
      if (["DRAFT", "CANCELLED"].includes(data.status) || (end && computed.some(s => s.periodEnd > end))) fail("The contract change would invalidate existing computed payroll.", 409);
    }
    if (data.salaryStructureId) {
      const structure = await tx.salaryStructure.findUnique({ where: { id: data.salaryStructureId } });
      if (!structure?.isActive || structure.currency !== data.currency || structure.payFrequency !== data.payFrequency) fail("Choose an active salary structure with matching currency and pay frequency.");
    }
    const schedule = await tx.workingSchedule.findUnique({ where: { id: data.workingScheduleId } });
    if (!schedule?.isActive) fail("Choose an active working schedule.");
    if (!["DRAFT", "CANCELLED"].includes(data.status)) {
      const end = [data.endDate, data.terminationDate].filter(Boolean).sort((a, b) => a - b)[0];
      const candidates = await tx.contract.findMany({ where: { employeeId: data.employeeId, id: { not: id || 0 }, status: { in: ["OPEN", "EXPIRED", "TERMINATED"] }, ...(end ? { startDate: { lte: end } } : {}) } });
      if (candidates.some(c => (!c.endDate || c.endDate >= data.startDate) && (!c.terminationDate || c.terminationDate >= data.startDate))) fail("Approved contracts for this employee cannot overlap.", 409);
    }
  }
  if (name === "assignments") {
    if (before && before.employeeId !== data.employeeId) fail("Keep the same employee when editing a schedule assignment.", 409);
    if (before && await tx.attendanceDay.count({ where: { employeeId: before.employeeId, workDate: { gte: before.startDate, ...(before.endDate ? { lte: before.endDate } : {}) } } })) fail("This assignment is part of attendance history. Create a new dated assignment.", 409);
    if (!(await tx.workingSchedule.findUnique({ where: { id: data.workingScheduleId } }))?.isActive) fail("Choose an active working schedule.");
    const overlaps = await tx.employeeScheduleAssignment.count({ where: { id: { not: id || 0 }, employeeId: data.employeeId, ...(data.endDate ? { startDate: { lte: data.endDate } } : {}), OR: [{ endDate: null }, { endDate: { gte: data.startDate } }] } });
    if (overlaps) fail("Schedule assignments cannot overlap.", 409);
  }
  if (name === "schedules") {
    validateSchedule(data.lines);
    if (id && (await tx.contract.count({ where: { workingScheduleId: id } }) || await tx.employeeScheduleAssignment.count({ where: { workingScheduleId: id } }) || await tx.attendanceDay.count({ where: { workingScheduleId: id } }))) fail("This schedule is in use. Create a new schedule version to preserve history.", 409);
  }
  if (name === "rules") {
    const category = await tx.salaryRuleCategory.findUnique({ where: { id: data.categoryId } });
    if (!category) fail("Salary category not found.");
    const effects = { BASIC: "EARNING", ALLOWANCE: "EARNING", GROSS: "INFORMATIONAL", NET: "INFORMATIONAL", DEDUCTION: "DEDUCTION", EMPLOYER_CONTRIBUTION: "EMPLOYER_COST" };
    if (effects[category.type] && effects[category.type] !== data.effect) fail("Rule effect does not match its salary category.");
    if (["WAGE", "GROSS", "NET", "WORKED_HOURS", "SCHEDULED_DAYS", "PAID_DAYS"].includes(data.code) && !["GROSS", "NET"].includes(category.type)) fail("This rule code is reserved for a payroll value.");
    for (const source of [data.formula, data.percentageBase, data.quantityFormula, data.conditionFormula, data.conditionBase].filter(Boolean)) {
      const codes = source.match(/[A-Z][A-Z0-9_]*/g) || [];
      expression(source, Object.fromEntries(codes.map(c => [c, 1])));
    }
    if (data.conditionMinimum != null && data.conditionMaximum != null && D(data.conditionMinimum).gt(data.conditionMaximum)) fail("Condition minimum must not exceed maximum.");
  }
  if (name === "structures") {
    const ids = data.rules.map(r => r.salaryRuleId);
    if (new Set(ids).size !== ids.length || new Set(data.rules.map(r => r.sequence)).size !== ids.length) fail("Each salary rule and sequence must be unique.");
    if (await tx.salaryRule.count({ where: { id: { in: ids } } }) !== ids.length) fail("A selected salary rule no longer exists.");
  }
}
export async function saveResource(name, input, actorId, id, { hrOnly = false } = {}) {
  const config = resource(name);
  if (config.readonly || config.workflow) fail("Use this record's workflow action.", 405);
  if (name === "roles" && (!id || id === "ADMIN")) fail("The administrator role is fixed; edit another existing role.", 409);
  return prisma.$transaction(async tx => {
    const before = id ? await tx[config.model].findUnique({ where: { [config.key || "id"]: id } }) : null;
    if (id && !before) fail("Record not found.", 404);
    const data = dates({ ...input });
    if (hrOnly && name === "contracts") { data.salaryStructureId = before?.salaryStructureId ?? null; data.payFrequency = before?.payFrequency ?? "MONTHLY"; }
    await validateRelations(tx, name, data, id, before);
    if (name === "schedules") {
      const { lines, holidays } = data;
      data.lines = { ...(id ? { deleteMany: {} } : {}), create: lines };
      data.holidays = { ...(id ? { deleteMany: {} } : {}), create: holidays.map(h => ({ ...h, date: date(h.date) })) };
    }
    if (name === "structures") { data.rules = { ...(id ? { deleteMany: {} } : {}), create: data.rules }; }
    if (id && ["structures", "rules"].includes(name)) data.revision = { increment: 1 };
    const item = id ? await tx[config.model].update({ where: { [config.key || "id"]: id }, data }) : await tx[config.model].create({ data });
    if (name === "employees" || name === "contracts") await tx.employmentHistory.create({ data: { employeeId: name === "employees" ? item.id : item.employeeId, eventType: name === "contracts" ? "CONTRACT_CHANGED" : id ? "STATUS_CHANGED" : "HIRED", effectiveDate: name === "contracts" ? item.startDate : item.hireDate, after: json(item), ...(before ? { before: json(before) } : {}), changedById: actorId } });
    await audit(tx, actorId, `${name.toUpperCase()}_${id ? "UPDATED" : "CREATED"}`, config.model, item[config.key || "id"]);
    return json(item);
  }, { isolationLevel: "Serializable", timeout: 20000 });
}
export async function archiveResource(name, id, actorId) {
  const config = resource(name);
  const data = name === "employees" ? { status: "ARCHIVED", archivedAt: new Date() } : ["departments", "positions", "schedules", "structures", "rules", "leave-types"].includes(name) ? { isActive: false } : null;
  if (!data) fail("This historical record cannot be archived here.", 409);
  return prisma.$transaction(async tx => { const item = await tx[config.model].update({ where: { id }, data }); await audit(tx, actorId, `${name.toUpperCase()}_ARCHIVED`, config.model, id); return json(item); });
}

export async function lookups() {
  const [employees, departments, positions, schedules, structures, rules, categories, leaveTypes, users, settings] = await Promise.all([
    prisma.employee.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, firstName: true, lastName: true, employeeCode: true, departmentId: true, jobPositionId: true, employeeType: true }, orderBy: { firstName: "asc" } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), prisma.jobPosition.findMany({ where: { isActive: true }, orderBy: { title: "asc" } }),
    prisma.workingSchedule.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.salaryStructure.findMany({ where: { isActive: true }, select: { id: true, name: true, currency: true, payFrequency: true }, orderBy: { name: "asc" } }),
    prisma.salaryRule.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { sequence: "asc" } }),
    prisma.salaryRuleCategory.findMany({ orderBy: { name: "asc" } }), prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  return json({ employees, departments, positions, schedules, structures, rules, categories, leaveTypes, users, settings });
}

export { reports, reportCsv } from "./reports.service.js";
