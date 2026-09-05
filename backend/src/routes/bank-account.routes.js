import { Router } from "express";
import { z } from "zod";
import { createCipheriv, randomBytes } from "node:crypto";
import prisma from "../lib/prisma.js";
import { audit, fail, json, lockEmployee } from "../lib/workspace.js";

const router = Router();
const safe = { id: true, accountHolderName: true, bankName: true, accountLastFour: true, swiftCode: true, currency: true, isPrimary: true, isActive: true };
const schema = z.object({ accountHolderName: z.string().trim().min(1).max(150), bankName: z.string().trim().min(1).max(150), accountNumber: z.string().trim().regex(/^[A-Za-z0-9-]{4,40}$/), routingCode: z.string().trim().max(40).optional(), swiftCode: z.string().trim().max(20).optional(), currency: z.string().regex(/^[A-Z]{3}$/), isPrimary: z.boolean().default(true) }).strict();
const parse = (s, value) => { const r = s.safeParse(value); if (!r.success) fail(r.error.issues.map(i => i.message).join("; ")); return r.data; };
const id = value => parse(z.coerce.number().int().positive(), value);
const route = fn => async (req, res, next) => { try { res.json({ success: true, data: json(await fn(req)) }); } catch (e) { if (e.code === "P2034") { e.statusCode = 409; e.message = "Another update occurred. Refresh and retry."; } next(e); } };
function encrypt(value) {
  const encoded = process.env.BANK_ENCRYPTION_KEY;
  if (!encoded || !/^[a-fA-F0-9]{64}$/.test(encoded)) fail("Bank account storage needs a 64-character hexadecimal BANK_ENCRYPTION_KEY on the backend.", 503);
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(encoded, "hex"), iv);
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${bytes.toString("base64")}`;
}
router.get("/employees/:employeeId/bank-accounts", route(req => prisma.employeeBankAccount.findMany({ where: { employeeId: id(req.params.employeeId) }, select: safe, orderBy: [{ isActive: "desc" }, { isPrimary: "desc" }] })));
router.post("/employees/:employeeId/bank-accounts", route(async req => {
  const employeeId = id(req.params.employeeId), input = parse(schema, req.body);
  const encrypted = encrypt(input.accountNumber), routing = input.routingCode ? encrypt(input.routingCode) : null;
  return prisma.$transaction(async tx => {
    await lockEmployee(tx, employeeId);
    if (input.isPrimary) await tx.employeeBankAccount.updateMany({ where: { employeeId, currency: input.currency, isPrimary: true }, data: { isPrimary: false } });
    const item = await tx.employeeBankAccount.create({ data: { employeeId, accountHolderName: input.accountHolderName, bankName: input.bankName, accountNumberEncrypted: encrypted, accountLastFour: input.accountNumber.slice(-4), routingCodeEncrypted: routing, swiftCode: input.swiftCode, currency: input.currency, isPrimary: input.isPrimary }, select: safe });
    await audit(tx, req.user.id, "BANK_ACCOUNT_ADDED", "Employee", employeeId, { bankAccountId: item.id });
    return item;
  });
}));
router.delete("/employees/:employeeId/bank-accounts/:bankId", route(async req => {
  const employeeId = id(req.params.employeeId), bankId = id(req.params.bankId);
  return prisma.$transaction(async tx => {
    await lockEmployee(tx, employeeId);
    const changed = await tx.employeeBankAccount.updateMany({ where: { id: bankId, employeeId }, data: { isActive: false, isPrimary: false } });
    if (!changed.count) fail("Bank account not found.", 404);
    await audit(tx, req.user.id, "BANK_ACCOUNT_ARCHIVED", "Employee", employeeId, { bankAccountId: bankId });
    return { id: bankId };
  });
}));
export default router;
