import { z } from "zod";
export const forgotPasswordSchema = z.object({ email: z.string().trim().email().toLowerCase() }).strict();
export const resetPasswordSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12, "Use at least 12 characters").max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes") }).strict();

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must contain at least 2 characters")
    .max(80, "Name is too long"),

  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .transform((email) => email.toLowerCase()),

  password: z
    .string()
    .min(8, "Password must contain at least 8 characters")
    .max(72, "Password is too long"),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .transform((email) => email.toLowerCase()),

  password: z
    .string()
    .min(1, "Password is required"),

  keepSignedIn: z.boolean().optional(),
});
