import { Router } from "express";

import {
  adminOnly,
  getCurrentUser,
  managerOrAdmin,
} from "../controllers/user.controller.js";

import {
  authenticate,
} from "../middleware/auth.middleware.js";

import {
  authorizeRoles,
} from "../middleware/role.middleware.js";

const router = Router();


// Any logged-in user
router.get(
  "/me",
  authenticate,
  getCurrentUser
);


// ADMIN only
router.get(
  "/admin-only",
  authenticate,
  authorizeRoles("ADMIN"),
  adminOnly
);


// ADMIN or MANAGER
router.get(
  "/management",
  authenticate,
  authorizeRoles(
    "ADMIN",
    "MANAGER"
  ),
  managerOrAdmin
);

export default router;