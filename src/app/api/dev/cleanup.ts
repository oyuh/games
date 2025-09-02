import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { sessions, imposter, password, shadesSignals } from "~/server/db/schema";
import { lte } from "drizzle-orm";

// Dev-only cleanup route - no auth required for local development
export async function POST() {
  try {
    // Only allow in development environment
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "This endpoint is only available in development." },
        { status: 403 }
      );
    }

    const now = new Date();

    console.log("Starting cleanup process...");

    // Delete expired rows from sessions table
    await db.delete(sessions).where(lte(sessions.expires_at, now));
    console.log("Deleted expired sessions");

    // Delete expired rows from imposter table
    await db.delete(imposter).where(lte(imposter.expires_at, now));
    console.log("Deleted expired imposter games");

    // Delete expired rows from password table
    await db.delete(password).where(lte(password.expires_at, now));
    console.log("Deleted expired password games");

    // Delete expired rows from shadesSignals table
    await db.delete(shadesSignals).where(lte(shadesSignals.expires_at, now));
    console.log("Deleted expired shades signals games");

    return NextResponse.json({
      success: true,
      message: "Expired rows deleted successfully.",
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error("Error deleting expired rows:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete expired rows.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// Also allow GET requests for easier testing - shows status without deleting
export async function GET() {
  try {
    // Only allow in development environment
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "This endpoint is only available in development." },
        { status: 403 }
      );
    }

    const now = new Date();

    return NextResponse.json({
      success: true,
      message: "Dev cleanup endpoint is available. Use POST to perform cleanup.",
      timestamp: now.toISOString(),
      note: "This endpoint only works in development mode and bypasses authentication."
    });
  } catch (error) {
    console.error("Error in GET endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process request.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
