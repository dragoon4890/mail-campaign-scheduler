import { Queue } from "bullmq";
import {
  EMAIL_SEND_QUEUE,
  type SendEmailJobData,
} from "@assign/shared";
import { config } from "./config";

export const emailSendQueue = new Queue<SendEmailJobData>(EMAIL_SEND_QUEUE, {
  connection: { url: config.REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail: false,
  },
});
