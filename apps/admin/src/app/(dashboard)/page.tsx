"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Ban,
  Gamepad2,
  Globe2,
  Link2,
  Shield,
  Users,
  Waves,
} from "lucide-react";
import { api } from "@/lib/client-api";
import {
  ClientRecord,
  DashboardSummaryResponse,
  FooterStatus,
  formatGameType,
  formatRelativeTime,
  GameType,
  shortId,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ClientDetailDialog } from "@/components/admin/client-detail-dialog";
import { GameStateDialog } from "@/components/admin/game-state-dialog";

function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-card p-5 ${className}`}
    >
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Surface className="bg-muted/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            {label}
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-normal text-foreground">
            {value}
          </div>
        </div>
        <div className="flex size-11 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{hint}</div>
    </Surface>
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
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Surface key={index} className="bg-muted/40 p-4">
            <Skeleton className="h-4 w-28 bg-muted" />
            <Skeleton className="mt-4 h-10 w-24 bg-muted" />
            <Skeleton className="mt-4 h-4 w-full bg-muted" />
            <Skeleton className="mt-2 h-4 w-3/4 bg-muted" />
          </Surface>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Surface className="overflow-hidden">
          <Skeleton className="h-5 w-40 bg-muted" />
          <Skeleton className="mt-3 h-8 w-72 bg-muted" />
          <Skeleton className="mt-3 h-4 w-full bg-muted" />
          <Skeleton className="mt-2 h-4 w-3/4 bg-muted" />
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
            <Skeleton className="h-85 bg-muted" />
            <div className="grid gap-4">
              <Skeleton className="h-40 bg-muted" />
              <Skeleton className="h-40 bg-muted" />
            </div>
          </div>
        </Surface>

        <div className="grid gap-4">
          <Skeleton className="h-55 bg-muted" />
          <Skeleton className="h-55 bg-muted" />
        </div>
      </div>
    </>
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
      <Surface className="border-dashed bg-transparent px-5 py-16 text-center text-sm text-muted-foreground">
        Dashboard data is unavailable right now.
      </Surface>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Connected Clients"
          value={data.summary.clients.total.toLocaleString()}
          hint={`${data.summary.clients.inGame.toLocaleString()} currently attached to a live room`}
          icon={Users}
        />
        <StatCard
          label="Active Rooms"
          value={data.summary.games.total.toLocaleString()}
          hint={`${data.summary.games.activePlayers.toLocaleString()} players and ${data.summary.games.activeSpectators.toLocaleString()} spectators live`}
          icon={Gamepad2}
        />
        <StatCard
          label="Named Sessions"
          value={`${namedRatio}%`}
          hint={`${data.summary.clients.named.toLocaleString()} named and ${data.summary.clients.anonymous.toLocaleString()} anonymous`}
          icon={Activity}
        />
        <StatCard
          label="Moderation Load"
          value={data.summary.moderation.totalBans.toLocaleString()}
          hint={`${data.summary.moderation.restrictedNames.toLocaleString()} name rules and ${data.summary.moderation.nameOverrides.toLocaleString()} overrides active`}
          icon={Shield}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Surface className="overflow-hidden">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                Activity Snapshot
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                Live traffic and room distribution
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                The overview below keeps the busiest metrics above the fold: who
                is connected, where they are, and which game types are carrying
                traffic.
              </p>
            </div>
            <Badge
              variant="outline"
              className="w-fit border-border bg-card text-foreground"
            >
              Auto-refresh 8s
            </Badge>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="rounded-lg border border-border bg-muted/40 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                Population
              </div>
              <div className="mt-3 text-5xl font-semibold tracking-normal text-foreground">
                {data.summary.clients.total.toLocaleString()}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {data.summary.clients.inGame.toLocaleString()} clients are
                seated in rooms, with{" "}
                {data.summary.games.activePlayers.toLocaleString()} active
                players generating the current session load.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Players", value: data.summary.games.activePlayers },
                  {
                    label: "Spectators",
                    value: data.summary.games.activeSpectators,
                  },
                  { label: "Named", value: data.summary.clients.named },
                  { label: "Anonymous", value: data.summary.clients.anonymous },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
                      {item.label}
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                      {item.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-lg border border-border bg-muted/40 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                      Room Mix
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Current room volume by game type
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-border bg-card text-foreground"
                  >
                    {data.summary.games.total} live
                  </Badge>
                </div>

                <div className="mt-4 space-y-3">
                  {roomMix.map((entry) => (
                    <div key={entry.type}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                        <span>{formatGameType(entry.type)}</span>
                        <span className="text-muted-foreground">
                          {entry.total}
                        </span>
                      </div>
                      <div className="h-2 rounded-lg bg-muted">
                        <div
                          className="h-2 rounded-lg bg-foreground"
                          style={{
                            width: `${(entry.total / maxRoomMix) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Regional Spread
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {data.summary.clients.topRegions.slice(0, 6).map((entry) => (
                    <div
                      key={entry.region}
                      className="rounded-lg border border-border bg-card px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Globe2 className="size-4 text-muted-foreground" />
                          {entry.region}
                        </div>
                        <div className="text-sm font-medium text-foreground">
                          {entry.total}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Surface>

        <div className="grid gap-4">
          <Surface className="bg-muted/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Site Message
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
                  Footer status control
                </h2>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                <Waves className="size-4.5" />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              {currentStatus ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border border-[#36559a] bg-muted text-foreground">
                      Live
                    </Badge>
                    {currentStatus.flash ? (
                      <Badge
                        variant="outline"
                        className="border-border bg-card text-foreground"
                      >
                        Flashing
                      </Badge>
                    ) : null}
                  </div>
                  <div
                    className="mt-3 font-medium text-foreground"
                    style={
                      currentStatus.color
                        ? { color: currentStatus.color }
                        : undefined
                    }
                  >
                    {currentStatus.text}
                  </div>
                  {currentStatus.link ? (
                    <a
                      href={currentStatus.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-muted-foreground underline underline-offset-4"
                    >
                      <Link2 className="size-4" />
                      {currentStatus.link}
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  <Badge
                    variant="outline"
                    className="border-border bg-card text-foreground"
                  >
                    Default
                  </Badge>
                  <div className="mt-3 text-muted-foreground">
                    No custom footer status is active.
                  </div>
                </>
              )}
            </div>

            <Textarea
              value={statusInput}
              onChange={(event) => setStatusInput(event.target.value)}
              placeholder="Short footer status message"
              maxLength={200}
              className="mt-4 min-h-24 border-border bg-card text-foreground"
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                value={linkInput}
                onChange={(event) => setLinkInput(event.target.value)}
                placeholder="Optional https:// link"
                maxLength={500}
                className="border-border bg-card text-foreground"
              />

              <div className="flex gap-3">
                <label className="flex items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-foreground">
                  <span>Accent</span>
                  <input
                    type="color"
                    value={colorInput || "#4f7cff"}
                    onChange={(event) => setColorInput(event.target.value)}
                    className="size-8 rounded-lg border border-border bg-transparent p-0"
                  />
                </label>

                <label className="flex items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={flashEnabled}
                    onChange={(event) => setFlashEnabled(event.target.checked)}
                    className="size-4 rounded border-border bg-transparent"
                  />
                  Flash
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={pendingStatusAction !== null}
                onClick={() => void updateStatus()}
              >
                Save status
              </Button>
              <Button
                variant="outline"
                className="border-border bg-card text-foreground hover:bg-accent"
                disabled={pendingStatusAction !== null}
                onClick={() => void clearStatus()}
              >
                Clear
              </Button>
            </div>
          </Surface>

          <Surface className="bg-muted/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Moderation Health
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
                  Current enforcement pressure
                </h2>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                <Ban className="size-4.5" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: "Session",
                  value: data.summary.moderation.sessionBans,
                },
                { label: "IP", value: data.summary.moderation.ipBans },
                { label: "Region", value: data.summary.moderation.regionBans },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Recent Bans
                </div>
                <div className="mt-3 space-y-2.5">
                  {data.recentBans.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                      No active bans.
                    </div>
                  ) : (
                    data.recentBans.slice(0, 3).map((ban) => (
                      <div
                        key={ban.id}
                        className="rounded-lg border border-border bg-card px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="font-medium text-foreground">
                            {ban.type.toUpperCase()}
                          </div>
                          <div className="text-muted-foreground">
                            {formatRelativeTime(ban.createdAt)}
                          </div>
                        </div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">
                          {ban.value}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Restricted Names
                </div>
                <div className="mt-3 space-y-2.5">
                  {data.nameRules.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                      No restricted names configured.
                    </div>
                  ) : (
                    data.nameRules.slice(0, 3).map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-lg border border-border bg-card px-4 py-3"
                      >
                        <div className="font-medium text-foreground">
                          {rule.pattern}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {rule.reason || "No reason provided"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Surface>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
        <Surface>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                Recent Clients
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
                Newest visible sessions
              </h2>
            </div>
            <Badge
              variant="outline"
              className="border-border bg-card text-foreground"
            >
              {data.summary.clients.inGame} in-game
            </Badge>
          </div>

          <div className="mt-4 space-y-3">
            {data.recentClients.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                No recent clients are visible right now.
              </div>
            ) : (
              data.recentClients.map((client) => (
                <div
                  key={
                    client.sessionId ??
                    client.fingerprint ??
                    String(client.lastSeen)
                  }
                  className="rounded-lg border border-border bg-muted/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => setSelectedClient(client)}
                    >
                      <div className="font-medium text-foreground">
                        {client.name || "Anonymous"}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {shortId(client.sessionId, 16)}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        Seen {formatRelativeTime(client.lastSeen)}
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {client.region ? (
                        <Badge
                          variant="outline"
                          className="border-border bg-card text-foreground"
                        >
                          <Globe2 className="size-3.5" />
                          {client.region}
                        </Badge>
                      ) : null}
                      {client.gameId && client.gameType ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-border bg-card text-foreground hover:bg-accent"
                          onClick={() =>
                            setSelectedGame({
                              id: client.gameId!,
                              type: client.gameType!,
                            })
                          }
                        >
                          <Activity className="size-4" />
                          {formatGameType(client.gameType)}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Surface>

        <Surface>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                Hot Rooms
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
                Most recently touched games
              </h2>
            </div>
            <Badge
              variant="outline"
              className="border-border bg-card text-foreground"
            >
              {data.summary.games.activePlayers} players
            </Badge>
          </div>

          <div className="mt-4 space-y-3">
            {data.recentGames.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                No active games right now.
              </div>
            ) : (
              data.recentGames.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() =>
                    setSelectedGame({ id: game.id, type: game.type })
                  }
                  className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 p-4 text-left transition-colors hover:border-foreground/20 hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-foreground">
                        {game.code}
                      </div>
                      <Badge
                        variant="outline"
                        className="border-border bg-card text-foreground"
                      >
                        {formatGameType(game.type)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{game.playerCount} players</span>
                      <span>{game.spectatorCount} spectators</span>
                      <span>{game.roundCount} tracked rounds</span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right text-sm text-muted-foreground">
                    <div className="text-foreground">{game.phase}</div>
                    <div className="mt-1">
                      {formatRelativeTime(game.updatedAt)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Surface>
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
    </>
  );
}
