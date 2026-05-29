import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { setRealtimePresence } from "../lib/realtime";

/**
 * Maps the current route to a short activity label so the admin panel can see
 * what every connected client is doing — including idle/home clients and
 * single-player games (pips/shikaku) that aren't attached to a game row.
 */
export function activityFromPath(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/pips")) return "pips";
  if (pathname.startsWith("/shikaku")) return "shikaku";
  if (pathname.startsWith("/imposter")) return "imposter";
  if (pathname.startsWith("/password")) return "password";
  if (pathname.startsWith("/chain")) return "chain_reaction";
  if (pathname.startsWith("/shade")) return "shade_signal";
  if (pathname.startsWith("/location")) return "location_signal";
  return "browsing";
}

/**
 * Global presence. Mounted once at the app shell. Presence is carried by the
 * realtime WebSocket connection itself — there is NO HTTP polling. We only push
 * an activity update when the route changes; simply holding the socket open is
 * what marks the client online.
 *
 * This is fire-and-forget: the realtime client reconnects with backoff on its
 * own and never throws. If the API/WS is offline, single-player games (pips /
 * shikaku) stay fully playable — presence just silently can't connect.
 */
export function usePresence(sessionId: string) {
  const { pathname } = useLocation();
  const activity = activityFromPath(pathname);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    setRealtimePresence(activity);
  }, [sessionId, activity]);
}
