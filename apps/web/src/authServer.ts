import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { loadRootEnv } from "@/lib/rootEnv";

// SERVER-ONLY auth (nodejs runtime). Middleware uses the cookie gate in
// middleware.ts instead — edge bundles cannot read the filesystem.

type AuthInstance = ReturnType<typeof NextAuth>;

const globalForAuth = globalThis as unknown as {
  __reachinboxAuth?: AuthInstance;
};

function build(): AuthInstance {
  loadRootEnv();
  console.log(
    Object.keys(process.env).filter((k) => /AUTH|GOOGLE/i.test(k)),
  );
  return NextAuth({
    providers: process.env.AUTH_GOOGLE_ID
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : [],
    pages: { signIn: "/login" },
    trustHost: true,
  });
}

export function getAuth(): AuthInstance {
  if (!globalForAuth.__reachinboxAuth) globalForAuth.__reachinboxAuth = build();
  return globalForAuth.__reachinboxAuth;
}

export function auth() {
  return getAuth().auth();
}

export function handlers() {
  return getAuth().handlers;
}
