import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import workspaceRoutes from "./workspace.routes.js";
import { lookups, resourceId } from "../services/workspace.service.js";
import { hrResources, removeHrRecord, hrDetail, attendanceDays, rebuildAttendance } from "../services/hr.service.js";
import { createLeave, createAllocation } from "../services/time.service.js";
import { schemas, workspaceQuery, reportQuery, payrunScopeQuery } from "../validators/workspace.validator.js";
import { eligiblePayrunEmployees } from "../services/payroll.service.js";
import { payrollDashboard } from "../services/payroll-dashboard.service.js";
import { reports, reportCsv } from "../services/reports.service.js";
import { audit, fail, json } from "../lib/workspace.js";

const router = Router();
router.use(authenticate, authorizeRoles("ADMIN", "HR_PAYROLL_MANAGER", "HR_PAYROLL_USER"));
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.cookies?.[process.env.JWT_COOKIE_NAME || "access_token"] && req.get("Origin") !== (process.env.FRONTEND_URL || "http://localhost:3000")) return res.status(403).json({ success: false, message: "Use the workspace application for changes." });
  next();
});
const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) {
  const errors = { P2002: [409, "A matching record already exists."], P2003: [409, "This record is referenced by other records. Archive or cancel it instead."], P2025: [409, "This record changed or no longer exists. Reload it."], P2034: [409, "Another update happened at the same time. Reload and retry."] };
  if (errors[e.code]) [e.statusCode, e.message] = errors[e.code]; next(e);
} };
const parse = (schema, value) => { const r = schema.safeParse(value); if (!r.success) fail(r.error.issues.map(i => i.message).join("; ")); return r.data; };
const send = (res, data) => res.json({ success: true, data: json(data) });
const querySchema = reportQuery.extend({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).default(new Date().toISOString().slice(0, 7)), currency: z.string().regex(/^[A-Z]{3}$/).default("INR"), employeeType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "TEMPORARY"]).optional() });
router.get("/dashboard", route(async (req, res) => send(res, await payrollDashboard(parse(querySchema, req.query)))));
router.get("/profile", route(async (req, res) => send(res, await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, role: true } }))));
router.put("/profile", route(async (req, res) => {
  const input = parse(z.object({ name: z.string().trim().min(1).max(150) }).strict(), req.body);
  send(res, await prisma.$transaction(async tx => { const saved = await tx.user.update({ where: { id: req.user.id }, data: input, select: { id: true, name: true, email: true, role: true } }); await audit(tx, req.user.id, "PROFILE_UPDATED", "User", req.user.id); return saved; }));
}));
const allowed = new Set([...hrResources, "payruns", "payslips", "structures", "rules", "categories", "lookups", "reports", "attendance-days"]);
router.use("/workspace/:resource", (req, res, next) => {
  const name = req.params.resource;
  if (!allowed.has(name)) return res.status(403).json({ success: false, message: "System administration is restricted to Admin." });
  if (req.user.role === "HR_PAYROLL_USER" && (req.method === "DELETE" && ["payruns", "payslips"].includes(name) || !["GET", "HEAD"].includes(req.method) && ["structures", "rules", "categories"].includes(name))) return res.status(403).json({ success: false, message: "Payroll configuration changes require Payroll Manager access." });
  if (["POST", "PUT"].includes(req.method) && name === "employees" && Object.hasOwn(req.body, "userId")) return res.status(403).json({ success: false, message: "Account links are managed by Admin." });
  next();
});
router.get("/workspace/lookups", route(async (_req, res) => { const { users, settings, ...data } = await lookups(); send(res, { ...data, settings: { timezone: settings.timezone, defaultCurrency: settings.defaultCurrency, organizationName: settings.organizationName } }); }));
router.get("/workspace/payruns/eligible", route(async (req, res) => send(res, await eligiblePayrunEmployees(parse(payrunScopeQuery, req.query)))));
router.get("/workspace/reports", route(async (req, res) => send(res, await reports(parse(querySchema, req.query)))));
router.get("/workspace/reports/export", route(async (req, res) => res.type("text/csv").attachment("payroll-report.csv").send(reportCsv(await reports(parse(querySchema, req.query))))));
router.get("/workspace/employees/:id", route(async (req, res) => send(res, await hrDetail("employees", resourceId("employees", req.params.id)))));
const monthQuery = workspaceQuery.extend({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/) });
router.get("/workspace/attendance-days", route(async (req, res) => send(res, await attendanceDays(parse(monthQuery, req.query)))));
router.post("/workspace/attendance-days/recalculate", route(async (req, res) => send(res, await rebuildAttendance(parse(monthQuery, req.body), req.user.id))));
for (const name of ["leave", "allocations"]) router.put(`/workspace/${name}/:id`, route(async (req, res) => send(res, await (name === "leave" ? createLeave : createAllocation)(parse(schemas[name], req.body), req.user.id, resourceId(name, req.params.id)))));
router.put("/workspace/payruns/:id", route(async (req, res) => {
  const id = resourceId("payruns", req.params.id);
  const input = parse(z.object({ name: z.string().trim().min(1).max(150), notes: z.string().max(3000).nullable().optional(), version: z.number().int().positive() }).strict(), req.body);
  send(res, await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM payroll."Payrun" WHERE id = ${id} FOR UPDATE`;
    const run = await tx.payrun.findUnique({ where: { id } });
    if (!run || run.status !== "DRAFT" || run.version !== input.version) fail("Only the current draft payrun can be edited. Reload first.", 409);
    const saved = await tx.payrun.update({ where: { id }, data: { name: input.name, notes: input.notes, version: { increment: 1 } } });
    await audit(tx, req.user.id, "PAYRUN_UPDATED", "Payrun", id); return saved;
  }));
}));
router.delete("/workspace/:resource/:id", route(async (req, res) => {
  const name = req.params.resource, id = resourceId(name, req.params.id);
  if (hrResources.has(name)) return send(res, await removeHrRecord(name, id, req.user.id, req.body?.reason));
  if (!["structures", "rules", "categories", "payruns", "payslips"].includes(name)) fail("This record cannot be deleted here.", 405);
  if (!req.body?.reason?.trim()) fail("Provide a deletion reason.");
  send(res, await prisma.$transaction(async tx => {
    const model = { structures: "salaryStructure", rules: "salaryRule", categories: "salaryRuleCategory", payruns: "payrun", payslips: "payslip" }[name];
    const before = await tx[model].findUnique({ where: { id } });
    if (!before) fail("Record not found.", 404);
    if (["payruns", "payslips"].includes(name)) {
      const runId = name === "payruns" ? id : before.payrunId;
      await tx.$queryRaw`SELECT id FROM payroll."Payrun" WHERE id = ${runId} FOR UPDATE`;
      const run = await tx.payrun.findUnique({ where: { id: runId } });
      if (!["DRAFT", "CANCELLED"].includes(run.status) || !["DRAFT", "CANCELLED"].includes(before.status)) fail("Only draft or cancelled payroll can be deleted. Finalized payroll retains its history.", 409);
      const slips = name === "payruns" ? { payrunId: id } : { id };
      if (await tx.payrollPayment.count({ where: { payslip: slips } })) fail("Payroll with payment history cannot be deleted.", 409);
      if (await tx.payslip.count({ where: { ...slips, status: { notIn: ["DRAFT", "CANCELLED"] } } })) fail("Cancel computed payroll before deleting.", 409);
      await tx.payslipLine.deleteMany({ where: { payslip: slips } }); await tx.payslipInput.deleteMany({ where: { payslip: slips } }); await tx.payslipWorkedTime.deleteMany({ where: { payslip: slips } });
      if (name === "payruns") { await tx.payrollWarning.deleteMany({ where: { payrunId: id } }); await tx.payslip.deleteMany({ where: slips }); await tx.payrunEmployee.deleteMany({ where: { payrunId: id } }); }
      else { await tx.payrunEmployee.updateMany({ where: { payrunId: runId, employeeId: before.employeeId }, data: { status: "SELECTED", errorMessage: null } }); await tx.payrun.update({ where: { id: runId }, data: { version: { increment: 1 } } }); }
    }
    if (name === "structures") await tx.salaryStructureRule.deleteMany({ where: { salaryStructureId: id } });
    await tx[model].delete({ where: { id } });
    await audit(tx, req.user.id, "PAYROLL_RECORD_DELETED", model, id, { reason: req.body.reason });
    return { id };
  }, { isolationLevel: "Serializable" }));
}));
router.use("/workspace", workspaceRoutes);
export default router;
