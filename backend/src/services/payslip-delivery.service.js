import nodemailer from "nodemailer";
import prisma from "../lib/prisma.js";
import { audit, fail, json } from "../lib/workspace.js";
import { ensurePayslipDocument, storedDocument } from "./payslip-document.service.js";

export function deliveryConfigured() { return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM); }
function transport() {
  if (!deliveryConfigured()) fail("Payslip email is not configured. Set SMTP_HOST and MAIL_FROM on the backend.", 503);
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {}), connectionTimeout: 10000, socketTimeout: 15000 });
}

export async function queuePayslips(runId, input, actorId, { configured = deliveryConfigured() } = {}) {
  if (!configured) fail("Payslip email is not configured. Set SMTP_HOST and MAIL_FROM on the backend.", 503);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM payroll."Payrun" WHERE id = ${runId} FOR UPDATE`;
    const prior = await tx.payslipDeliveryBatch.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (prior) { if (prior.payrunId !== runId) fail("This submission key belongs to another payrun.", 409); return json(prior); }
    const run = await tx.payrun.findUnique({ where: { id: runId }, include: { payslips: { include: { employee: { select: { workEmail: true } }, lines: { orderBy: { sequence: "asc" } } } } } });
    if (!run) fail("Payrun not found.", 404);
    if (run.version !== input.version) fail("This payrun changed. Reload it before sending.", 409);
    if (!["VALIDATED", "PARTIALLY_PAID", "PAID"].includes(run.status) || !run.payslips.length) fail("Validate the payrun before sending payslips.", 409);
    if (await tx.payslipDelivery.count({ where: { batch: { payrunId: runId }, status: { in: ["QUEUED", "SENDING"] } } })) fail("A delivery batch for this payrun is already in progress.", 409);
    const batch = await tx.payslipDeliveryBatch.create({ data: { payrunId: runId, requestedById: actorId, idempotencyKey: input.idempotencyKey } });
    for (const slip of run.payslips) {
      const email = slip.employee.workEmail;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("A payslip is missing the employee work email. Update the employee profile before sending.", 409);
      const { document } = await ensurePayslipDocument(tx, slip, actorId);
      await tx.payslipDelivery.create({ data: { batchId: batch.id, payslipId: slip.id, documentId: document.id, recipientEmail: email, subject: `Your payslip - ${run.name}`, idempotencyKey: `${input.idempotencyKey}:${slip.id}` } });
    }
    await audit(tx, actorId, "PAYSLIPS_QUEUED", "Payrun", runId, { batchId: batch.id, count: run.payslips.length });
    return json(batch);
  }, { timeout: 120000 });
}

export async function deliveryHistory(runId) {
  return json({ configured: deliveryConfigured(), recipients: await prisma.payslip.findMany({ where: { payrunId: runId }, select: { id: true, employee: { select: { firstName: true, lastName: true, workEmail: true } } } }), batches: await prisma.payslipDeliveryBatch.findMany({ where: { payrunId: runId }, orderBy: { requestedAt: "desc" }, take: 20, include: { deliveries: { select: { id: true, payslipId: true, recipientEmail: true, status: true, attemptCount: true, lastError: true, sentAt: true } } } }) });
}

export async function retryDelivery(runId, deliveryId, actorId) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM payroll."Payrun" WHERE id = ${runId} FOR UPDATE`;
    const job = await tx.payslipDelivery.findFirst({ where: { id: deliveryId, batch: { payrunId: runId } } });
    if (!job || job.status !== "FAILED") fail("Only failed deliveries can be retried.", 409);
    await tx.payslipDelivery.update({ where: { id: deliveryId }, data: { status: "QUEUED", lastError: null, lockedUntil: null } });
    await tx.payslipDeliveryBatch.update({ where: { id: job.batchId }, data: { status: "QUEUED", completedAt: null } });
    await audit(tx, actorId, "PAYSLIP_DELIVERY_RETRIED", "PayslipDelivery", deliveryId);
    return { id: deliveryId };
  });
}

