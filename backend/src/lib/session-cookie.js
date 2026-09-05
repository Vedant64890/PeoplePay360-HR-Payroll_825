export function sessionCookieName(req) {
  const base = process.env.JWT_COOKIE_NAME || "access_token";
  const session = req.get("X-Workspace-Session");
  if (session === undefined) return base; // Existing API/cookie clients.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session)) {
    const error = new Error("Invalid workspace session. Reload and sign in again.");
    error.statusCode = 400;
    throw error;
  }
  return `${base}_${session.toLowerCase()}`;
}
