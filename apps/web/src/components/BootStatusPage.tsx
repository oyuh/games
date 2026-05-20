import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { FiActivity, FiDatabase, FiExternalLink, FiGrid, FiMail, FiRefreshCw, FiServer, FiShield, FiZap } from "react-icons/fi";
import "../styles/boot-status.css";

type ServiceState = "idle" | "checking" | "ok" | "warn" | "error";

type ServiceProbe = {
  state: ServiceState;
  label: string;
  detail: string;
  checkedAt?: string;
  latencyMs?: number;
};

type ApiBuildInfo = {
  platform?: string;
  commitSha?: string;
  commitRef?: string;
  commitMessage?: string;
  buildTimestamp?: string;
  startedAt?: string;
  uptimeMs?: number;
};

type ApiMetadataPayload = ApiBuildInfo & {
  database?: {
    state?: "ok" | "unknown" | "offline";
    reason?: string;
    checkedAt?: string;
  };
};

const API_PROBE_INTERVAL_MS = 10_000;
const API_PROBE_TIMEOUT_MS = 4_500;

function stringifyError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request timed out";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatDurationMs(value: number | undefined) {
  if (typeof value !== "number") {
    return "";
  }

  const totalSeconds = Math.floor(value / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function serviceTone(state: ServiceState) {
  if (state === "ok") {
    return "ok";
  }
  if (state === "error") {
    return "error";
  }
  if (state === "warn") {
    return "warn";
  }
  if (state === "checking") {
    return "checking";
  }
  return "idle";
}

function StatusDot({ state }: { state: ServiceState }) {
  return <span className={`boot-status-dot boot-status-dot--${serviceTone(state)}`} aria-hidden="true" />;
}

function StatusCard({
  icon,
  name,
  probe,
  meta
}: {
  icon: ReactNode;
  name: string;
  probe: ServiceProbe;
  meta?: ReactNode;
}) {
  return (
    <article className={`boot-status-card boot-status-card--${serviceTone(probe.state)}`}>
      <div className="boot-status-card-header">
        <span className="boot-status-card-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="boot-status-card-title">
          <span>{name}</span>
          <span className={`boot-status-badge boot-status-badge--${serviceTone(probe.state)}`}>
            <StatusDot state={probe.state} />
            {probe.label}
          </span>
        </div>
      </div>
      <p className="boot-status-card-detail">{probe.detail}</p>
      {(probe.latencyMs != null || probe.checkedAt || meta) && (
        <div className="boot-status-card-meta">
          {probe.latencyMs != null && <span>{probe.latencyMs}ms</span>}
          {probe.checkedAt && <span>Checked {formatDateTime(probe.checkedAt)}</span>}
          {meta}
        </div>
      )}
    </article>
  );
}

function useApiMetadataProbe(apiBase: string) {
  const [apiProbe, setApiProbe] = useState<ServiceProbe>(() => ({
    state: "checking",
    label: "Checking",
    detail: "Pinging API metadata."
  }));
  const [databaseProbe, setDatabaseProbe] = useState<ServiceProbe>(() => ({
    state: "idle",
    label: "Waiting",
    detail: "Database status comes from the API metadata probe."
  }));
  const [buildInfo, setBuildInfo] = useState<ApiBuildInfo>({});

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      const checkedAt = new Date().toISOString();
      const started = performance.now();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), API_PROBE_TIMEOUT_MS);

      setApiProbe((current) => ({
        ...current,
        state: "checking",
        label: "Checking",
        detail: "Pinging API metadata."
      }));

      try {
        const response = await fetch(`${apiBase}/debug/build-info`, {
          cache: "no-store",
          signal: controller.signal
        });
        const latencyMs = Math.round(performance.now() - started);

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const payload = (await response.json()) as ApiMetadataPayload;

        if (cancelled) {
          return;
        }

        const nextBuildInfo: ApiBuildInfo = {};
        if (payload.platform) nextBuildInfo.platform = payload.platform;
        if (payload.commitSha) nextBuildInfo.commitSha = payload.commitSha;
        if (payload.commitRef) nextBuildInfo.commitRef = payload.commitRef;
        if (payload.commitMessage) nextBuildInfo.commitMessage = payload.commitMessage;
        if (payload.buildTimestamp) nextBuildInfo.buildTimestamp = payload.buildTimestamp;
        if (payload.startedAt) nextBuildInfo.startedAt = payload.startedAt;
        if (typeof payload.uptimeMs === "number") nextBuildInfo.uptimeMs = payload.uptimeMs;
        setBuildInfo(nextBuildInfo);

        setApiProbe({
          state: "ok",
          label: "Online",
          detail: payload.platform ? `Responding from ${payload.platform}.` : "API metadata responded.",
          checkedAt,
          latencyMs
        });

        const databaseState = payload.database?.state ?? "unknown";
        const databaseReason = payload.database?.reason?.trim();
        setDatabaseProbe({
          state: databaseState === "ok" ? "ok" : databaseState === "offline" ? "error" : "warn",
          label: databaseState === "ok" ? "Connected" : databaseState === "offline" ? "Offline" : "Unknown",
          detail: databaseReason || (databaseState === "ok" ? "Database heartbeat is healthy." : "API could not confirm database health."),
          checkedAt: payload.database?.checkedAt ?? checkedAt
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const latencyMs = Math.round(performance.now() - started);
        const reason = stringifyError(error);

        setApiProbe({
          state: "error",
          label: "Offline",
          detail: reason,
          checkedAt,
          latencyMs
        });
        setDatabaseProbe({
          state: "warn",
          label: "Not checked",
          detail: "Database status is unavailable while the API is unreachable.",
          checkedAt
        });
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void probe();
    const interval = window.setInterval(() => {
      void probe();
    }, API_PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [apiBase]);

  return { apiProbe, databaseProbe, buildInfo };
}

export function BootStatusPage({
  apiBase,
  zeroCacheURL,
  sessionId,
  message,
  onRetry
}: {
  apiBase: string;
  zeroCacheURL: string;
  sessionId: string;
  message?: string | undefined;
  onRetry: () => void;
}) {
  useLayoutEffect(() => {
    const previousCursorMode = document.documentElement.getAttribute("data-custom-cursor");
    document.documentElement.setAttribute("data-custom-cursor", "off");

    return () => {
      if (previousCursorMode === null) {
        document.documentElement.removeAttribute("data-custom-cursor");
      } else {
        document.documentElement.setAttribute("data-custom-cursor", previousCursorMode);
      }
    };
  }, []);

  const { apiProbe, databaseProbe, buildInfo } = useApiMetadataProbe(apiBase);
  const statusPageUrl = (import.meta.env.VITE_STATUS_PAGE_URL as string | undefined)?.trim();
  const apiInfoUrl = useMemo(() => `${apiBase}/debug/build-info`, [apiBase]);
  const commitShort = buildInfo.commitSha?.slice(0, 7);
  const uptime = formatDurationMs(buildInfo.uptimeMs);

  const websiteProbe: ServiceProbe = {
    state: "ok",
    label: "Loaded",
    detail: "The web app is running in your browser."
  };

  const sessionProbe: ServiceProbe = {
    state: "error",
    label: "Blocked",
    detail: message || "The API is unreachable, so your session cannot be verified yet."
  };

  const syncProbe: ServiceProbe = {
    state: "warn",
    label: "Paused",
    detail: "Multiplayer sync resumes after the API is reachable again."
  };

  const soloProbe: ServiceProbe = {
    state: "ok",
    label: "Available",
    detail: "Shikaku and Pips do not need the multiplayer API to open."
  };

  return (
    <main className="boot-status-page">
      <section className="boot-status-shell" aria-labelledby="boot-status-title">
        <div className="boot-status-hero">
          <div>
            <div className="boot-status-kicker">
              <FiActivity size={14} />
              Service status
            </div>
            <h1 id="boot-status-title">
              Something's wrong!!
            </h1>
            <p>
              The API is not reachable right now, so multiplayer cannot verify your session. Solo games can still open
              while the server comes back.
            </p>
          </div>
          <a className="boot-status-overall boot-status-overall--contact" href="mailto:me@lawsonhart.me">
            <FiMail size={14} />
            <span>Keep in touch!</span>
          </a>
        </div>

        <div className="boot-status-grid">
          <StatusCard icon={<FiActivity size={19} />} name="Website" probe={websiteProbe} />
          <StatusCard icon={<FiServer size={19} />} name="API" probe={apiProbe} />
          <StatusCard icon={<FiDatabase size={19} />} name="Database" probe={databaseProbe} />
          <StatusCard icon={<FiShield size={19} />} name="Session" probe={sessionProbe} />
          <StatusCard icon={<FiZap size={19} />} name="Multiplayer Sync" probe={syncProbe} />
          <StatusCard icon={<FiGrid size={19} />} name="Solo Games" probe={soloProbe} />
        </div>

        <div className="boot-status-details">
          <div className="boot-status-endpoints">
            <div>
              <span>API</span>
              <code>{apiBase}</code>
            </div>
            <div>
              <span>Sync cache</span>
              <code>{zeroCacheURL}</code>
            </div>
            <div>
              <span>Session</span>
              <code>{sessionId}</code>
            </div>
          </div>

          {(commitShort || buildInfo.commitRef || buildInfo.commitMessage || buildInfo.startedAt || uptime) && (
            <div className="boot-status-build">
              {commitShort && <span>Commit {commitShort}</span>}
              {buildInfo.commitRef && <span>{buildInfo.commitRef}</span>}
              {uptime && <span>Uptime {uptime}</span>}
              {buildInfo.startedAt && <span>Started {formatDateTime(buildInfo.startedAt)}</span>}
              {buildInfo.commitMessage && <span className="boot-status-build-message">{buildInfo.commitMessage}</span>}
            </div>
          )}
        </div>

        <div className="boot-status-actions">
          <button className="boot-status-action boot-status-action--primary" type="button" onClick={onRetry}>
            <FiRefreshCw size={16} />
            Retry
          </button>
          <a className="boot-status-action" href="/shikaku">
            Shikaku
          </a>
          <a className="boot-status-action" href="/pips">
            Pips
          </a>
          <a className="boot-status-action" href={apiInfoUrl} target="_blank" rel="noreferrer">
            API details
            <FiExternalLink size={14} />
          </a>
          {statusPageUrl && (
            <a className="boot-status-action" href={statusPageUrl} target="_blank" rel="noreferrer">
              Host status
              <FiExternalLink size={14} />
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
