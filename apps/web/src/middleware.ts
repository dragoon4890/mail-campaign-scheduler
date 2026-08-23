import { auth } from "@/auth";
import { authEnabled } from "@/lib/session";

// Dashboard routes require a real Google session once OAuth is configured.
// Without credentials the gate opens so the UI stays verifiable (labelled
// dev mode in the header).
export default auth((req) => {
  if (!authEnabled()) return;
  if (!req.auth) {
    return Response.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/", "/sent"],
};
