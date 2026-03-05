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

export function ConnectionDebugPanel() {
  const [state, setState] = useState<ConnectionDebugState>(() => ({ ...getConnectionDebugState() }));
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeConnectionDebug(() => {
      setState({ ...getConnectionDebugState() });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!import.meta.env.PROD) {
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
            {state.presenceReason ? (
              <div className="rounded bg-slate-900 p-1 text-[10px] text-amber-200">{state.presenceReason}</div>
            ) : null}
            <div className="truncate text-[10px] text-slate-400">Zero URL: {state.zeroCacheURL || "(unset)"}</div>
            <div className="truncate text-[10px] text-slate-400">Presence URL: {state.presenceURL || "(unset)"}</div>
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
