import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // Only check/set cookie, do not access DB or use Node.js modules
  const sessionCookie = req.cookies.get("session_id");
  if (!sessionCookie) {
    // Set a temporary session_id (random UUID-like string)
    const tempId = crypto.randomUUID();
    const res = NextResponse.next();
    res.cookies.set("session_id", tempId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      // 1 hour expiry
      expires: new Date(Date.now() + 60 * 60 * 1000),
    });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/trpc).*)"],
};
