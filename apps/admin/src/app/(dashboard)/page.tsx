"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Gamepad2,
  Globe2,
  Link2,
  Shield,
  Users,
} from "lucide-react";
import { api } from "@/lib/client-api";
import {
  ClientRecord,
  DashboardSummaryResponse,
  FooterStatus,
  formatGameType,
  formatRelativeTime,
  gameAccent,
  GameType,
  shortId,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { ClientDetailDialog } from "@/components/admin/client-detail-dialog";
import { GameStateDialog } from "@/components/admin/game-state-dialog";

/**
 * One number, its label, and a short factual sub-line. The sub-line used to be
 * a full sentence ("0 clients are seated in rooms, with 0 active players
 * generating the current session load"), which is slower to read than the two
 * numbers it contained.
 */
function StatTile({
  label,
  value,
  parts,
  icon: Icon,
  accent = "var(--primary)",
}: {
  label: string;
  value: string;
  parts: Array<{ label: string; value: string | number }>;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Surface
      tone="accent"
      accent={accent}
      pad="none"
      className="flex min-w-0 items-center gap-3 px-3.5 py-3"
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-md border"
        style={{
          borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          color: accent,
        }}
      >
        <Icon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.62rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl leading-none font-extrabold tabular-nums text-foreground">
            {value}
          </span>
          <span className="flex min-w-0 gap-2 truncate text-xs text-muted-foreground">
            {parts.map((part) => (
              <span key={part.label} className="whitespace-nowrap">
                <b className="font-semibold tabular-nums text-foreground/80">
                  {part.value}
                </b>{" "}
                {part.label}
              </span>
            ))}
          </span>
        </div>
      </div>
    </Surface>
  );
}

/**
 * A dashboard column: a fixed header and a body that scrolls on its own.
 *
 * min-h-0 on the Surface is what lets it shrink inside the grid instead of
 * growing the page; without it every overflow rule below is ignored.
 */
function Panel({
  title,
  meta,
  accent = "var(--primary)",
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface
      pad="none"
      accent={accent}
      className={`flex min-h-0 flex-col overflow-hidden ${className ?? ""}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="truncate text-[0.68rem] font-extrabold tracking-[0.12em] text-foreground uppercase">
          {title}
        </h2>
        {meta}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </Surface>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function syncStatusDraft(status: FooterStatus) {
  return {
    signature: JSON.stringify(status ?? null),
    text: status?.text ?? "",
    link: status?.link ?? "",
    color: status?.color ?? "",
    flash: status?.flash ?? false,
  };
}

function DashboardSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[4.25rem] bg-muted" />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="min-h-0 bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { show } = useToast();
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(
    null,
  );
  const [selectedGame, setSelectedGame] = useState<{
    id: string;
    type: GameType;
  } | null>(null);
  const [statusInput, setStatusInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [colorInput, setColorInput] = useState("");
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [statusSignature, setStatusSignature] = useState<string | null>(null);
  const [pendingStatusAction, setPendingStatusAction] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await api("/dashboard/summary");
        if (!cancelled) {
          setData(response as DashboardSummaryResponse);
        }
      } catch (error) {
        if (!cancelled) {
          show(
            error instanceof Error
              ? error.message
              : "Unable to load dashboard.",
            "error",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshKey, show]);

  useEffect(() => {
    const next = syncStatusDraft(data?.summary.footerStatus ?? null);
    if (next.signature !== statusSignature) {
      setStatusInput(next.text);
      setLinkInput(next.link);
      setColorInput(next.color);
      setFlashEnabled(next.flash);
      setStatusSignature(next.signature);
    }
  }, [data?.summary.footerStatus, statusSignature]);

  const currentStatus = data?.summary.footerStatus ?? null;

  const roomMix = useMemo(() => {
    if (!data) {
      return [] as Array<{ type: string; total: number }>;
    }

    return Object.entries(data.summary.games.byType)
      .map(([type, total]) => ({ type, total }))
      .sort((left, right) => right.total - left.total);
  }, [data]);

  const maxRoomMix = useMemo(() => {
    return Math.max(1, ...roomMix.map((entry) => entry.total));
  }, [roomMix]);

  const namedRatio = data
    ? Math.round(
        (data.summary.clients.named / Math.max(1, data.summary.clients.total)) *
          100,
      )
    : 0;

  const updateStatus = async () => {
    setPendingStatusAction("save");
    try {
      await api("/status", {
        method: "POST",
        body: {
          text: statusInput.trim() || null,
          link: linkInput.trim() || null,
          color: colorInput || null,
          flash: flashEnabled,
        },
      });
      show(
        statusInput.trim()
          ? "Footer status updated."
          : "Footer status cleared.",
        "success",
      );
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(
        error instanceof Error ? error.message : "Unable to update status.",
        "error",
      );
    } finally {
      setPendingStatusAction(null);
    }
  };

  const clearStatus = async () => {
    setPendingStatusAction("clear");
    try {
      await api("/status", { method: "DELETE" });
      show("Footer status cleared.", "success");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(
        error instanceof Error ? error.message : "Unable to clear status.",
        "error",
      );
    } finally {
      setPendingStatusAction(null);
    }
  };

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <Surface tone="dashed" className="m-auto max-w-sm text-center text-sm text-muted-foreground">
        Dashboard data is unavailable right now.
      </Surface>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Region 1: the four headline numbers. Fixed height, never scrolls. */}
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Connected"
          value={data.summary.clients.total.toLocaleString()}
          accent="var(--game-imposter)"
          icon={Users}
          parts={[
            { label: "in room", value: data.summary.clients.inGame },
            { label: "named", value: data.summary.clients.named },
          ]}
        />
        <StatTile
          label="Active rooms"
          value={data.summary.games.total.toLocaleString()}
          accent="var(--game-password)"
          icon={Gamepad2}
          parts={[
            { label: "players", value: data.summary.games.activePlayers },
            { label: "watching", value: data.summary.games.activeSpectators },
          ]}
        />
        <StatTile
          label="Named share"
          value={`${namedRatio}%`}
          accent="var(--game-chain)"
          icon={Activity}
          parts={[{ label: "anonymous", value: data.summary.clients.anonymous }]}
        />
        <StatTile
          label="Bans"
          value={data.summary.moderation.totalBans.toLocaleString()}
          accent="var(--danger)"
          icon={Shield}
          parts={[
            { label: "name rules", value: data.summary.moderation.restrictedNames },
            { label: "overrides", value: data.summary.moderation.nameOverrides },
          ]}
        />
      </div>

      {/* Region 2: four columns that fill the rest of the viewport. Each one
          scrolls inside itself, so the page never grows. */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        <Panel
          title="Live sessions"
          accent="var(--game-imposter)"
          meta={
            <Badge variant="muted" className="tabular-nums">
              {data.recentClients.length}
            </Badge>
          }
        >
          {data.recentClients.length === 0 ? (
            <EmptyNote>Nobody connected.</EmptyNote>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.recentClients.map((client) => (
                <li
                  key={
                    client.sessionId ?? client.fingerprint ?? String(client.lastSeen)
                  }
                >
                  <button
                    type="button"
                    onClick={() => setSelectedClient(client)}
                    className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          client.online ? "bg-[var(--ok)]" : "bg-[var(--warn)]"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {client.name || "Anonymous"}
                      </span>
                      <span className="shrink-0 text-[0.68rem] text-muted-foreground tabular-nums">
                        {formatRelativeTime(client.lastSeen)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[0.68rem] text-muted-foreground">
                      <span className="truncate font-mono">
                        {shortId(client.sessionId, 14)}
                      </span>
                      {client.region ? (
                        <span className="ml-auto flex shrink-0 items-center gap-1">
                          <Globe2 className="size-3" />
                          {client.region}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Rooms"
          accent="var(--game-password)"
          meta={
            <Badge variant="muted" className="tabular-nums">
              {data.summary.games.total} live
            </Badge>
          }
        >
          <div className="flex flex-col gap-1">
            {roomMix.map((entry) => (
              <div key={entry.type} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[0.7rem] text-muted-foreground">
                  {formatGameType(entry.type)}
                </span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-[var(--game-password)] transition-[width]"
                    style={{ width: `${(entry.total / maxRoomMix) * 100}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                  {entry.total}
                </span>
              </div>
            ))}
          </div>

          {data.recentGames.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
              {data.recentGames.map((game) => (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedGame({ id: game.id, type: game.type })}
                    className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-foreground">
                        {game.code}
                      </span>
                      <Badge
                        variant="accent"
                        accent={gameAccent(game.type)}
                        className="h-5 shrink-0 text-[0.6rem]"
                      >
                        {game.phase}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[0.68rem] text-muted-foreground tabular-nums">
                      <span>{game.playerCount}p</span>
                      <span>{game.spectatorCount} watching</span>
                      <span>{game.roundCount} rounds</span>
                      <span className="ml-auto">
                        {formatRelativeTime(game.updatedAt)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 border-t border-border pt-3">
              <EmptyNote>No active rooms.</EmptyNote>
            </div>
          )}
        </Panel>

        <Panel
          title="Moderation"
          accent="var(--danger)"
          meta={
            <Badge variant={data.summary.moderation.totalBans > 0 ? "danger" : "muted"}>
              {data.summary.moderation.totalBans} active
            </Badge>
          }
        >
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "Session", value: data.summary.moderation.sessionBans },
              { label: "IP", value: data.summary.moderation.ipBans },
              { label: "Region", value: data.summary.moderation.regionBans },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-border bg-card px-2 py-1.5 text-center"
              >
                <div className="text-[0.58rem] font-bold tracking-wider text-muted-foreground uppercase">
                  {item.label}
                </div>
                <div className="text-lg leading-tight font-extrabold tabular-nums text-foreground">
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[0.6rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Recent bans
          </div>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {data.recentBans.length === 0 ? (
              <EmptyNote>No active bans.</EmptyNote>
            ) : (
              data.recentBans.map((ban) => (
                <li
                  key={ban.id}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="danger" className="h-4 shrink-0 text-[0.55rem]">
                      {ban.type}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                      {ban.value}
                    </span>
                    <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                      {formatRelativeTime(ban.createdAt)}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="mt-3 text-[0.6rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Restricted names
          </div>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {data.nameRules.length === 0 ? (
              <EmptyNote>No name rules.</EmptyNote>
            ) : (
              data.nameRules.map((rule) => (
                <li
                  key={rule.id}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <div className="truncate font-mono text-xs font-semibold text-foreground">
                    {rule.pattern}
                  </div>
                  <div className="truncate text-[0.65rem] text-muted-foreground">
                    {rule.reason || "No reason given"}
                  </div>
                </li>
              ))
            )}
          </ul>
        </Panel>

        <Panel
          title="Footer message"
          accent="var(--game-location)"
          meta={
            currentStatus ? (
              <Badge variant="success">Live</Badge>
            ) : (
              <Badge variant="muted">Default</Badge>
            )
          }
        >
          <div className="rounded-md border border-border bg-card px-2.5 py-2 text-xs">
            {currentStatus ? (
              <>
                <div
                  className="font-medium text-foreground"
                  style={currentStatus.color ? { color: currentStatus.color } : undefined}
                >
                  {currentStatus.text}
                </div>
                {currentStatus.link ? (
                  <a
                    href={currentStatus.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1 truncate text-muted-foreground underline underline-offset-2"
                  >
                    <Link2 className="size-3 shrink-0" />
                    <span className="truncate">{currentStatus.link}</span>
                  </a>
                ) : null}
                {currentStatus.flash ? (
                  <Badge variant="warn" className="mt-1.5 h-4 text-[0.55rem]">
                    Flashing
                  </Badge>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">
                Nothing shown in the site footer.
              </span>
            )}
          </div>

          <Textarea
            value={statusInput}
            onChange={(event) => setStatusInput(event.target.value)}
            placeholder="Short footer message"
            maxLength={200}
            className="mt-2 min-h-16 resize-none text-sm"
          />

          <Input
            value={linkInput}
            onChange={(event) => setLinkInput(event.target.value)}
            placeholder="Optional https:// link"
            maxLength={500}
            className="mt-2 h-8 text-sm"
          />

          <div className="mt-2 flex items-center gap-2">
            <label className="flex h-8 flex-1 items-center gap-2 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground">
              Accent
              <input
                type="color"
                value={colorInput || "#7ecbff"}
                onChange={(event) => setColorInput(event.target.value)}
                className="ml-auto size-5 cursor-pointer rounded border border-border bg-transparent p-0"
              />
            </label>
            <div className="flex h-8 flex-1 items-center gap-2 rounded-md border border-border bg-card px-2">
              <Checkbox
                id="status-flash"
                checked={flashEnabled}
                onCheckedChange={(checked) => setFlashEnabled(checked === true)}
              />
              <Label
                htmlFor="status-flash"
                className="cursor-pointer text-xs font-medium tracking-normal text-muted-foreground normal-case"
              >
                Flash
              </Label>
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={pendingStatusAction !== null}
              onClick={() => void updateStatus()}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pendingStatusAction !== null || !currentStatus}
              onClick={() => void clearStatus()}
            >
              Clear
            </Button>
          </div>
        </Panel>
      </div>

      <ClientDetailDialog
        client={selectedClient}
        open={Boolean(selectedClient)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedClient(null);
          }
        }}
        onViewGame={(target) => setSelectedGame(target)}
        onChanged={() => setRefreshKey((value) => value + 1)}
      />
      <GameStateDialog
        target={selectedGame}
        open={Boolean(selectedGame)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedGame(null);
          }
        }}
        onChanged={() => setRefreshKey((value) => value + 1)}
      />
    </div>
  );
}
