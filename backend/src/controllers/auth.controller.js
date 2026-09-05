import {
  loginUser,
  registerUser,
} from "../services/auth.service.js";

function getCookieOptions() {
  const isProduction =
    process.env.NODE_ENV === "production";

  return {
    httpOnly: true,

    secure: isProduction,

    sameSite: isProduction
      ? "none"
      : "lax",

    maxAge: 24 * 60 * 60 * 1000,

    path: "/",
  };
}

export async function register(req, res, next) {
  try {
    const user = await registerUser(
      req.validatedBody
    );

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user,
    });
  } catch (error) {
    next(error);
  }
}

async function completeLogin(req, res, next, adminOnly = false, hrOnly = false) {
  try {
    const { token, user } = await loginUser(
      req.validatedBody,
      { adminOnly, hrOnly }
    );

    const cookieName =
      process.env.JWT_COOKIE_NAME ||
      "access_token";

    res.cookie(
      cookieName,
      token,
      getCookieOptions()
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user,
    });
  } catch (error) {
    next(error);
  }
}

export const login = (req, res, next) => completeLogin(req, res, next);
export const adminLogin = (req, res, next) => completeLogin(req, res, next, true);
export const hrLogin = (req, res, next) => completeLogin(req, res, next, false, true);

export function logout(req, res) {
  const cookieName =
    process.env.JWT_COOKIE_NAME ||
    "access_token";

  res.clearCookie(cookieName, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production",
    sameSite:
      process.env.NODE_ENV === "production"
        ? "none"
        : "lax",
    path: "/",
  });

  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
}
