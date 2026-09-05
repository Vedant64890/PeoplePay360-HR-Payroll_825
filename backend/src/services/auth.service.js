import {
  createUser,
  findUserByEmail,
} from "../repositories/user.repository.js";

import {
  hashPassword,
  comparePassword,
} from "../lib/password.js";

import { generateToken } from "../lib/jwt.js";

import AppError from "../utils/AppError.js";

export async function registerUser({
  name,
  email,
  password,
}) {
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    throw new AppError(
      "A user with this email already exists",
      409
    );
  }

  const hashedPassword = await hashPassword(password);

  const user = await createUser({
    name,
    email,
    password: hashedPassword,

    // Never allow a public registration request
    // to choose ADMIN.
    role: "USER",
  });

  return user;
}

export async function loginUser({
  email,
  password,
}) {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new AppError(
      "Invalid email or password",
      401
    );
  }

  const passwordMatches = await comparePassword(
    password,
    user.password
  );

  if (!passwordMatches) {
    throw new AppError(
      "Invalid email or password",
      401
    );
  }

  const token = generateToken(user.id);

  return {
    token,

    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  };
}