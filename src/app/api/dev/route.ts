import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { sessions, imposter, password, shadesSignals } from "~/server/db/schema";
import { lte } from "drizzle-orm";

const DEV_CRON_KEY = process.env.DEV_CRON_KEY; // Optional dev cron key

// Dev cleanup route - supports both local dev and cron jobs (Vercel-optimized)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    // In production, always require authentication
    if (process.env.NODE_ENV === "production") {
      if (!DEV_CRON_KEY) {
        return NextResponse.json(
          { success: false, error: "Server misconfiguration: missing DEV_CRON_KEY." },
          { status: 500 }
        );
      }

      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Missing or invalid token." },
          { status: 401 }
        );
      }

      const token = authHeader.split(" ")[1];
      if (token !== DEV_CRON_KEY) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Invalid token." },
          { status: 401 }
        );
      }
    }
    // In development, auth is optional but respected if provided
    else if (authHeader && DEV_CRON_KEY) {
      if (!authHeader.startsWith("Bearer ")) {
        return NextResponse.json(
          { success: false, error: "Invalid authorization format. Use Bearer token." },
          { status: 401 }
        );
      }

      const token = authHeader.split(" ")[1];
      if (token !== DEV_CRON_KEY) {
        return NextResponse.json(
          { success: false, error: "Invalid dev token." },
          { status: 401 }
        );
      }
    }

    const now = new Date();
    const environment = process.env.NODE_ENV;
    const isVercel = !!process.env.VERCEL;

    console.log(`[${environment}${isVercel ? '-vercel' : ''}] Starting cleanup process at ${now.toISOString()}...`);

    const processedTables = [];
    const startTime = Date.now();

    try {
      // Delete expired rows from sessions table
      await db.delete(sessions).where(lte(sessions.expires_at, now));
      console.log(`[${environment}${isVercel ? '-vercel' : ''}] Deleted expired sessions`);
      processedTables.push('sessions');

      // Delete expired rows from imposter table
      await db.delete(imposter).where(lte(imposter.expires_at, now));
      console.log(`[${environment}${isVercel ? '-vercel' : ''}] Deleted expired imposter games`);
      processedTables.push('imposter');

      // Delete expired rows from password table
      await db.delete(password).where(lte(password.expires_at, now));
      console.log(`[${environment}${isVercel ? '-vercel' : ''}] Deleted expired password games`);
      processedTables.push('password');

      // Delete expired rows from shadesSignals table
      await db.delete(shadesSignals).where(lte(shadesSignals.expires_at, now));
      console.log(`[${environment}${isVercel ? '-vercel' : ''}] Deleted expired shades signals games`);
      processedTables.push('shadesSignals');

      console.log(`[${environment}${isVercel ? '-vercel' : ''}] Cleanup completed successfully`);

      const executionTime = Date.now() - startTime;
      console.log(`[${environment}${isVercel ? '-vercel' : ''}] Execution time: ${executionTime}ms`);

    } catch (dbError) {
      console.error(`[${environment}${isVercel ? '-vercel' : ''}] Database error during cleanup:`, dbError);
      throw dbError;
    }

    return NextResponse.json({
      success: true,
      message: "Expired rows deleted successfully.",
      timestamp: now.toISOString(),
      environment: isVercel ? `${environment}-vercel` : environment,
      processedTables,
      executionTimeMs: Date.now() - startTime
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
    const now = new Date();
    const environment = process.env.NODE_ENV;
    const hasCronKey = !!DEV_CRON_KEY;
    const isVercel = !!process.env.VERCEL;

    return NextResponse.json({
      success: true,
      message: "Dev cleanup endpoint is available. Use POST to perform cleanup.",
      timestamp: now.toISOString(),
      environment: isVercel ? `${environment}-vercel` : environment,
      platform: isVercel ? "Vercel" : "Local/Other",
      authentication: {
        cronKeyConfigured: hasCronKey,
        requiresAuth: environment === "production",
        note: environment === "development"
          ? "In development: auth is optional but respected if provided"
          : "In production: Bearer token authentication is required"
      },
      vercelInfo: isVercel ? {
        region: process.env.VERCEL_REGION ?? "unknown",
        deployment: process.env.VERCEL_URL ?? "unknown"
      } : undefined
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
