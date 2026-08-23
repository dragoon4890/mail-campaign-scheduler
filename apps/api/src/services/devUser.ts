import { prisma } from "@assign/db";

// TEMPORARY: replaced by real Google-auth users when the auth commit lands.
export const DEV_USER = {
  googleSub: "dev",
  email: "dev@local",
  name: "Local Dev",
} as const;

export async function getDevUserId(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: DEV_USER.email },
    update: {},
    create: { ...DEV_USER },
  });
  return user.id;
}
