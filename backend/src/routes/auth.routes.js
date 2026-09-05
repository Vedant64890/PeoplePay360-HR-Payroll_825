import { Router } from "express";

import {
  login,
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