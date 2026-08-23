import { auth } from "@/authServer";

export interface SessionUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  dev?: boolean;
}

// Single source of truth for the header/user chip. With Google credentials
// configured this returns the real OAuth session; without them it returns a
// labelled dev fallback so the dashboard stays verifiable.
export async function getSessionUser(): Promise<SessionUser | null> {
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    const session = await auth();
    return session?.user ? { ...session.user, dev: false } : null;
  }
  return { name: "Dev User", email: "dev@local", image: null, dev: true };
}

export const authEnabled = () =>
  Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
