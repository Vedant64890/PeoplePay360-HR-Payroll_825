import { Router } from "express";

import {
  login,
  adminLogin,
  logout,
  register,
} from "../controllers/auth.controller.js";

import {
  loginSchema,
  registerSchema,
} from "../validators/auth.validator.js";

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

router.post(
  "/register",
  validate(registerSchema),
  register
);

router.post(
  "/login",
  validate(loginSchema),
  login
);

router.post(
  "/logout",
  logout
);

export default router;
