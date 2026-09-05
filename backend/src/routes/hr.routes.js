import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { schemas, workspaceQuery } from "../validators/workspace.validator.js";
import { listResource, resourceId, saveResource, archiveResource } from "../services/workspace.service.js";
import { saveAttendance, createAllocation, createLeave, decideLeave } from "../services/time.service.js";
import { hrResources, hrData, hrLookups, hrDashboard, hrDetail, attendanceDays, rebuildAttendance, removeHrRecord } from "../services/hr.service.js";
import { fail } from "../lib/workspace.js";

const router = Router();
router.use(authenticate, authorizeRoles("HR_MANAGER", "ADMIN"));
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.cookies?.[process.env.JWT_COOKIE_NAME || "access_token"] && req.get("Origin") !== (process.env.FRONTEND_URL || "http://localhost:3000")) return res.status(403).json({ success: false, message: "This request must come from the workspace application." });
  next();
});
const route = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (e) {
    const messages = { P2002: [409, "A record with this reference already exists."], P2003: [409, "This record is still in use or a related record is missing."], P2025: [404, "Record not found."], P2034: [409, "Another update happened at the same time. Refresh and retry."] };
    if (messages[e.code]) [e.statusCode, e.message] = messages[e.code];
    next(e);
  }
};
const parse = (schema, value) => { const result = schema.safeParse(value); if (!result.success) fail(result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")); return result.data; };
const monthQuery = workspaceQuery.extend({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/) });
const actionSchema = z.object({ action: z.enum(["approve", "refuse", "cancel", "archive", "remove"]), reason: z.string().trim().max(1000).optional() }).strict();
const send = (res, data) => res.json({ success: true, data: hrData(data) });
router.get("/dashboard", route(async (req, res) => send(res, await hrDashboard(parse(monthQuery, req.query)))));
router.get("/workspace/lookups", route(async (_req, res) => send(res, await hrLookups())));
router.get("/workspace/attendance-days", route(async (req, res) => send(res, await attendanceDays(parse(monthQuery, req.query)))));
router.post("/workspace/attendance-days/recalculate", route(async (req, res) => send(res, await rebuildAttendance(parse(monthQuery, req.body), req.user.id))));
router.use("/workspace/:resource", (req, res, next) => hrResources.has(req.params.resource) ? next() : res.status(403).json({ success: false, message: "This section is not available to the HR Manager workspace." }));
router.get("/workspace/:resource", route(async (req, res) => {
  const query = parse(workspaceQuery, req.query);
  if (query.status) {
    const allowed = { employees: ["ACTIVE", "ONBOARDING", "ON_LEAVE", "SUSPENDED", "TERMINATED", "ARCHIVED"], contracts: ["DRAFT", "OPEN", "EXPIRED", "TERMINATED", "CANCELLED"], leave: ["DRAFT", "SUBMITTED", "FIRST_APPROVED", "APPROVED", "REFUSED", "CANCELLED"], allocations: ["DRAFT", "SUBMITTED", "FIRST_APPROVED", "APPROVED", "REFUSED", "CANCELLED"] };
    if (!allowed[req.params.resource]?.includes(query.status)) fail("Choose a valid status filter.");
  }
  send(res, await listResource(req.params.resource, query));
}));
router.get("/workspace/:resource/:id", route(async (req, res) => send(res, await hrDetail(req.params.resource, resourceId(req.params.resource, req.params.id)))));
async function save(req, res) {
  const name = req.params.resource, id = req.params.id ? resourceId(name, req.params.id) : undefined;
  const prohibited = name === "employees" ? ["userId"] : name === "contracts" ? ["salaryStructureId", "payFrequency"] : [];
  if (prohibited.some(key => Object.hasOwn(req.body, key))) fail("Account access and salary configuration are managed outside the HR workspace.", 403);
  const input = parse(schemas[name], req.body);
  const result = name === "attendance" ? await saveAttendance(input, req.user.id, id) : name === "leave" ? await createLeave(input, req.user.id, id) : name === "allocations" ? await createAllocation(input, req.user.id, id) : await saveResource(name, input, req.user.id, id, { hrOnly: true });
  res.status(id ? 200 : 201); send(res, result);
}
router.post("/workspace/:resource", route(save));
router.put("/workspace/:resource/:id", route(save));
router.delete("/workspace/:resource/:id", route(async (req, res) => send(res, await removeHrRecord(req.params.resource, resourceId(req.params.resource, req.params.id), req.user.id, req.body?.reason))));
router.post("/workspace/:resource/:id/actions", route(async (req, res) => {
  const name = req.params.resource, id = resourceId(name, req.params.id), { action, reason } = parse(actionSchema, req.body);
  const result = action === "remove" ? await removeHrRecord(name, id, req.user.id, reason) : ["leave", "allocations"].includes(name) ? await decideLeave(name, id, action, req.user.id, reason) : action === "archive" ? await archiveResource(name, id, req.user.id) : fail("This action is not available.", 405);
  send(res, result);
}));
export default router;
