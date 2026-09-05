import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { employeeClock, employeeDashboard, ownEmployee, updateEmployeeContact } from "../services/employee.service.js";
import { createLeave, decideLeave } from "../services/time.service.js";
import { schemas } from "../validators/workspace.validator.js";
import { fail } from "../lib/workspace.js";

const router = Router();
router.use(authenticate, authorizeRoles("EMPLOYEE", "ADMIN"));
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.cookies?.[process.env.JWT_COOKIE_NAME || "access_token"] && req.get("Origin") !== (process.env.FRONTEND_URL || "http://localhost:3000")) return res.status(403).json({ success: false, message: "Use the workspace application for changes." });
  next();
});
const parse = (schema, value) => { const r = schema.safeParse(value); if (!r.success) fail(r.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")); return r.data; };
const route = fn => async (req, res, next) => { try { res.json({ success: true, data: await fn(req) }); } catch (e) { if (["P2034", "P2002"].includes(e.code)) { e.statusCode = 409; e.message = "Another update happened at the same time. Refresh and retry."; } next(e); } };
router.get("/dashboard", route(req => employeeDashboard(req.user.id, parse(z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/) }).strict(), req.query).month)));
router.post("/attendance/clock", route(req => employeeClock(req.user.id, parse(z.object({ action: z.enum(["check-in", "check-out"]), breakMinutes: z.number().int().min(0).max(1440).default(0) }).strict(), req.body))));
router.post("/leave", route(async req => {
  const employee = await ownEmployee(req.user.id);
  if (Object.hasOwn(req.body, "employeeId")) fail("Employee identity is assigned from your signed-in account.", 403);
  return createLeave(parse(schemas.leave, { ...req.body, employeeId: employee.id }), req.user.id);
}));
router.post("/leave/:id/cancel", route(async req => {
  const employee = await ownEmployee(req.user.id), id = parse(z.coerce.number().int().positive(), req.params.id);
  const request = await prisma.leaveRequest.findFirst({ where: { id, employeeId: employee.id } });
  if (!request) fail("Request not found.", 404);
  if (!["SUBMITTED", "FIRST_APPROVED"].includes(request.status)) fail("Only pending requests can be withdrawn here. Contact HR for changes to approved leave.", 409);
  return decideLeave("leave", id, "cancel", req.user.id, parse(z.object({ reason: z.string().trim().min(3).max(1000) }).strict(), req.body).reason, { pendingOnly: true });
}));
const contact = z.string().trim().max(200).nullable();
router.patch("/profile", route(req => updateEmployeeContact(req.user.id, parse(z.object({ personalEmail: z.email().nullable().optional(), personalPhone: contact.optional(), addressLine1: contact.optional(), city: contact.optional(), postalCode: contact.optional(), emergencyContactName: contact.optional(), emergencyContactPhone: contact.optional() }).strict(), req.body))));
export default router;
