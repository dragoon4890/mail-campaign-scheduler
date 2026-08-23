import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Real Google OAuth. When GOOGLE creds are absent the app falls back to a
// clearly-labelled local dev session (see lib/session.ts) so the UI remains
// verifiable before OAuth credentials are provisioned.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: process.env.AUTH_GOOGLE_ID
    ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
    : [],
  pages: { signIn: "/login" },
  trustHost: true,
});
