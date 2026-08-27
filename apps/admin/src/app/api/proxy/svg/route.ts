import { auth } from "@/auth";
import { adminFetch } from "@/lib/api";
import { isSafePath } from "@/lib/safe-path";
import { NextRequest, NextResponse } from "next/server";

/**
 * Image passthrough for the admin API, used by the puzzle viewer.
 *
 * The JSON proxy does res.json() on everything and so cannot carry an image.
 * This one forwards the body untouched, with the same auth check and the same
 * path allowlist.
 *
 * The response headers are set here rather than copied from upstream, so the
 * browser can only ever be told this is an SVG rendered inline. The viewer
 * loads it with an <img> tag, which renders SVG in a mode that cannot execute
 * script; inlining the markup instead would be stored XSS on the admin origin,
 * which is where the session cookie lives.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  if (!isSafePath(path)) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }

  const res = await adminFetch(`/api/admin${path}`);

  if (!res.ok) {
    return NextResponse.json(
      { error: `Upstream ${res.status}` },
      { status: res.status },
    );
  }

  const body = await res.text();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
