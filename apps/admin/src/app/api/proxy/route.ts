import { auth } from "@/auth";
import { adminFetch } from "@/lib/api";
import { isSafePath } from "@/lib/safe-path";
import { NextRequest, NextResponse } from "next/server";

/**
 * Everything every verb does before it can talk to the API: check the admin is
 * signed in, and check the path cannot escape the `/api/admin` prefix. Returns
 * the validated path, or the response to send instead.
 */
async function resolvePath(
  req: NextRequest,
): Promise<{ path: string } | { error: NextResponse }> {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return { error: NextResponse.json({ error: "Missing path" }, { status: 400 }) };
  }
  if (!isSafePath(path)) {
    return { error: NextResponse.json({ error: "Bad path" }, { status: 400 }) };
  }

  return { path };
}

async function forward(req: NextRequest, method: string, withBody: boolean) {
  const resolved = await resolvePath(req);
  if ("error" in resolved) {
    return resolved.error;
  }

  const res = await adminFetch(`/api/admin${resolved.path}`, {
    method,
    ...(withBody ? { body: (await req.text()) || "{}" } : {}),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: NextRequest) {
  return forward(req, "GET", false);
}

export async function POST(req: NextRequest) {
  return forward(req, "POST", true);
}

export async function DELETE(req: NextRequest) {
  return forward(req, "DELETE", false);
}

export async function PATCH(req: NextRequest) {
  return forward(req, "PATCH", true);
}
