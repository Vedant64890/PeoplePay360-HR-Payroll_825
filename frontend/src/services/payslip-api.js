import api from "./api";
export const payslipApi = base => ({
  downloadPayslip: async id => (await api.get(`${base}/payslips/${id}/pdf`, { responseType: "blob" })).data,
  deliveryHistory: async id => (await api.get(`${base}/payruns/${id}/deliveries`)).data.data,
  sendPayslips: async (id, data) => (await api.post(`${base}/payruns/${id}/deliveries`, data)).data.data,
  retryDelivery: async (id, deliveryId) => (await api.post(`${base}/payruns/${id}/deliveries/${deliveryId}/retry`)).data.data,
});
