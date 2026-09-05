import { Router } from "express";

import {
  login,
  adminLogin,
  hrLogin,
  logout,
  register,
} from "../controllers/auth.controller.js";

import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.validator.js";
import { requestPasswordReset, resetPassword } from "../services/password-reset.service.js";

import {
  validate,
} from "../middleware/validate.middleware.js";

const router = Router();

// Small per-process attempt limit; production replicas should share a rate-limit store.
const adminAttempts = new Map();
function limitAdminLogin(req, res, next) {
  const now = Date.now();
  for (const [key, value] of adminAttempts) if (value.until <= now) adminAttempts.delete(key);
  const key = req.ip;
  const entry = adminAttempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 15) {
    res.setHeader("Retry-After", Math.ceil((entry.until - now) / 1000));
    return res.status(429).json({ success: false, message: "Too many sign-in attempts. Please try again in 15 minutes." });
  }
  if (adminAttempts.size >= 10000 && !adminAttempts.has(key)) adminAttempts.delete(adminAttempts.keys().next().value);
  entry.count += 1;
  adminAttempts.set(key, entry);
  next();
}

router.post("/admin/login", limitAdminLogin, validate(loginSchema), adminLogin);
router.post("/hr/login", limitAdminLogin, validate(loginSchema), hrLogin);
const resetAttempts = new Map();
function limitReset(req, res, next) {
  const now = Date.now();
  for (const [key, entry] of resetAttempts) if (entry.until <= now) resetAttempts.delete(key);
  const key = req.ip;
  const entry = resetAttempts.get(key) || { count: 0, until: now + 15 * 60000 };
  if (entry.count >= 10) { res.setHeader("Retry-After", Math.ceil((entry.until - now) / 1000)); return res.status(429).json({ success: false, message: "Too many password-reset attempts. Please try again in 15 minutes." }); }
  if (resetAttempts.size >= 10000 && !resetAttempts.has(key)) resetAttempts.delete(resetAttempts.keys().next().value);
  entry.count++; resetAttempts.set(key, entry); next();
}
router.post("/forgot-password", limitReset, validate(forgotPasswordSchema), async (req, res, next) => {
  try { res.setHeader("Cache-Control", "no-store"); res.json({ success: true, ...await requestPasswordReset(req.validatedBody.email) }); } catch (e) { next(e); }
});
router.post("/reset-password", limitReset, validate(resetPasswordSchema), async (req, res, next) => {
  try { res.setHeader("Cache-Control", "no-store"); res.json({ success: true, ...await resetPassword(req.validatedBody.token, req.validatedBody.password) }); } catch (e) { next(e); }
});

router.post(
  "/register",
  validate(registerSchema),
  register
);

router.post(
  "/login",
  limitAdminLogin,
  validate(loginSchema),
  login
);

router.post(
  "/logout",
  logout
);

export default router;
