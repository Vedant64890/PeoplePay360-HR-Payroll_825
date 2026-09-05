import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import payrollWorkspaceRoutes from "./routes/payroll-workspace.routes.js";
import hrRoutes from "./routes/hr.routes.js";
import employeeRoutes from "./routes/employee.routes.js";

import {
  errorHandler,
} from "./middleware/error.middleware.js";

const app = express();


// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================

app.use(
  cors({
    origin:
      process.env.FRONTEND_URL ||
      "http://localhost:3000",

    credentials: true,
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(cookieParser());

// Tab-specific cookies are still cookie authentication: protect mutations
// centrally, including login/logout, rather than relying on the legacy name.
app.use((req, res, next) => {
  if (req.get("X-Workspace-Session") !== undefined && !["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("Origin") !== (process.env.FRONTEND_URL || "http://localhost:3000")) {
    return res.status(403).json({ success: false, message: "This request must come from the workspace application." });
  }
  next();
});


// ==========================================
// HEALTH ROUTE
// ==========================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message:
      "Odoo Hackathon Backend is running",
  });
});


// ==========================================
// API ROUTES
// ==========================================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/users",
  userRoutes
);


// ==========================================
// 404
// ==========================================

app.use("/api/admin", adminRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/payroll", payrollWorkspaceRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});


// ==========================================
// ERROR HANDLER
// ==========================================

app.use(errorHandler);

export default app;
