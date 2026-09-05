import {
  findPublicUserById,
} from "../repositories/user.repository.js";

import AppError from "../utils/AppError.js";

export async function getUserProfile(userId) {
  const user = await findPublicUserById(
    userId
  );

  if (!user) {
    throw new AppError(
      "User not found",
      404
    );
  }

  return user;
}