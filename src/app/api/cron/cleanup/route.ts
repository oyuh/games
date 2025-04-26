import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredData } from "../../../../scripts/session-and-game-expiration";

// API route for cron job to trigger cleanup of expired sessions and games
export async function GET(req: NextRequest) {
  try {
    // Set a simple API key verification
    // (You may want to use a more secure authentication method in production)
    const apiKey = req.headers.get("x-api-key");
    const expectedApiKey = process.env.CRON_API_KEY;

    // If API key is configured and doesn't match, return unauthorized
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return NextResponse.json(
        { error: "Unauthorized access" },
        { status: 401 }
      );
    }

    // Run the cleanup process
    const result = await cleanupExpiredData();

    // Return the result
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in cleanup cron job:", error);
    return NextResponse.json(
      { error: "Internal server error", message: (error as Error).message },
      { status: 500 }
    );
  }
}

// Allow CORS for cron job services
export const OPTIONS = async () => {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    },
  });
};
