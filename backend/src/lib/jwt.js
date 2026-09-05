import jwt from "jsonwebtoken";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

export function generateToken(userId) {
  return jwt.sign(
    { userId },
    getJwtSecret(),
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN || "1d",
    }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}
