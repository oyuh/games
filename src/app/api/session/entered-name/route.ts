import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "../../../../server/db/index";
import { sessions } from "../../../../server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) {
    return NextResponse.json({}, { status: 200 });
  }

  // Ensure session row exists for every session_id cookie
  let session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    columns: { id: true, entered_name: true, created_at: true, expires_at: true },
  });

  const now = new Date();
  if (!session) {
    const expires = new Date(now.getTime() + 60 * 60 * 1000);
    await db.insert(sessions).values({
      id: sessionId,
      created_at: now,
      expires_at: expires,
      entered_name: null,
      game_data: null,
    });
    session = {
      id: sessionId,
      entered_name: null,
      created_at: now,
      expires_at: expires,
    };
  } else {
    // Update expiration date if the session is still active
    const expires = new Date(now.getTime() + 60 * 60 * 1000);
    await db.update(sessions)
      .set({ expires_at: expires })
      .where(eq(sessions.id, sessionId));
    session.expires_at = expires;
  }

  return NextResponse.json(session);
}

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "No session" }, { status: 400 });
  }
  const { name } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }
  let session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!session) {
    const now = new Date();
    const expires = new Date(now.getTime() + 60 * 60 * 1000);
    await db.insert(sessions).values({
      id: sessionId,
      created_at: now,
      expires_at: expires,
      entered_name: name,
      game_data: null,
    });
    return NextResponse.json({ success: true, created: true });
  }

  // Always update the expiration date when updating a session
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  await db.update(sessions)
    .set({
      entered_name: name,
      expires_at: expires
    })
    .where(eq(sessions.id, sessionId));
  return NextResponse.json({ success: true, updated: true });
}

export async function DELETE(req: NextRequest) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "No session" }, { status: 400 });
  }
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  const res = NextResponse.json({ success: true });
  res.cookies.set("session_id", "", { path: "/", expires: new Date(0) });
  return res;
}
