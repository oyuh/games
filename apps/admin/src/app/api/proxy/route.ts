import { auth } from "@/auth";
import { adminFetch } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

function normalizeAdminProxyPath(path: string | null) {
  if (!path) return null;
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//") || path.includes("://")) return null;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return path;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = normalizeAdminProxyPath(req.nextUrl.searchParams.get("path"));
  if (!path) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const res = await adminFetch(`/api/admin${path}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = normalizeAdminProxyPath(req.nextUrl.searchParams.get("path"));
  if (!path) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const body = await req.text();

  const res = await adminFetch(`/api/admin${path}`, {
    method: "POST",
    body: body || "{}",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = normalizeAdminProxyPath(req.nextUrl.searchParams.get("path"));
  if (!path) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const res = await adminFetch(`/api/admin${path}`, { method: "DELETE" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = normalizeAdminProxyPath(req.nextUrl.searchParams.get("path"));
  if (!path) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const body = await req.text();

  const res = await adminFetch(`/api/admin${path}`, {
    method: "PATCH",
    body: body || "{}",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
