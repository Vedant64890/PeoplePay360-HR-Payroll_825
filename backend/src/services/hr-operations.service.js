import { z } from "zod";
import prisma from "../lib/prisma.js";
import { audit, fail, json } from "../lib/workspace.js";

const text = z.string().trim().min(1).max(150);
const note = z.string().trim().max(5000).nullable().optional();
const id = z.number().int().positive();
const version = z.number().int().positive().optional();
const employee = { select: { id: true, firstName: true, lastName: true, employeeCode: true } };
export const operationModels = {
  "review-cycles": { model: "hrReviewCycle", include: { _count: { select: { reviews: true } } } },
  reviews: { model: "hrReview", include: { employee, reviewer: employee, cycle: true } },
  documents: { model: "hrDocument", include: { employee } },
};
export const operationSchemas = {
  "review-cycles": z.object({ name: text, startDate: z.iso.date(), endDate: z.iso.date(), description: note, version }).strict().refine(v => v.endDate >= v.startDate, "Cycle end must follow its start."),
  reviews: z.object({ name: text, employeeId: id, reviewerId: id, cycleId: id, goals: z.string().trim().min(1).max(5000), selfReview: note, managerReview: note, rating: z.number().int().min(1).max(5).nullable().optional(), status: z.enum(["SELF_REVIEW", "MANAGER_REVIEW", "FINAL"]).default("SELF_REVIEW"), version }).strict().refine(v => v.employeeId !== v.reviewerId, "Choose a different employee as reviewer."),
  documents: z.object({ name: text, employeeId: id, category: z.enum(["IDENTITY", "EMPLOYMENT", "QUALIFICATION", "OTHER"]), url: z.url().max(2000).refine(v => new URL(v).protocol === "https:", "Use an HTTPS document link."), expiryDate: z.iso.date().nullable().optional(), description: note, version }).strict(),
};
export async function listOperations(name, query) {
  const { model, include } = operationModels[name];
  const where = { ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}), ...(query.employeeId && name !== "review-cycles" ? { employeeId: query.employeeId } : {}) };
  const [items, total] = await prisma.$transaction([prisma[model].findMany({ where, include, orderBy: { id: "desc" }, take: 20, skip: (query.page - 1) * 20 }), prisma[model].count({ where })]);
  return json({ items, total, page: query.page, pageSize: 20 });
}
export async function operationDetail(name, id) {
  const { model, include } = operationModels[name];
  const record = await prisma[model].findUnique({ where: { id }, include });
  if (!record) fail("Record not found.", 404);
  return json(record);
}
export async function saveOperation(name, input, actorId, id) {
  return prisma.$transaction(async tx => {
    const { model } = operationModels[name];
    const before = id ? await tx[model].findUnique({ where: { id } }) : null;
    if (id && !before) fail("Record not found.", 404);
    if (before && before.version !== input.version) fail("This record changed. Reload before saving.", 409);
    const { version, ...data } = input;
    for (const key of ["startDate", "endDate", "expiryDate"]) if (data[key]) data[key] = new Date(data[key]);
    for (const key of ["employeeId", "reviewerId"]) if (data[key] && !await tx.employee.count({ where: { id: data[key], status: { not: "ARCHIVED" } } })) fail("Choose an unarchived employee.");
    if (name === "review-cycles" && before && await tx.hrReview.count({ where: { cycleId: id } }) && (+data.startDate !== +before.startDate || +data.endDate !== +before.endDate)) fail("A cycle with reviews cannot change its dates.", 409);
    if (name === "reviews") {
      if (!await tx.hrReviewCycle.count({ where: { id: data.cycleId } })) fail("Choose an existing review cycle.");
      if (before && ["employeeId", "cycleId"].some(key => data[key] !== before[key])) fail("Keep the same employee and review cycle.", 409);
      if (before?.status === "FINAL") fail("Final reviews cannot be edited.", 409);
      const stages = ["SELF_REVIEW", "MANAGER_REVIEW", "FINAL"];
      const previous = stages.indexOf(before?.status || "SELF_REVIEW"), next = stages.indexOf(data.status);
      if ((!before && next !== 0) || next < previous || next > previous + 1) fail("Follow the sequence: Self review, Manager review, Final review.", 409);
      if (next >= 1 && !data.selfReview?.trim()) fail("Record the employee self review before manager review.");
      if (next === 2 && (!data.managerReview?.trim() || !data.rating)) fail("Final review requires manager feedback and a rating from 1 to 5.");
    }
    const record = before ? await tx[model].update({ where: { id, version: input.version }, data: { ...data, version: { increment: 1 } } }) : await tx[model].create({ data });
    await audit(tx, actorId, `HR_${name.toUpperCase().replaceAll("-", "_")}_${before ? "UPDATED" : "CREATED"}`, model, record.id);
    return json(record);
  }, { isolationLevel: "Serializable" });
}

export async function hrAlerts() {
  const [leave, allocations, reviews, documents] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: { in: ["SUBMITTED", "FIRST_APPROVED"] } } }),
    prisma.leaveAllocation.count({ where: { status: "SUBMITTED" } }),
    prisma.hrReview.count({ where: { status: { not: "FINAL" } } }),
    prisma.hrDocument.count({ where: { expiryDate: { lte: new Date(Date.now() + 30 * 86400000) } } }),
  ]);
  return [{ name: "Leave requests awaiting approval", count: leave, target: "approvals" }, { name: "Leave allocations awaiting approval", count: allocations, target: "approvals" }, { name: "Open performance reviews", count: reviews, target: "reviews" }, { name: "Documents expired or expiring within 30 days", count: documents, target: "documents" }];
}
