import api from "./api";
export const workspaceHome = role => role === "ADMIN" ? "/admin/dashboard" : role === "HR_MANAGER" ? "/hr/dashboard" : "/workspace";
export const requestPasswordReset = async email => (await api.post("/auth/forgot-password", { email })).data;
export const resetPassword = async (token, password) => (await api.post("/auth/reset-password", { token, password })).data;

export async function registerUser(data) {
  const response = await api.post(
    "/auth/register",
    data
  );

  return response.data;
}

export async function loginUser(data) {
  const response = await api.post(
    "/auth/login",
    data
  );

  return response.data;
}

export async function logoutUser() {
  const response = await api.post(
    "/auth/logout"
  );

  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get(
    "/users/me"
  );

  return response.data;
}
