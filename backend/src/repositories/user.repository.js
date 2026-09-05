import prisma from "../lib/prisma.js";

export function findUserByEmail(email) {
  return prisma.user.findUnique({
    where: {
      email,
    },
  });
}

export function findUserById(id) {
  return prisma.user.findUnique({
    where: {
      id,
    },
  });
}

export function findPublicUserById(id) {
  return prisma.user.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export function createUser(data) {
  return prisma.user.create({
    data,

    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
