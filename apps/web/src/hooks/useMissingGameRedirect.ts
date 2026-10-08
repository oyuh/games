import type { ResultType } from "@rocicorp/zero";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { showDedupedToast } from "../lib/toast";

/**
 * A game link that points at nothing: say so in a toast and go home. Waits on
 * the sync server to confirm the game is gone, so a slow cold start keeps the
 * loader up instead of bouncing someone out of a game that does exist.
 */
export function useMissingGameRedirect(found: boolean, result: ResultType) {
  const navigate = useNavigate();

  useEffect(() => {
    if (found || result === "unknown") return;
    showDedupedToast("Couldn't find that game", "info");
    navigate("/", { replace: true });
  }, [found, result, navigate]);
}
