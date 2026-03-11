import { useEffect, useState } from "react";
import {
  getConnectionDebugState,
  subscribeConnectionDebug,
  type ConnectionDebugEvent,
  type ConnectionDebugState
} from "../../lib/connection-debug";

function levelClass(level: ConnectionDebugEvent["level"]) {
  if (level === "error") {
    return "text-rose-300";
  }
  if (level === "warn") {
    return "text-amber-300";
  }
  return "text-emerald-300";
}

function formatDateTime(value: string) {
  if (!value) {
    return "(unknown)";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatLatency(value: number | null) {
  if (typeof value !== "number") {
    return "(n/a)";
  }
  return `${value}ms`;
}

function formatDurationMs(value: number | null) {
  if (typeof value !== "number") {
    return "(n/a)";
  }

  const totalSeconds = Math.floor(value / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function shortCommit(sha: string) {
  if (!sha) {
    return "(unknown)";
  }
  return sha.slice(0, 12);
}

function apiStatusClass(state: ConnectionDebugState["apiMetaState"]) {
  if (state === "ok") {
    return "text-emerald-300";
  }
  if (state === "error") {
    return "text-rose-300";
  }
  if (state === "loading") {
    return "text-amber-300";
  }
  return "text-slate-300";
}

function dbStatusClass(state: ConnectionDebugState["dbState"]) {
  if (state === "ok") {
    return "text-emerald-300";
  }
  if (state === "unknown") {
    return "text-amber-300";
  }
  if (state === "offline") {
    return "text-rose-300";
  }
  if (state === "loading") {
    return "text-amber-300";
  }
  return "text-slate-300";
}

export function ConnectionDebugPanel() {
  const [state, setState] = useState<ConnectionDebugState>(() => ({ ...getConnectionDebugState() }));
  const [open, setOpen] = useState(true);
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("connection-debug") === "enabled"
  );

  useEffect(() => {
    const unsubscribe = subscribeConnectionDebug(() => {
      setState({ ...getConnectionDebugState() });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    (window as unknown as Record<string, unknown>)["connectionDebug"] = (action: unknown) => {
      if (action === "enable" || action === true) {
        localStorage.setItem("connection-debug", "enabled");
        setEnabled(true);
        console.log("Connection debug panel enabled.");
      } else if (action === "disable" || action === false) {
        localStorage.removeItem("connection-debug");
        setEnabled(false);
        console.log("Connection debug panel disabled.");
      } else {
        console.log("Usage: connectionDebug('enable') or connectionDebug('disable')");
      }
    };
    return () => {
      delete (window as unknown as Record<string, unknown>)["connectionDebug"];
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <section className="fixed bottom-3 right-3 z-50 max-w-sm rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-[var(--color-primary-400)]">Connection Debug</h2>
        <button
          type="button"
          className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open ? (
        <div className="space-y-2">
          <dl className="space-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Online</dt>
              <dd>{String(state.isOnline)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Zero</dt>
              <dd>{state.zeroState}</dd>
            </div>
            {state.zeroReason ? (
              <div className="rounded bg-slate-900 p-1 text-[10px] text-rose-300">{state.zeroReason}</div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Presence</dt>
              <dd>{state.presenceState}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Presence connect</dt>
              <dd>{formatLatency(state.presenceConnectLatencyMs)}</dd>
            </div>
            {state.presenceReason ? (
              <div className="rounded bg-slate-900 p-1 text-[10px] text-amber-200">{state.presenceReason}</div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API probe</dt>
              <dd className={apiStatusClass(state.apiMetaState)}>{state.apiMetaState}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API latency</dt>
              <dd>{formatLatency(state.apiLatencyMs)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Database</dt>
              <dd className={dbStatusClass(state.dbState)}>{state.dbState}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">DB checked</dt>
              <dd>{formatDateTime(state.dbCheckedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">DB key</dt>
              <dd>{state.dbKey || "(unknown)"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">DB expected</dt>
              <dd>{state.dbExpectedValue || "(unknown)"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">DB actual</dt>
              <dd>{state.dbActualValue || "(unknown)"}</dd>
            </div>
            {state.dbReason ? (
              <div className="rounded bg-slate-900 p-1 text-[10px] text-amber-200">{state.dbReason}</div>
            ) : null}
            {state.apiMetaReason ? (
              <div className="rounded bg-slate-900 p-1 text-[10px] text-rose-300">{state.apiMetaReason}</div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API commit</dt>
              <dd>{shortCommit(state.apiCommitSha)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API branch</dt>
              <dd className="truncate">{state.apiCommitRef || "(unknown)"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API platform</dt>
              <dd>{state.apiPlatform || "(unknown)"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API commit at</dt>
              <dd>{formatDateTime(state.apiCommitTimestamp)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API updated</dt>
              <dd>{formatDateTime(state.apiUpdatedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API built</dt>
              <dd>{formatDateTime(state.apiBuildTimestamp)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API started</dt>
              <dd>{formatDateTime(state.apiStartedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API uptime</dt>
              <dd>{formatDurationMs(state.apiUptimeMs)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">API checked</dt>
              <dd>{formatDateTime(state.apiMetaCheckedAt)}</dd>
            </div>
            {state.apiCommitMessage ? (
              <div className="rounded bg-slate-900 p-1 text-[10px] text-slate-300">{state.apiCommitMessage}</div>
            ) : null}
            <div className="truncate text-[10px] text-slate-400">API Info URL: {state.apiInfoURL || "(unset)"}</div>
            <div className="truncate text-[10px] text-slate-400">Zero URL: {state.zeroCacheURL || "(unset)"}</div>
            <div className="truncate text-[10px] text-slate-400">API URL: {state.apiBaseURL || "(unset)"}</div>
            <div className="truncate text-[10px] text-slate-400">Session: {state.sessionId || "(unset)"}</div>
          </dl>

          <div className="max-h-44 space-y-1 overflow-auto rounded border border-slate-800 bg-slate-900/70 p-2">
            {state.events.length === 0 ? (
              <p className="text-[10px] text-slate-400">No events captured yet.</p>
            ) : (
              state.events.map((event) => (
                <div key={event.id} className="text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{new Date(event.at).toLocaleTimeString()}</span>
                    <span className={levelClass(event.level)}>{event.level.toUpperCase()}</span>
                    <span className="text-slate-300">{event.source}</span>
                  </div>
                  <p className="text-slate-200">{event.message}</p>
                  {event.details ? <p className="break-words text-slate-400">{event.details}</p> : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
