import { verifyToken } from "../lib/jwt.js";
import { sessionCookieName } from "../lib/session-cookie.js";

import {
  findPublicUserById,
} from "../repositories/user.repository.js";

export async function authenticate(
  req,
  res,
  next
) {
  try {
    const cookieName = sessionCookieName(req);

    let token = req.cookies?.[cookieName];

    // Optional support for API clients/Postman.
    if (!token && !req.get("X-Workspace-Session")) {
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

    if (!user || !user.isActive || (decoded.sessionVersion ?? 0) !== user.sessionVersion) {
      return res.status(401).json({
        success: false,
        message: "Your account is unavailable. Contact an administrator.",
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
