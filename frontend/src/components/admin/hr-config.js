import { configs } from "./workspace-config";
const field = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });
const relation = (key, label, source) => field(key, label, "relation", { source });
const optional = { optional: true };
const extraConfigs = {
  "review-cycles": { title: "Review cycles", singular: "review cycle", columns: [["name", "Cycle"], ["startDate", "Start"], ["endDate", "End"], ["_count.reviews", "Reviews"]], fields: [field("name", "Cycle name"), field("startDate", "Start date", "date"), field("endDate", "End date", "date"), field("description", "Description", "textarea", optional)] },
  reviews: { title: "Performance reviews", singular: "performance review", columns: [["name", "Review"], ["employee", "Employee"], ["reviewer", "Reviewer"], ["cycle.name", "Cycle"], ["status", "Stage"], ["rating", "Rating / 5"]], fields: [field("name", "Review name"), relation("employeeId", "Employee", "employees"), relation("reviewerId", "Reviewer", "employees"), relation("cycleId", "Review cycle", "cycles"), field("goals", "Goals", "textarea"), field("selfReview", "Recorded employee self review", "textarea", optional), field("managerReview", "Manager feedback", "textarea", optional), field("rating", "Rating (1 to 5)", "number", optional), field("status", "Review stage", "select", { options: ["SELF_REVIEW", "MANAGER_REVIEW", "FINAL"], default: "SELF_REVIEW" })], help: "Create a review cycle first. Reviews progress from Self review to Manager review to Final. Final reviews are locked." },
  documents: { title: "Employee documents", singular: "document reference", columns: [["name", "Document"], ["employee", "Employee"], ["category", "Category"], ["expiryDate", "Expires"]], fields: [field("name", "Document name"), relation("employeeId", "Employee", "employees"), field("category", "Category", "select", { options: ["IDENTITY", "EMPLOYMENT", "QUALIFICATION", "OTHER"], default: "EMPLOYMENT" }), field("url", "HTTPS document link", "url"), field("expiryDate", "Expiry date", "date", optional), field("description", "Description", "textarea", optional)], help: "Link to a document in your organization’s approved document storage. Access permissions are managed by that storage service." },
};
export function workspaceConfig(resource, hr) {
  if (!hr) return configs[resource];
  if (extraConfigs[resource]) return extraConfigs[resource];
  const config = configs[resource];
  if (resource === "attendance-days") return { title: "Daily attendance", singular: "attendance day", columns: [["employee", "Employee"], ["workDate", "Date"], ["status", "Status"], ["workedHours", "Worked hours"], ["lateMinutes", "Late minutes"], ["overtimeHours", "Overtime hours"]], fields: [], noCreate: true, noEdit: true, help: "Refresh completed days to record absences from assigned schedules. Future days are excluded." };
  const fields = config.fields.filter(f => !["userId", "salaryStructureId", "payFrequency"].includes(f.key)).map(f => f.key === "payrollTreatment" ? { ...f, label: "Pay during leave" } : f);
  if (resource === "employees") fields.push(field("birthDate", "Birth date", "date", optional));
  const extra = resource === "employees" ? { columns: [...config.columns.slice(0, -1), ["jobPosition.title", "Job position"], ["manager", "Manager"], config.columns.at(-1)] }
    : resource === "contracts" ? { columns: config.columns.map(c => c[0] === "status" ? ["effectiveStatus", "Status"] : c), removable: true }
    : resource === "attendance" ? { title: "Check-ins & check-outs", columns: [["day.employee", "Employee"], ["day.workDate", "Work date"], ["checkIn", "Check in"], ["checkOut", "Check out"], ["sessionHours", "Worked hours"], ["day.lateMinutes", "Late minutes"], ["day.overtimeMinutes", "Day overtime (min)"], ["checkoutStatus", "Checkout"]], removable: true }
    : resource === "allocations" ? { noEdit: false, columns: [["employee", "Employee"], ["leaveType.name", "Type"], ["amount", "Allocated"], ["taken", "Taken"], ["remaining", "Remaining"], ["unit", "Unit"], ["validFrom", "Valid from"], ["validUntil", "Valid until"], ["status", "Status"]] }
    : resource === "leave" ? { noEdit: false }
    : resource === "assignments" ? { noEdit: false, removable: true } : {};
  return { ...config, fields, ...extra };
}
