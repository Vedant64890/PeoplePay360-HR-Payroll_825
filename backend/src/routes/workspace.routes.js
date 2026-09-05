import { Router } from "express";
import { schemas, workspaceQuery, actionSchema, inputSchema, reportQuery, settingsSchema } from "../validators/workspace.validator.js";
import { getSettings, saveSettings } from "../services/settings.service.js";
import { resource, resourceId, listResource, detailResource, saveResource, archiveResource, lookups, reports, reportCsv } from "../services/workspace.service.js";
import { saveAttendance, createAllocation, createLeave, decideLeave } from "../services/time.service.js";
import { createPayrun, payrunAction, savePayslipInputs } from "../services/payroll.service.js";
import { fail } from "../lib/workspace.js";

const router = Router();
const route = fn => async (req, res, next) => {
  try { await fn(req, res); }
  catch (error) {
    if (error.code === "P2002") { error.statusCode = 409; error.message = "A record with this code, reference or relationship already exists."; }
    if (error.code === "P2003") { error.statusCode = 400; error.message = "A selected related record does not exist or is still in use."; }
    if (error.code === "P2025") { error.statusCode = 404; error.message = "The requested record no longer exists."; }
    if (error.code === "P2034") { error.statusCode = 409; error.message = "Another update happened at the same time. Refresh and try again."; }
    next(error);
  }
};
function parse(schema, body) {
  if (!schema) fail("This section does not support this operation.", 405);
  const result = schema.safeParse(body);
  if (!result.success) fail(result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}
router.get("/lookups", route(async (req, res) => res.json({ success: true, data: await lookups() })));
router.get("/settings", route(async (req, res) => res.json({ success: true, data: await getSettings() })));
router.put("/settings", route(async (req, res) => res.json({ success: true, data: await saveSettings(parse(settingsSchema, req.body), req.user.id) })));
router.get("/reports", route(async (req, res) => res.json({ success: true, data: await reports(parse(reportQuery, req.query)) })));
router.get("/reports/export", route(async (req, res) => {
  const report = await reports(parse(reportQuery, req.query));
  res.type("text/csv").attachment(`peoplepay360-report-${report.month}-${report.currency}.csv`).send(reportCsv(report));
}));
router.get("/:resource", route(async (req, res) => res.json({ success: true, data: await listResource(req.params.resource, parse(workspaceQuery, req.query)) })));
router.get("/:resource/:id", route(async (req, res) => res.json({ success: true, data: await detailResource(req.params.resource, resourceId(req.params.resource, req.params.id)) })));
router.post("/:resource", route(async (req, res) => {
  const name = req.params.resource; resource(name);
  const data = parse(schemas[name], req.body);
  const result = name === "attendance" ? await saveAttendance(data, req.user.id) : name === "allocations" ? await createAllocation(data, req.user.id) : name === "leave" ? await createLeave(data, req.user.id) : name === "payruns" ? await createPayrun(data, req.user.id) : await saveResource(name, data, req.user.id);
  res.status(201).json({ success: true, data: result });
}));
router.put("/:resource/:id", route(async (req, res) => {
  const name = req.params.resource, id = resourceId(name, req.params.id), data = parse(schemas[name], req.body);
  const result = name === "attendance" ? await saveAttendance(data, req.user.id, id) : await saveResource(name, data, req.user.id, id);
  res.json({ success: true, data: result });
}));
router.post("/:resource/:id/actions", route(async (req, res) => {
  const name = req.params.resource, id = resourceId(name, req.params.id), data = parse(actionSchema, req.body);
  const result = name === "payruns" ? await payrunAction(id, data, req.user.id) : ["leave", "allocations"].includes(name) ? await decideLeave(name, id, data.action, req.user.id, data.reason) : data.action === "archive" ? await archiveResource(name, id, req.user.id) : fail("This action is not available.", 405);
  res.json({ success: true, data: result });
}));
router.put("/payslips/:id/inputs", route(async (req, res) => res.json({ success: true, data: await savePayslipInputs(resourceId("payslips", req.params.id), parse(inputSchema, req.body).inputs, req.user.id) })));
export default router;
