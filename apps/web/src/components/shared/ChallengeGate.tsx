/**
 * The "prove you're a person" popup. Shows while the API has this session in
 * limbo and can't be closed; passing Cloudflare Turnstile, or the API deciding
 * on a re-check that the session has cooled off, is the only way out.
 *
 * Nothing underneath is paused or unmounted. The game keeps syncing, so the
 * player lands back on its current state, and any score submit that was
 * refused is waiting in fetchWithChallenge to go out again.
 */
import { useEffect, useRef, useState } from "react";
import { FiRefreshCw, FiShield } from "react-icons/fi";
import {
  refreshChallengeStatus,
  setChallengeRequired,
  submitChallengeToken,
  turnstileSiteKey,
  useChallengeRequired,
} from "../../lib/challenge";
import { buildRealtimeUserTopic, subscribeToRealtimeEvent } from "../../lib/realtime";
import { getOrCreateSessionId } from "../../lib/session";
import { ModalShell } from "./ModalShell";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Loaded on first need, never at boot: almost nobody ever sees this popup.
// Cloudflare requires the script from this exact URL, not bundled or proxied.
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
  turnstileLoad ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")));
    script.onerror = () => {
      // A blocker or a flaky network. Forget the attempt so the next popup retries.
      script.remove();
      turnstileLoad = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return turnstileLoad;
}

const RECHECK_COOLDOWN_MS = 5_000;

export function ChallengeGate() {
  const required = useChallengeRequired();

  // The API pushes limbo on and off over the socket, including right when a
  // tab connects, so there is nothing to poll at boot.
  useEffect(() => {
    const topic = buildRealtimeUserTopic(getOrCreateSessionId());
    return subscribeToRealtimeEvent<{ required: boolean }>(topic, "bot:challenge", (payload) => {
      setChallengeRequired(payload.required === true);
    });
  }, []);

  return required ? <ChallengeModal /> : null;
}

type Phase = "loading" | "ready" | "verifying" | "failed" | "unavailable";

function ChallengeModal() {
  const siteKey = turnstileSiteKey();
  const box = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(siteKey ? "loading" : "unavailable");
  const [note, setNote] = useState<string | null>(null);
  const [recheckBlocked, setRecheckBlocked] = useState(false);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    let api: TurnstileApi | null = null;
    let widgetId: string | null = null;

    const reset = () => {
      if (api && widgetId) api.reset(widgetId);
    };
    retry.current = () => {
      setNote(null);
      setPhase("ready");
      reset();
    };

    const verify = async (token: string) => {
      setPhase("verifying");
      try {
        const result = await submitChallengeToken(token);
        // On success the flag clears and this modal unmounts.
        if (result.ok) return;
        setNote(result.errors?.includes("timeout-or-duplicate")
          ? "That check expired. Give it another go."
          : "That didn't go through. Give it another go.");
      } catch {
        setNote("Couldn't reach the server. Try again in a moment.");
      }
      if (!cancelled) setPhase("failed");
    };

    loadTurnstile().then(
      (loaded) => {
        if (cancelled || !box.current) return;
        api = loaded;
        widgetId = loaded.render(box.current, {
          sitekey: siteKey,
          action: "limbo",
          // Stays invisible unless Cloudflare needs a click, so the usual
          // case is our own "Checking…" line and nothing of theirs.
          appearance: "interaction-only",
          size: "flexible",
          theme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
          callback: (token: string) => void verify(token),
          "error-callback": () => {
            setNote("The check hit a snag on Cloudflare's side.");
            setPhase("failed");
          },
          // Tokens only live five minutes; a player who wandered off gets a fresh one.
          "expired-callback": reset,
        });
        setPhase("ready");
      },
      () => {
        if (!cancelled) setPhase("unavailable");
      },
    );

    return () => {
      cancelled = true;
      if (api && widgetId) api.remove(widgetId);
    };
  }, [siteKey]);

  const recheck = async () => {
    setRecheckBlocked(true);
    window.setTimeout(() => setRecheckBlocked(false), RECHECK_COOLDOWN_MS);
    try {
      const status = await refreshChallengeStatus();
      if (status.limbo) setNote("Still flagged. Finish the check, or give it a couple of quiet minutes.");
    } catch {
      setNote("Couldn't reach the server. Try again in a moment.");
    }
  };

  return (
    <ModalShell
      className="challenge"
      icon={<FiShield size={20} />}
      title="Prove you're a person"
      footer={(
        <>
          <p className="challenge-note" role="status" aria-live="polite">
            {phase === "verifying" || phase === "loading" ? "Checking…" : note}
          </p>
          <div className="challenge-actions">
            <button className="btn btn-muted" type="button" disabled={recheckBlocked} onClick={() => void recheck()}>
              <FiRefreshCw size={14} /> Check again
            </button>
            {phase === "failed" && (
              <button className="btn btn-primary" type="button" onClick={() => retry.current()}>
                Try again
              </button>
            )}
          </div>
        </>
      )}
    >
      <p className="challenge-lede">
        A lot happened from this tab in a short time. Finish the check and you're back in.
        Your game keeps going while this is open.
      </p>
      {phase === "unavailable" && (
        <p className="challenge-lede">
          The check couldn't load here. It clears on its own after a couple of quiet minutes.
        </p>
      )}
      {/* Empty unless Cloudflare wants a click; most people never see it. */}
      <div ref={box} className="challenge-widget" />
    </ModalShell>
  );
}
