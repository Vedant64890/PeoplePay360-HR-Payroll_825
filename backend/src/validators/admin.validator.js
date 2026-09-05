import { z } from "zod";

export const managedRoles = ["EMPLOYEE", "HR_MANAGER", "HR_PAYROLL_USER", "HR_PAYROLL_MANAGER", "ADMIN", "USER", "MANAGER"];
const email = z.string().trim().email().toLowerCase();
export const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password: z.string().min(12, "Use at least 12 characters for the initial password").max(72),
  role: z.enum(managedRoles).default("EMPLOYEE"),
}).strict();

export const updateAccountSchema = z.object({
  role: z.enum(managedRoles).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Choose a change to save");

export const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(2).max(40),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  workEmail: email.optional(),
  employeeType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "TEMPORARY"]).default("FULL_TIME"),
  hireDate: z.iso.date(),
  departmentId: z.number().int().positive().optional(),
}).strict();

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export const dashboardQuerySchema = z.object({
  month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
});
