import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import prisma from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import AppError from "../utils/AppError.js";

const digest = token => createHash("sha256").update(token).digest("hex");
export const resetNotice = "If an active account exists for this email, a password-reset link will be sent. Check your inbox and spam folder.";
function mailTransport() {
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM) throw new AppError("Password-reset email is not configured yet. Contact your workspace administrator.", 503);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true",
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 10000, socketTimeout: 15000,
  });
}
export async function requestPasswordReset(email, deliver) {
  // Check delivery configuration before looking up an account so errors do not reveal existence.
  const transport = deliver ? null : mailTransport();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.isActive) return { message: resetNotice };
  const token = randomBytes(32).toString("hex"), tokenHash = digest(token);
  const link = new URL("/reset-password", process.env.FRONTEND_URL || "http://localhost:3000");
  // Fragments stay out of access logs and referrer headers.
  link.hash = `token=${token}`;
  const reset = await prisma.passwordReset.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60000) } });
  try {
    const message = { from: process.env.MAIL_FROM, to: user.email, subject: "Reset your PeoplePay360 password", text: `A password reset was requested for your PeoplePay360 account.\n\nChoose a new password using this link:\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, you can ignore this email.` };
    if (deliver) await deliver(message); else await transport.sendMail(message);
  } catch {
    await prisma.passwordReset.deleteMany({ where: { id: reset.id } });
    // Same acknowledgement for unknown addresses and delivery failures; tokens never enter logs/responses.
    console.error("Password-reset email delivery failed. Check SMTP configuration.");
  } finally { transport?.close(); }
  return { message: resetNotice };
}
export async function resetPassword(token, password) {
  const tokenHash = digest(token), hashed = await hashPassword(password);
  return prisma.$transaction(async tx => {
    const initial = await tx.passwordReset.findUnique({ where: { tokenHash } });
    if (!initial) throw new AppError("This reset link is invalid or expired. Request a new link.", 400);
    await tx.$queryRaw`SELECT id FROM auth."User" WHERE id = ${initial.userId} FOR UPDATE`;
    const reset = await tx.passwordReset.findUnique({ where: { tokenHash }, include: { user: { select: { isActive: true } } } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date() || !reset.user.isActive) throw new AppError("This reset link is invalid or expired. Request a new link.", 400);
    await tx.user.update({ where: { id: reset.userId }, data: { password: hashed, sessionVersion: { increment: 1 } } });
    await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: reset.userId, action: "PASSWORD_RESET", entityType: "User", entityId: String(reset.userId) } });
    return { message: "Your password has been reset. Sign in with your new password." };
  });
}
