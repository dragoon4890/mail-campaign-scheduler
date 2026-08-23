import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// EDGE-SAFE gate: no filesystem access here. Throttling flag is build-inlined
// via next.config env; session presence is checked by cookie name (Auth.js v5).
const oauthEnabled = Boolean(process.env.AUTH_GOOGLE_ID);

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(req: NextRequest) {
  if (!oauthEnabled) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) =>
    Boolean(req.cookies.get(name)?.value),
  );
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/sent"],
};
