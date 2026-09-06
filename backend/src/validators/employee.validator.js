import { z } from "zod";
import { resetPasswordSchema } from "./auth.validator.js";

const text = z.string().trim().max(200).nullable().optional();
export const employeeSections = [
  "overview",
  "profile",
  "attendance",
  "schedule",
  "leave",
  "balances",
  "contacts",
  "contracts",
  "payroll",
  "payslips",
  "documents",
  "notifications",
  "settings",
];
export const employeeIdParam = z.coerce
  .number()
  .int()
  .positive()
  .max(2147483647);
export const monthQuery = z
  .object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/) })
  .strict();
export const contactSchema = z
  .object({
    personalEmail: z.email().max(254).nullable().optional(),
    personalPhone: text,
    addressLine1: text,
    addressLine2: text,
    city: text,
    state: text,
    postalCode: text,
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    emergencyContactName: text,
    emergencyContactPhone: text,
  })
  .strict();
export const directoryQuery = z
  .object({
    q: z.string().trim().max(100).default(""),
    departmentId: employeeIdParam.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const payrollQuery = z
  .object({ year: z.coerce.number().int().min(2000).max(2099).optional() })
  .strict();
export const documentQuery = z
  .object({
    title: z.string().trim().min(1).max(150),
    category: z.enum(["IDENTITY", "EDUCATION", "EMPLOYMENT", "TAX", "OTHER"]),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine(
        (v) => !/[\x00-\x1f/\\]/.test(v),
        "Use a file name without path separators or control characters.",
      ),
  })
  .strict();
export const preferencesSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
    timeFormat: z.enum(["12h", "24h"]),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    defaultSection: z.enum(employeeSections),
    attendanceReminders: z.boolean(),
    leaveUpdates: z.boolean(),
    payrollUpdates: z.boolean(),
    documentUpdates: z.boolean(),
  })
  .strict();
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: resetPasswordSchema.shape.password,
  })
  .strict()
  .refine(
    (v) => v.currentPassword !== v.newPassword,
    "Choose a different new password.",
  );
export const notificationReadSchema = z
  .object({ keys: z.array(z.string().min(1).max(180)).min(1).max(400) })
  .strict();
