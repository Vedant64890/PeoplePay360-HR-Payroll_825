import "dotenv/config";

import app from "./app.js";
import prisma from "./lib/prisma.js";
import { startDeliveryWorker } from "./services/payslip-delivery.service.js";
const stopDeliveryWorker = startDeliveryWorker();

const PORT =
  process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(
    `Backend running on http://localhost:${PORT}`
  );
});


async function shutdown() {
  stopDeliveryWorker();
  console.log(
    "Shutting down backend..."
  );

  await prisma.$disconnect();

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
