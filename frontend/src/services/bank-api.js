import api from "./api";
export const bankApi = base => ({
  bankAccounts: async id => (await api.get(`${base}/employees/${id}/bank-accounts`)).data.data,
  addBankAccount: async (id, data) => (await api.post(`${base}/employees/${id}/bank-accounts`, data)).data.data,
  archiveBankAccount: async (id, bankId) => (await api.delete(`${base}/employees/${id}/bank-accounts/${bankId}`)).data.data,
});
