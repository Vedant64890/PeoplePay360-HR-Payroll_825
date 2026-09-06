import api from "./api";
export const employeeApi = {
  dashboard: async (month) =>
    (await api.get("/employee/dashboard", { params: { month } })).data.data,
  clock: async (data) =>
    (await api.post("/employee/attendance/clock", data)).data.data,
  requestLeave: async (data) =>
    (await api.post("/employee/leave", data)).data.data,
  cancelLeave: async (id, reason) =>
    (await api.post(`/employee/leave/${id}/cancel`, { reason })).data.data,
  updateProfile: async (data) =>
    (await api.patch("/employee/profile", data)).data.data,
  schedule: async (params) =>
    (await api.get("/employee/schedule", { params })).data.data,
  contacts: async (params) =>
    (await api.get("/employee/contacts", { params })).data.data,
  contracts: async () => (await api.get("/employee/contracts")).data.data,
  payroll: async (params) =>
    (await api.get("/employee/payroll", { params })).data.data,
  payslip: async ({ id }) =>
    (await api.get(`/employee/payslips/${id}`)).data.data,
  documents: async () => (await api.get("/employee/documents")).data.data,
  uploadDocument: async (file, metadata) =>
    (
      await api.post("/employee/documents", file, {
        params: { ...metadata, fileName: file.name },
        headers: {
          "Content-Type":
            file.type ||
            (file.name.toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : "application/octet-stream"),
        },
      })
    ).data.data,
  deleteDocument: async (id) =>
    (await api.delete(`/employee/documents/${id}`)).data.data,
  notifications: async () =>
    (await api.get("/employee/notifications")).data.data,
  markRead: async (keys) =>
    (await api.post("/employee/notifications/read", { keys })).data.data,
  settings: async () => (await api.get("/employee/settings")).data.data,
  saveSettings: async (data) =>
    (await api.put("/employee/settings", data)).data.data,
  changePassword: async (data) =>
    (await api.post("/employee/settings/password", data)).data.data,
};

export async function downloadEmployeeFile(kind, id, fileName) {
  try {
    const response = await api.get(
      kind === "payslip"
        ? `/employee/payslips/${id}/pdf`
        : `/employee/documents/${id}/download`,
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) {
    if (error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        /* Keep the original request error. */
      }
    }
    throw error;
  }
}
