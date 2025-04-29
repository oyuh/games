import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { sessions, imposter, password } from "~/server/db/schema";
import { lte } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const now = new Date();

    // Delete expired rows from sessions table
    await db.delete(sessions).where(lte(sessions.expires_at, now));

    // Delete expired rows from imposter table
    await db.delete(imposter).where(lte(imposter.expires_at, now));

    // Delete expired rows from password table
    await db.delete(password).where(lte(password.expires_at, now));

    return NextResponse.json({ success: true, message: "Expired rows deleted successfully." });
  } catch (error) {

    console.error("Error deleting expired rows:", error);
    return NextResponse.json({ success: false, error: "Failed to delete expired rows."}, { status: 500 });
  }
}
