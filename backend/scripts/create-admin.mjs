import "dotenv/config";
import { randomBytes } from "node:crypto";
import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { createAccountSchema } from "../src/validators/admin.validator.js";

// Run from backend: node --import tsx scripts/create-admin.mjs admin@example.com
// Credentials are printed once. Existing accounts are never promoted or reset.
const password = process.env.ADMIN_INITIAL_PASSWORD || randomBytes(18).toString("base64url");
try {
  const input = createAccountSchema.parse({ name: "Workspace Admin", email: process.argv[2], password, role: "ADMIN" });
  const user = await prisma.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email } })) throw new Error("That email already has an account. No password or role was changed.");
    await tx.role.upsert({ where: { code: "ADMIN" }, update: {}, create: { code: "ADMIN", name: "Administrator" } });
    const created = await tx.user.create({ data: { ...input, password: await hashPassword(password) }, select: { id: true, email: true } });
    await tx.auditLog.create({ data: { actorId: created.id, action: "ADMIN_WORKSPACE_CREATED", entityType: "User", entityId: String(created.id) } });
    return created;
  });
  console.log(JSON.stringify({ email: user.email, password }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
