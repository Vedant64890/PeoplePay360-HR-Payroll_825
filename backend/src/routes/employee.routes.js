import { Router, raw } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import {
  employeeClock,
  employeeDashboard,
  ownEmployee,
  updateEmployeeContact,
} from "../services/employee.service.js";
import { createLeave, decideLeave } from "../services/time.service.js";
import { schemas } from "../validators/workspace.validator.js";
import { fail } from "../lib/workspace.js";
import {
  contactSchema,
  directoryQuery,
  documentQuery,
  employeeIdParam,
  monthQuery,
  notificationReadSchema,
  passwordChangeSchema,
  payrollQuery,
  preferencesSchema,
} from "../validators/employee.validator.js";
import {
  changeEmployeePassword,
  deleteEmployeeDocument,
  downloadEmployeeDocument,
  employeeContacts,
  employeeDocuments,
  employeePreferences,
  employeeSchedule,
  saveEmployeePreferences,
  uploadEmployeeDocument,
} from "../services/employee-workspace.service.js";
import {
  employeeContracts,
  employeePayroll,
  employeePayslip,
  employeePayslipPdf,
} from "../services/employee-payroll.service.js";
import {
  employeeNotifications,
  markEmployeeNotifications,
} from "../services/employee-notifications.service.js";

const router = Router();
router.use(authenticate, authorizeRoles("EMPLOYEE", "ADMIN"));
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.cookies?.[process.env.JWT_COOKIE_NAME || "access_token"] &&
    req.get("Origin") !== (process.env.FRONTEND_URL || "http://localhost:3000")
  )
    return res
      .status(403)
      .json({
        success: false,
        message: "Use the workspace application for changes.",
      });
  next();
});
const parse = (schema, value) => {
  const r = schema.safeParse(value);
  if (!r.success)
    fail(
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  return r.data;
};
const route = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e) {
    if (["P2034", "P2002"].includes(e.code)) {
      e.statusCode = 409;
      e.message =
        "Another update happened at the same time. Refresh and retry.";
    }
    next(e);
  }
};
router.get(
  "/dashboard",
  route((req) =>
    employeeDashboard(
      req.user.id,
      parse(
        z
          .object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/) })
          .strict(),
        req.query,
      ).month,
    ),
  ),
);
router.post(
  "/attendance/clock",
  route((req) =>
    employeeClock(
      req.user.id,
      parse(
        z
          .object({
            action: z.enum(["check-in", "check-out"]),
            breakMinutes: z.number().int().min(0).max(1440).default(0),
          })
          .strict(),
        req.body,
      ),
    ),
  ),
);
router.post(
  "/leave",
  route(async (req) => {
    const employee = await ownEmployee(req.user.id);
    if (Object.hasOwn(req.body, "employeeId"))
      fail("Employee identity is assigned from your signed-in account.", 403);
    return createLeave(
      parse(schemas.leave, { ...req.body, employeeId: employee.id }),
      req.user.id,
    );
  }),
);
router.post(
  "/leave/:id/cancel",
  route(async (req) => {
    const employee = await ownEmployee(req.user.id),
      id = parse(z.coerce.number().int().positive(), req.params.id);
    const request = await prisma.leaveRequest.findFirst({
      where: { id, employeeId: employee.id },
    });
    if (!request) fail("Request not found.", 404);
    if (!["SUBMITTED", "FIRST_APPROVED"].includes(request.status))
      fail(
        "Only pending requests can be withdrawn here. Contact HR for changes to approved leave.",
        409,
      );
    return decideLeave(
      "leave",
      id,
      "cancel",
      req.user.id,
      parse(
        z.object({ reason: z.string().trim().min(3).max(1000) }).strict(),
        req.body,
      ).reason,
      { pendingOnly: true },
    );
  }),
);
router.patch(
  "/profile",
  route((req) =>
    updateEmployeeContact(req.user.id, parse(contactSchema, req.body)),
  ),
);
router.get(
  "/schedule",
  route((req) =>
    employeeSchedule(req.user.id, parse(monthQuery, req.query).month),
  ),
);
router.get(
  "/contacts",
  route((req) =>
    employeeContacts(req.user.id, parse(directoryQuery, req.query)),
  ),
);
router.get(
  "/contracts",
  route((req) => employeeContracts(req.user.id)),
);
router.get(
  "/payroll",
  route((req) =>
    employeePayroll(req.user.id, parse(payrollQuery, req.query).year),
  ),
);
router.get(
  "/payslips/:id",
  route((req) =>
    employeePayslip(req.user.id, parse(employeeIdParam, req.params.id)),
  ),
);
router.get("/payslips/:id/pdf", async (req, res, next) => {
  try {
    const { document, bytes } = await employeePayslipPdf(
      req.user.id,
      parse(employeeIdParam, req.params.id),
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.attachment(document.fileName).type("application/pdf").send(bytes);
  } catch (error) {
    next(error);
  }
});
router.get(
  "/documents",
  route((req) => employeeDocuments(req.user.id)),
);
router.post(
  "/documents",
  raw({ type: ["application/pdf", "image/png", "image/jpeg"], limit: "5mb" }),
  route((req) =>
    uploadEmployeeDocument(
      req.user.id,
      parse(documentQuery, req.query),
      req.get("Content-Type")?.split(";")[0],
      req.body,
    ),
  ),
);
router.get("/documents/:id/download", async (req, res, next) => {
  try {
    const document = await downloadEmployeeDocument(
      req.user.id,
      parse(employeeIdParam, req.params.id),
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res
      .attachment(document.fileName)
      .type(document.mimeType)
      .send(Buffer.from(document.content));
  } catch (error) {
    next(error);
  }
});
router.delete(
  "/documents/:id",
  route((req) =>
    deleteEmployeeDocument(req.user.id, parse(employeeIdParam, req.params.id)),
  ),
);
router.get(
  "/notifications",
  route((req) => employeeNotifications(req.user.id)),
);
router.post(
  "/notifications/read",
  route((req) =>
    markEmployeeNotifications(
      req.user.id,
      parse(notificationReadSchema, req.body).keys,
    ),
  ),
);
router.get(
  "/settings",
  route((req) => employeePreferences(req.user.id)),
);
router.put(
  "/settings",
  route((req) =>
    saveEmployeePreferences(req.user.id, parse(preferencesSchema, req.body)),
  ),
);
router.post(
  "/settings/password",
  route((req) =>
    changeEmployeePassword(req.user.id, parse(passwordChangeSchema, req.body)),
  ),
);
export default router;
