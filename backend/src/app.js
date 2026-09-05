import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";

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