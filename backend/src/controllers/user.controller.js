import {
  getUserProfile,
} from "../services/user.service.js";

export async function getCurrentUser(
  req,
  res,
  next
) {
  try {
    const user = await getUserProfile(
      req.user.id
    );

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
}

export function adminOnly(req, res) {
  return res.status(200).json({
    success: true,
    message:
      "You successfully accessed an ADMIN-only route",
  });
}

export function managerOrAdmin(req, res) {
  return res.status(200).json({
    success: true,
    message:
      "You successfully accessed a MANAGER/ADMIN route",
  });
}