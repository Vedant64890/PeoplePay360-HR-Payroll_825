import api from "./api";

export const adminLogin = async (credentials) => (await api.post("/auth/admin/login", credentials)).data;
export const fetchDashboard = async (params) => (await api.get("/admin/dashboard", { params })).data.data;
export const fetchAccounts = async (params) => (await api.get("/admin/users", { params })).data.data;
export const fetchEmployees = async (params) => (await api.get("/admin/employees", { params })).data.data;
export const createAccount = async (data) => (await api.post("/admin/users", data)).data;
export const updateAccount = async (id, data) => (await api.patch(`/admin/users/${id}`, data)).data;
export const createEmployee = async (data) => (await api.post("/admin/employees", data)).data;
export const fetchWorkspace = async (resource, params) => (await api.get(`/admin/workspace/${resource}`, { params })).data.data;
export const fetchWorkspaceRecord = async (resource, id) => (await api.get(`/admin/workspace/${resource}/${id}`)).data.data;
export const saveWorkspaceRecord = async (resource, data, id) => (id ? await api.put(`/admin/workspace/${resource}/${id}`, data) : await api.post(`/admin/workspace/${resource}`, data)).data.data;
export const workspaceAction = async (resource, id, data) => (await api.post(`/admin/workspace/${resource}/${id}/actions`, data)).data.data;
export const savePayslipInputs = async (id, inputs) => (await api.put(`/admin/workspace/payslips/${id}/inputs`, { inputs })).data.data;
export const exportWorkspaceReport = async (params) => (await api.get("/admin/workspace/reports/export", { params, responseType: "blob" })).data;
export const saveWorkspaceSettings = async (data) => (await api.put("/admin/workspace/settings", data)).data.data;
export function errorMessage(error, fallback = "Something went wrong. Please try again.") {
  return error.response?.data?.errors?.[0]?.message || error.response?.data?.message || (error.code === "ERR_NETWORK" ? "We couldn’t connect to the server. Please try again." : fallback);
}
