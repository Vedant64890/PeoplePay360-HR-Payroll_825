import api from "./api";
export const employeeApi = {
  dashboard: async month => (await api.get("/employee/dashboard", { params: { month } })).data.data,
  clock: async data => (await api.post("/employee/attendance/clock", data)).data.data,
  requestLeave: async data => (await api.post("/employee/leave", data)).data.data,
  cancelLeave: async (id, reason) => (await api.post(`/employee/leave/${id}/cancel`, { reason })).data.data,
  updateProfile: async data => (await api.patch("/employee/profile", data)).data.data,
};
