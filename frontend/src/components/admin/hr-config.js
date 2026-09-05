import { configs } from "./workspace-config";
export function workspaceConfig(resource, hr) {
  if (!hr) return configs[resource];
  const config = configs[resource];
  if (resource === "attendance-days") return { title: "Daily attendance", singular: "attendance day", columns: [["employee", "Employee"], ["workDate", "Date"], ["status", "Status"], ["workedHours", "Worked hours"], ["lateMinutes", "Late minutes"], ["overtimeHours", "Overtime hours"]], fields: [], noCreate: true, noEdit: true, help: "Refresh completed days to record absences from assigned schedules. Future days are excluded." };
  const fields = config.fields.filter(f => !["userId", "salaryStructureId", "payFrequency"].includes(f.key)).map(f => f.key === "payrollTreatment" ? { ...f, label: "Pay during leave" } : f);
  const extra = resource === "employees" ? { columns: [...config.columns.slice(0, -1), ["jobPosition.title", "Job position"], ["manager", "Manager"], config.columns.at(-1)] }
    : resource === "contracts" ? { columns: config.columns.map(c => c[0] === "status" ? ["effectiveStatus", "Status"] : c), removable: true }
    : resource === "attendance" ? { title: "Check-ins & check-outs", columns: [["day.employee", "Employee"], ["day.workDate", "Work date"], ["checkIn", "Check in"], ["checkOut", "Check out"], ["sessionHours", "Worked hours"], ["day.lateMinutes", "Late minutes"], ["day.overtimeMinutes", "Day overtime (min)"], ["checkoutStatus", "Checkout"]], removable: true }
    : resource === "allocations" ? { noEdit: false, columns: [["employee", "Employee"], ["leaveType.name", "Type"], ["amount", "Allocated"], ["taken", "Taken"], ["remaining", "Remaining"], ["unit", "Unit"], ["validFrom", "Valid from"], ["validUntil", "Valid until"], ["status", "Status"]] }
    : resource === "leave" ? { noEdit: false }
    : resource === "assignments" ? { noEdit: false, removable: true } : {};
  return { ...config, fields, ...extra };
}
