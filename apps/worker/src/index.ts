import { Worker } from "bullmq";
import { prisma } from "@assign/db";
import {
  EMAIL_SEND_QUEUE,
  type SendEmailJobData,
} from "@assign/shared";
import { config } from "./config";
import { processSendEmail } from "./services/sendEmailProcessor";
import { emailSender } from "./services/smtpTransport";

// TODO(M3): concurrency becomes WORKER_CONCURRENCY env knob alongside
// queue-level MIN_DELAY_MS limiter and per-sender rate limiting.
export const worker = new Worker<SendEmailJobData>(
  EMAIL_SEND_QUEUE,
  (job) => processSendEmail(job, { emailSender }),
  { connection: { url: config.REDIS_URL }, concurrency: 5 },
);

worker.on("completed", (job) => {
  console.log(`completed ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`failed ${job?.id ?? "?"}: ${error.message}`);
});

console.log(`worker consuming queue "${EMAIL_SEND_QUEUE}" (concurrency 5)`);

async function shutdown(): Promise<void> {
  console.log("shutting down worker...");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
