import api from "./api";
import { payslipApi } from "./payslip-api";
import { bankApi } from "./bank-api";
export const fetchPayrollDashboard = async params => (await api.get("/payroll/dashboard", { params })).data.data;
export const fetchPayrollProfile = async () => (await api.get("/payroll/profile")).data.data;
export const savePayrollProfile = async data => (await api.put("/payroll/profile", data)).data.data;
export const payrollApi = {
  ...payslipApi("/payroll/workspace"),
  ...bankApi("/payroll/workspace"),
  eligibleEmployees: async params => (await api.get("/payroll/workspace/payruns/eligible", { params })).data.data,
  fetchWorkspace: async (resource, params) => (await api.get(`/payroll/workspace/${resource}`, { params })).data.data,
  fetchWorkspaceRecord: async (resource, id) => (await api.get(`/payroll/workspace/${resource}/${id}`)).data.data,
  saveWorkspaceRecord: async (resource, data, id) => (id ? await api.put(`/payroll/workspace/${resource}/${id}`, data) : await api.post(`/payroll/workspace/${resource}`, data)).data.data,
  workspaceAction: async (resource, id, data) => data.action === "remove" ? (await api.delete(`/payroll/workspace/${resource}/${id}`, { data })).data.data : (await api.post(`/payroll/workspace/${resource}/${id}/actions`, data)).data.data,
  deleteWorkspaceRecord: async (resource, id, reason) => (await api.delete(`/payroll/workspace/${resource}/${id}`, { data: { reason } })).data.data,
  savePayslipInputs: async (id, inputs) => (await api.put(`/payroll/workspace/payslips/${id}/inputs`, { inputs })).data.data,
  rebuildAttendance: async data => (await api.post("/payroll/workspace/attendance-days/recalculate", data)).data.data,
  exportReport: async params => (await api.get("/payroll/workspace/reports/export", { params, responseType: "blob" })).data,
};
