import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter, sessions } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import { setGameExpiration, updatePlayerGameStats } from "../../../../../lib/game-statistics";

// Heartbeat timeout in milliseconds (45 seconds - increased for better reliability)
const HEARTBEAT_TIMEOUT = 45000;
// Grace period for initial heartbeats (90 seconds)
const INITIAL_HEARTBEAT_GRACE_PERIOD = 90000;
// Number of consecutive missed heartbeats to consider a player disconnected
const MISSED_HEARTBEATS_THRESHOLD = 300;
// Maximum time allowed for inactive (unfocused window) state before considered disconnected
const INACTIVE_TIMEOUT = 1200000; // 20 minutes (increased from 10 minutes to further reduce false alarms)

// TEMPORARILY DISABLED FOR DEBUGGING
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({ success: false, message: "Heartbeat temporarily disabled for debugging." });
}
