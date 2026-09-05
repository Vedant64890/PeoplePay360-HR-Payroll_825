import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import prisma from "../lib/prisma.js";
import { D, dayKey, fail } from "../lib/workspace.js";

const storage = path.resolve(process.env.PAYSLIP_STORAGE_DIR || fileURLToPath(new URL("../../.data/payslips/", import.meta.url)));
const templateVersion = "peoplepay360-v1";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function renderPayslip(slip) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: true, info: { Title: `Payslip ${slip.number}`, Author: "PeoplePay360" } });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    const font = [process.env.PDF_FONT_PATH, "C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find(p => p && existsSync(p));
    if (font) doc.font(font);
    const width = doc.page.width - 88, right = doc.page.width - 44;
    const money = value => `${slip.currency} ${D(value).toFixed(2)}`;
    const line = (label, value, highlight = false) => {
      doc.fontSize(highlight ? 13 : 10);
      const height = Math.max(24, doc.heightOfString(String(label), { width: width * .62 }) + 10, doc.heightOfString(String(value), { width: width * .35 - 8 }) + 10);
      if (doc.y + height > 748) doc.addPage();
      const y = doc.y;
      if (highlight) doc.rect(44, y - 5, width, height + 3).fill("#e6efe9");
      doc.fillColor("#243d30").text(String(label), 52, y, { width: width * .62 });
      doc.text(String(value), 44 + width * .65, y, { width: width * .35 - 8, align: "right" });
      doc.y = y + height;
    };
    doc.fontSize(23).fillColor("#294b38").text("PeoplePay360");
    doc.fontSize(11).fillColor("#63746a").text(slip.employeeSnapshot?.organizationName || "HR & Payroll");
    doc.moveDown(); doc.fontSize(19).fillColor("#243d30").text("Salary statement");
    doc.fontSize(9).text(slip.number, { width }); doc.moveDown();
    const person = slip.employeeSnapshot;
    line("Employee", `${person.firstName} ${person.lastName}`);
    line("Employee code", person.employeeCode);
    line("Payroll period", `${dayKey(slip.periodStart)} to ${dayKey(slip.periodEnd)}`);
    line("Salary structure", slip.structureSnapshot?.name || "Salary structure");
    line("Status", slip.status.replaceAll("_", " "));
    line("Scheduled / worked days", `${Number(slip.scheduledDays)} / ${D(slip.workedDays).toFixed(2)}`);
    line("Worked hours", D(slip.workedHours).toFixed(2));
    doc.moveDown(.7); line("SALARY COMPONENT", `AMOUNT (${slip.currency})`, true);
    for (const item of slip.lines.filter(l => l.appearsOnPayslip)) line(`${item.name} (${item.code})${item.effect === "DEDUCTION" ? " - deduction" : item.effect === "EMPLOYER_COST" ? " - employer contribution" : ""}`, D(item.total).toFixed(2));
    doc.moveDown(.6);
    for (const [label, key] of [["Basic salary", "basicAmount"], ["Allowances", "allowanceAmount"], ["Gross salary", "grossAmount"], ["Deductions", "deductionAmount"]]) line(label, money(slip[key]));
    line("Net salary", money(slip.netAmount), true);
    line("Employer contributions", money(slip.employerContributionAmount));
    if (doc.y > 695) doc.addPage();
    doc.moveDown(); doc.fontSize(8).fillColor("#63746a").text("Generated from the stored payroll calculation. Employer contributions are shown separately from net salary. Payment status reflects payments recorded in PeoplePay360.", 44, doc.y, { width });
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.fontSize(8).fillColor("#63746a").text(`Confidential | ${person.employeeCode} | Page ${i + 1} of ${pages.count}`, 44, 782, { width: right - 44, align: "center", lineBreak: false }); }
    doc.end();
  });
}

// The caller holds the payrun lock; artifacts are versioned and never served as public static files.
export async function ensurePayslipDocument(tx, slip, actorId) {
  if (!["COMPUTED", "VALIDATED", "PARTIALLY_PAID", "PAID"].includes(slip.status) || !slip.employeeSnapshot || !slip.structureSnapshot) fail("Compute this payslip successfully before generating its PDF.", 409);
  // Payment status is part of the rendered statement and therefore part of the template key.
  const version = `${templateVersion}-${slip.status}`;
  const key = { payslipId: slip.id, computationVersion: slip.computationVersion, templateVersion: version };
  const existing = await tx.payslipDocument.findUnique({ where: { payslipId_computationVersion_templateVersion: key } });
  if (existing?.status === "READY" && existing.storageKey) {
    try { const bytes = await readFile(path.join(storage, path.basename(existing.storageKey))); if (digest(bytes) === existing.checksumSha256) return { document: existing, bytes }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  const bytes = await renderPayslip(slip), fileName = `payslip-${slip.id}-${slip.computationVersion}-${slip.status.toLowerCase()}.pdf`;
  await mkdir(storage, { recursive: true });
  await writeFile(path.join(storage, fileName), bytes);
  const data = { status: "READY", storageKey: fileName, fileName, checksumSha256: digest(bytes), byteSize: bytes.length, generatedAt: new Date(), errorMessage: null };
  const document = await tx.payslipDocument.upsert({ where: { payslipId_computationVersion_templateVersion: key }, create: { ...key, ...data, requestedById: actorId }, update: data });
  return { document, bytes };
}

export async function payslipPdf(id, actorId) {
  return prisma.$transaction(async tx => {
    const first = await tx.payslip.findUnique({ where: { id }, select: { payrunId: true } });
    if (!first) fail("Payslip not found.", 404);
    await tx.$queryRaw`SELECT id FROM payroll."Payrun" WHERE id = ${first.payrunId} FOR UPDATE`;
    const slip = await tx.payslip.findUnique({ where: { id }, include: { lines: { orderBy: { sequence: "asc" } } } });
    return ensurePayslipDocument(tx, slip, actorId);
  }, { timeout: 30000 });
}

export async function storedDocument(document) {
  const bytes = await readFile(path.join(storage, path.basename(document.storageKey)));
  if (digest(bytes) !== document.checksumSha256) fail("Stored payslip verification failed. Generate the PDF again.", 409);
  return bytes;
}
