-- Add session tracking columns for IP, user agent, region, and fingerprint
ALTER TABLE "sessions" ADD COLUMN "ip" text;
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;
ALTER TABLE "sessions" ADD COLUMN "region" text;
ALTER TABLE "sessions" ADD COLUMN "fingerprint" text;
