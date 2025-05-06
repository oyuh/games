import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { sessions, imposter, password, shadesSignals } from "~/server/db/schema";
import { lte } from "drizzle-orm";

const AUTH_TOKEN = process.env.CRON_API_KEY; // Replace with your actual token

export async function POST(req: NextRequest) {
  try {
    // Validate Authorization header
    if (!AUTH_TOKEN) {
      return NextResponse.json(
        { success: false, error: "Server misconfiguration: missing CRON_API_KEY." },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing or invalid token." },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    if (token !== AUTH_TOKEN) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid token." },
        { status: 401 }
      );
    }

    const now = new Date();

    // Delete expired rows from sessions table
    await db.delete(sessions).where(lte(sessions.expires_at, now));

    // Delete expired rows from imposter table
    await db.delete(imposter).where(lte(imposter.expires_at, now));

    // Delete expired rows from password table
    await db.delete(password).where(lte(password.expires_at, now));

    //Delete expired rows from shadesSignals table
    await db.delete(shadesSignals).where(lte(shadesSignals.expires_at, now));

    return NextResponse.json({ success: true, message: "Expired rows deleted successfully." });
  } catch (error) {
    console.error("Error deleting expired rows:", error);
    return NextResponse.json({ success: false, error: "Failed to delete expired rows." }, { status: 500 });
  }
}