export async function processDeliveryQueue(deliver, { batchId } = {}) {
  if (!deliver && !deliveryConfigured()) return;
  // An expired SMTP attempt may have reached the provider. Require explicit retry to avoid duplicate mail.
  const scope = batchId ? { batchId } : {};
  await prisma.payslipDelivery.updateMany({ where: { ...scope, status: "SENDING", lockedUntil: { lt: new Date() } }, data: { status: "FAILED", lockedUntil: null, lastError: "Delivery was interrupted. Check the recipient before retrying; the email may already have arrived." } });
  const candidates = await prisma.payslipDelivery.findMany({ where: { ...scope, status: "QUEUED" }, orderBy: { id: "asc" }, take: 10, select: { id: true } });
  const mailer = deliver ? null : transport();
  try {
    for (const candidate of candidates) {
      const job = await prisma.$transaction(async tx => {
        const claim = await tx.payslipDelivery.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "SENDING", lockedUntil: new Date(Date.now() + 120000), attemptCount: { increment: 1 } } });
        if (!claim.count) return null;
        const item = await tx.payslipDelivery.findUnique({ where: { id: candidate.id }, include: { document: true } });
        await tx.payslipDeliveryAttempt.create({ data: { deliveryId: item.id, attemptNumber: item.attemptCount } });
        await tx.payslipDeliveryBatch.update({ where: { id: item.batchId }, data: { status: "PROCESSING" } });
        return item;
      });
      if (!job) continue;
      let status = "SENT", providerMessageId = null, lastError = null;
      try {
        const bytes = await storedDocument(job.document);
        const message = { from: process.env.MAIL_FROM, to: job.recipientEmail, subject: job.subject, text: "Your salary statement is attached. Please contact your HR or payroll team with questions about this payslip.", attachments: [{ filename: job.document.fileName, content: bytes, contentType: "application/pdf" }] };
        const result = deliver ? await deliver(message) : await mailer.sendMail(message);
        if (result?.rejected?.length) throw new Error("Recipient rejected");
        providerMessageId = result?.messageId || null;
      } catch { status = "FAILED"; lastError = "The email could not be confirmed. Check SMTP settings and the recipient before retrying."; }
      await prisma.$transaction(async tx => {
        await tx.payslipDelivery.update({ where: { id: job.id }, data: { status, providerMessageId, lastError, sentAt: status === "SENT" ? new Date() : null, lockedUntil: null } });
        await tx.payslipDeliveryAttempt.update({ where: { deliveryId_attemptNumber: { deliveryId: job.id, attemptNumber: job.attemptCount } }, data: { status, providerMessageId, errorMessage: lastError, completedAt: new Date() } });
      });
    }
    const batches = await prisma.payslipDeliveryBatch.findMany({ where: { ...(batchId ? { id: batchId } : {}), status: { in: ["QUEUED", "PROCESSING"] } }, include: { deliveries: { select: { status: true } } } });
    for (const batch of batches) {
      if (batch.deliveries.some(d => ["QUEUED", "SENDING"].includes(d.status))) continue;
      const sent = batch.deliveries.filter(d => ["SENT", "DELIVERED"].includes(d.status)).length;
      await prisma.payslipDeliveryBatch.update({ where: { id: batch.id }, data: { status: sent === batch.deliveries.length ? "COMPLETED" : sent ? "PARTIALLY_FAILED" : "FAILED", completedAt: new Date() } });
    }
  } finally { mailer?.close(); }
}

export function startDeliveryWorker() {
  let active = false;
  const timer = setInterval(async () => {
    if (active) return;
    active = true;
    try { await processDeliveryQueue(); } catch { console.error("Payslip delivery worker failed. Pending jobs remain available for retry."); } finally { active = false; }
  }, 5000);
  timer.unref();
  return () => clearInterval(timer);
}
