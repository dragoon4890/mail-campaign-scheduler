import { prisma } from "./index";

interface SenderAccount {
  email: string;
  smtpPass: string;
}

const PAIR_PATTERN = /^([^:\s]+):(\S+)$/;

export function parseSenderAccounts(
  raw: string | undefined,
): SenderAccount[] {
  if (!raw || raw.trim() === "") {
    throw new Error(
      'ETHEREAL_ACCOUNTS is not set. Expected comma-separated pairs: "user@ethereal.email:pass,..."',
    );
  }

  const accounts = raw
    .split(",")
    .map((pair) => pair.trim())
    .filter((pair) => pair !== "")
    .map((pair) => {
      const match = PAIR_PATTERN.exec(pair);
      if (!match || !match[1].includes("@")) {
        throw new Error(
          `Invalid account pair "${pair}". Expected format: email:pass`,
        );
      }
      return { email: match[1].toLowerCase(), smtpPass: match[2] };
    });

  if (accounts.length === 0) {
    throw new Error("ETHEREAL_ACCOUNTS contains no usable accounts.");
  }

  return accounts;
}

async function main(): Promise<void> {
  const accounts = parseSenderAccounts(process.env.ETHEREAL_ACCOUNTS);

  for (const account of accounts) {
    await prisma.sender.upsert({
      where: { email: account.email },
      update: { smtpUser: account.email, smtpPass: account.smtpPass },
      create: {
        email: account.email,
        smtpUser: account.email,
        smtpPass: account.smtpPass,
      },
    });
    console.log(`seeded sender: ${account.email}`);
  }

  console.log(`${accounts.length} sender(s) ready.`);
}

main()
  .catch((error: Error) => {
    console.error("seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
