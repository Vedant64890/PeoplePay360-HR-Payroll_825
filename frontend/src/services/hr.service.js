import api from "./api";
export const hrLogin = async credentials => (await api.post("/auth/hr/login", credentials)).data;
export const fetchHrDashboard = async params => (await api.get("/hr/dashboard", { params })).data.data;
export const hrWorkspaceApi = {
  saveWorkspaceSettings: async data => (await api.put("/hr/workspace/settings", data)).data.data,
  fetchWorkspace: async (resource, params) => (await api.get(`/hr/workspace/${resource}`, { params })).data.data,
  fetchWorkspaceRecord: async (resource, id) => (await api.get(`/hr/workspace/${resource}/${id}`)).data.data,
  saveWorkspaceRecord: async (resource, data, id) => (id ? await api.put(`/hr/workspace/${resource}/${id}`, data) : await api.post(`/hr/workspace/${resource}`, data)).data.data,
  workspaceAction: async (resource, id, data) => (await api.post(`/hr/workspace/${resource}/${id}/actions`, data)).data.data,
  rebuildAttendance: async data => (await api.post("/hr/workspace/attendance-days/recalculate", data)).data.data,
};
