import { Router } from "express";
import workspaceRoutes from "./workspace.routes.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createAccountSchema, updateAccountSchema, createEmployeeSchema, listQuerySchema, dashboardQuerySchema } from "../validators/admin.validator.js";
import { getDashboard, listAccounts, listEmployees, createAccount, updateAccount, deleteAccount, createEmployee } from "../services/admin.service.js";

const router = Router();
router.use(authenticate, authorizeRoles("ADMIN"));
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const cookieName = process.env.JWT_COOKIE_NAME || "access_token";
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.cookies?.[cookieName] && req.get("Origin") !== (process.env.FRONTEND_URL || "http://localhost:3000")) {
    return res.status(403).json({ success: false, message: "This request must come from the admin application." });
  }
  next();
});
const route = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
router.use("/workspace", workspaceRoutes);
function query(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error("Invalid filter or page. Please check your selection.");
    error.statusCode = 400;
    throw error;
  }
  return result.data;
}

router.get("/dashboard", route(async (req, res) => res.json({ success: true, data: await getDashboard(query(dashboardQuerySchema, req.query)) })));
router.get("/users", route(async (req, res) => res.json({ success: true, data: await listAccounts(query(listQuerySchema, req.query)) })));
router.delete("/users/:id", route(async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.status(400).json({ success: false, message: "Invalid account ID." });
  res.json({ success: true, data: await deleteAccount(Number(req.params.id), req.user.id) });
}));
router.post("/users", validate(createAccountSchema), route(async (req, res) => res.status(201).json({ success: true, user: await createAccount(req.validatedBody, req.user.id) })));
router.patch("/users/:id", validate(updateAccountSchema), route(async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.status(400).json({ success: false, message: "Invalid account ID." });
  res.json({ success: true, user: await updateAccount(Number(req.params.id), req.validatedBody, req.user.id) });
}));
router.get("/employees", route(async (req, res) => res.json({ success: true, data: await listEmployees(query(listQuerySchema, req.query)) })));
router.post("/employees", validate(createEmployeeSchema), route(async (req, res) => res.status(201).json({ success: true, employee: await createEmployee(req.validatedBody, req.user.id) })));

export default router;
