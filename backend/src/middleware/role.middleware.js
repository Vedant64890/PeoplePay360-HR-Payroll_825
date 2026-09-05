import { verifyToken } from "../lib/jwt.js";

import {
  findPublicUserById,
} from "../repositories/user.repository.js";

export async function authenticate(
  req,
  res,
  next
) {
  try {
    const cookieName =
      process.env.JWT_COOKIE_NAME ||
      "access_token";

    let token = req.cookies?.[cookieName];

    // Optional support for API clients/Postman.
    if (!token) {
      const authorization =
        req.headers.authorization;

      if (
        authorization &&
        authorization.startsWith("Bearer ")
      ) {
        token = authorization.substring(7);
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = verifyToken(token);

    const user = await findPublicUserById(
      decoded.userId
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        "Invalid or expired authentication token",
    });
  }
}

export function authorizeRoles(
  ...allowedRoles
) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (
      !allowedRoles.includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to perform this action",
      });
    }

    next();
  };
}