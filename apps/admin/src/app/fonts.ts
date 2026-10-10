import { IBM_Plex_Mono } from "next/font/google";

// Self-hosted by next/font at build time. Shared by both root layouts;
// globals.css picks it up through --font-plex-mono.
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
});
