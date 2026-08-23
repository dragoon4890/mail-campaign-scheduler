import { Worker, Queue } from "bullmq";
import { prisma } from "@assign/db";
import {
  EMAIL_SEND_QUEUE,
  INTERRUPTED,
  type SendEmailJobData,
} from "@assign/shared";
import { config } from "./config";
import { processSendEmail } from "./services/sendEmailProcessor";
import { emailSender } from "./services/smtpTransport";

// TODO(M3): concurrency becomes WORKER_CONCURRENCY env knob alongside
// queue-level MIN_DELAY_MS limiter and per-sender rate limiting.
const CONCURRENCY = 5;
const PROMOTE_INTERVAL_MS = 10_000;

// Native delayed-job promotion proved unreliable on this stack (jobs stayed
// parked while workers blocked), so workers promote due jobs themselves.
async function promoteDueJobs(): Promise<void> {
  const queue = new Queue<SendEmailJobData>(EMAIL_SEND_QUEUE, {
    connection: { url: config.REDIS_URL },
  });
  try {
    const delayed = await queue.getDelayed(0, 100);
    const now = Date.now();
    for (const job of delayed) {
      if (job.timestamp + job.opts.delay! <= now) {
        await job.promote().catch(() => {
          /* lost race to another promoter or already moved */
        });
      }
    }
  } finally {
    await queue.close();
  }
}

// Boot-time crash recovery: a row still SENDING when this process starts had
// its owner killed mid-send (at-most-once window). Give it an honest terminal
// state instead of limbo — never re-send it.
async function failStaleSendingRowsAtBoot(): Promise<number> {
  const stale = await prisma.email.findMany({
    where: { status: "SENDING" },
    select: { id: true },
  });
  for (const email of stale) {
    await prisma.email.updateMany({
      where: { id: email.id, status: "SENDING" },
      data: { status: "FAILED", lastError: INTERRUPTED },
    });
    console.warn(`boot recovery: SENDING row ${email.id} -> FAILED (${INTERRUPTED})`);
  }
  return stale.length;
}

async function main(): Promise<void> {
  const recovered = await failStaleSendingRowsAtBoot();
  if (recovered > 0) {
    console.log(`boot recovery: finalized ${recovered} interrupted row(s)`);
  }

  const worker = new Worker<SendEmailJobData>(
    EMAIL_SEND_QUEUE,
    (job) => processSendEmail(job, { emailSender }),
    { connection: { url: config.REDIS_URL }, concurrency: CONCURRENCY },
  );

  worker.on("completed", (job) => {
    console.log(`completed ${job.id}`);
  });
  worker.on("failed", (job, error) => {
    console.error(`failed ${job?.id ?? "?"}: ${error.message}`);
  });

  console.log(
    `worker consuming queue "${EMAIL_SEND_QUEUE}" (concurrency ${CONCURRENCY})`,
  );

  const promoter = setInterval(() => {
    void promoteDueJobs().catch((error) =>
      console.error("promoteDueJobs failed", error),
    );
  }, PROMOTE_INTERVAL_MS);

  async function shutdown(): Promise<void> {
    console.log("shutting down worker...");
    clearInterval(promoter);
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((error) => {
  console.error("worker failed to start", error);
  process.exit(1);
});
