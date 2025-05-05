import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db/index";
import { shadesSignals } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Missing game id" }, { status: 400 });
  }
  await db.delete(shadesSignals).where(eq(shadesSignals.id, id));
  return NextResponse.json({ success: true });
}
