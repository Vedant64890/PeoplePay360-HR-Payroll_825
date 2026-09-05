import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { schemas } from "../src/validators/workspace.validator.js";
import { saveResource } from "../src/services/workspace.service.js";
import { saveAttendance, createAllocation, decideLeave } from "../src/services/time.service.js";
import { dayKey, dateRange } from "../src/lib/workspace.js";
import { createPayrun, payrunAction } from "../src/services/payroll.service.js";
import { randomUUID } from "node:crypto";

// Opt-in representative data. Existing accounts and business records are never overwritten.
const tag = `DEMO${Date.now()}`, password = process.env.DEMO_PASSWORD || randomBytes(18).toString("base64url");
const ids = { users: [], employees: [], departments: [], positions: [], schedules: [], categories: [], rules: [], structures: [], leaveTypes: [], runs: [] };
const accounts = [];
try {
  for (const [role, name] of [["HR_PAYROLL_MANAGER", "Maya Shah"], ["HR_PAYROLL_USER", "Rohan Mehta"], ["HR_MANAGER", "Priya Rao"], ["EMPLOYEE", "Aarav Mehta"]]) {
    const email = `${tag.toLowerCase()}-${role.toLowerCase()}@example.test`;
    const user = await prisma.user.create({ data: { name, email, password: await hashPassword(password), role } });
    ids.users.push(user.id); accounts.push({ id: user.id, role, name, email });
  }
  const actor = accounts[0].id;
  const create = async (resource, data, collection) => { const result = await saveResource(resource, schemas[resource].parse(data), actor); if (collection) ids[collection].push(result.id); return result; };
  const department = await create("departments", { code: tag, name: `${tag} · Product & Engineering` }, "departments");
  const position = await create("positions", { code: tag, title: "Product engineer", departmentId: department.id }, "positions");
  const schedule = await create("schedules", { code: tag, name: `${tag} · 40-hour working week`, timezone: "Asia/Kolkata", lines: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(day => ({ day, sequence: 10, startMinute: 540, endMinute: 1080, endDayOffset: 0, breakMinutes: 60 })) }, "schedules");
  const category = await create("categories", { code: tag, name: `${tag} · Basic pay`, type: "BASIC" }, "categories");
  const rule = await create("rules", { code: tag, name: "Basic salary", categoryId: category.id, effect: "EARNING", computationMethod: "FORMULA", formula: "WAGE" }, "rules");
  const structure = await create("structures", { code: tag, name: `${tag} · Monthly salary`, currency: "INR", rules: [{ salaryRuleId: rule.id, sequence: 10 }] }, "structures");
  const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const employee = await create("employees", { employeeCode: tag, userId: accounts[3].id, firstName: "Aarav", lastName: "Mehta", workEmail: accounts[3].email, departmentId: department.id, jobPositionId: position.id, hireDate: dayKey(start), status: "ACTIVE", employeeType: "FULL_TIME", workLocation: "Ahmedabad" }, "employees");
  await create("contracts", { reference: tag, name: `${tag} · Employment contract`, employeeId: employee.id, departmentId: department.id, jobPositionId: position.id, employeeType: "FULL_TIME", startDate: dayKey(start), wage: "48000", currency: "INR", wageBasis: "MONTHLY", salaryStructureId: structure.id, workingScheduleId: schedule.id, status: "OPEN" });
  const leaveType = await create("leave-types", { code: tag, name: `${tag} · Paid time off`, requiresAllocation: true }, "leaveTypes");
  const allocation = await createAllocation(schemas.allocations.parse({ employeeId: employee.id, leaveTypeId: leaveType.id, name: "Annual leave allowance", amount: "18", validFrom: dayKey(start) }), actor);
  await decideLeave("allocations", allocation.id, "approve", actor);
  for (const day of dateRange(start, end)) if (![0, 6].includes(day.getUTCDay())) await saveAttendance({ employeeId: employee.id, checkIn: `${dayKey(day)}T03:30:00Z`, checkOut: `${dayKey(day)}T12:30:00Z`, breakMinutes: 60 }, actor);
  let run = await createPayrun(schemas.payruns.parse({ name: `${tag} · ${dayKey(start).slice(0, 7)} salary`, startDate: dayKey(start), endDate: dayKey(end), salaryStructureId: structure.id, employeeIds: [employee.id], idempotencyKey: randomUUID() }), actor); ids.runs.push(run.id);
  for (const action of ["compute", "validate", "pay"]) run = await payrunAction(run.id, { action, version: run.version, ...(action === "pay" ? { method: "OTHER", externalReference: "DEMO payment record - no bank transfer", idempotencyKey: randomUUID() } : {}) }, actor);
  await mkdir(".data", { recursive: true });
  const manifest = { tag, password, accounts, ids, month: dayKey(start).slice(0, 7) };
  await writeFile(`.data/${tag}.json`, JSON.stringify(manifest, null, 2));
  console.log(`Demo workspace created. Private credentials and record IDs: backend/.data/${tag}.json`);
  console.log(`Select ${manifest.month} to see completed payroll and attendance. No emails or bank transfers were sent.`);
} catch (error) {
  await mkdir(".data", { recursive: true });
  await writeFile(`.data/${tag}-incomplete.json`, JSON.stringify({ tag, password, accounts, ids }, null, 2));
  throw error;
} finally { await prisma.$disconnect(); }
