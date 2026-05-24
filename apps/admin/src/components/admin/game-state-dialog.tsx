"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Clock3,
  Layers3,
  MessageSquare,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatGameType,
  formatRelativeTime,
  GameDetailResponse,
  GameType,
  humanizeKey,
  shortId,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type GameTarget = {
  id: string;
  type: GameType;
} | null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load game state.";
}

function getPhaseTone(phase: string | undefined) {
  const normalized = phase?.toLowerCase() ?? "";
  if (normalized.includes("ended") || normalized.includes("finished")) {
    return "border-border bg-muted text-foreground";
  }
  if (normalized.includes("lobby")) {
    return "border-border bg-muted text-foreground";
  }
  return "border-border bg-muted text-foreground";
}

function getPlayerCount(game: Record<string, unknown>) {
  if (Array.isArray(game.players)) {
    return game.players.length;
  }
  if (Array.isArray(game.teams)) {
    return game.teams.reduce((sum, team) => {
      if (!team || typeof team !== "object") {
        return sum;
      }
      const rawMembers = (team as { members?: unknown[] }).members;
      const members: unknown[] = Array.isArray(rawMembers) ? rawMembers : [];
      return sum + members.length;
    }, 0);
  }
  return 0;
}

function getSpectatorCount(game: Record<string, unknown>) {
  return Array.isArray(game.spectators) ? game.spectators.length : 0;
}

function getRoundCount(game: Record<string, unknown>) {
  if (Array.isArray(game.roundHistory)) {
    return game.roundHistory.length;
  }
  if (Array.isArray(game.rounds)) {
    return game.rounds.length;
  }
  return 0;
}

function summarizeValue(value: unknown): string {
  if (value == null) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "object") {
    return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
  }
  return String(value);
}

function JsonNode({
  label,
  value,
  depth = 0,
}: {
  label: string;
  value: unknown;
  depth?: number;
}) {
  if (value == null || typeof value !== "object") {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <div className="text-muted-foreground">{label}</div>
        <div className="max-w-[65%] truncate text-right text-foreground">
          {summarizeValue(value)}
        </div>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);

  return (
    <details
      open={depth < 1}
      className="rounded-lg border border-border bg-card p-3"
    >
      <summary className="flex items-center justify-between gap-3 text-sm text-foreground">
        <span className="font-medium">{label}</span>
        <span className="text-xs uppercase tracking-normal text-muted-foreground">
          {Array.isArray(value)
            ? `${entries.length} items`
            : `${entries.length} fields`}
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            Empty
          </div>
        ) : (
          entries.map(([entryLabel, entryValue]) => (
            <JsonNode
              key={`${label}-${entryLabel}`}
              label={
                Array.isArray(value)
                  ? `Item ${Number(entryLabel) + 1}`
                  : humanizeKey(entryLabel)
              }
              value={entryValue}
              depth={depth + 1}
            />
          ))
        )}
      </div>
    </details>
  );
}

function Surface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/40 p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function GameStateDialog({
  target,
  open,
  onOpenChange,
  onChanged,
}: {
  target: GameTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [detail, setDetail] = useState<GameDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setLoading(true);
      try {
        const response = await api(`/games/${target.type}/${target.id}`);
        if (!cancelled) {
          setDetail(response as GameDetailResponse);
        }
      } catch (error) {
        if (!cancelled) {
          show(getErrorMessage(error), "error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDetail();
    const interval = window.setInterval(() => {
      void loadDetail();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open, show, target]);

  const game = detail?.game;
  const gameEnded = String(game?.phase ?? "").toLowerCase() === "ended";

  const refresh = async () => {
    if (!target) {
      return;
    }
    setLoading(true);
    try {
      const response = await api(`/games/${target.type}/${target.id}`);
      setDetail(response as GameDetailResponse);
    } catch (error) {
      show(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  const endGame = async () => {
    if (!target) {
      return;
    }

    const confirmed = await confirm({
      title: "End live game?",
      description: `End this ${formatGameType(target.type)} room immediately for everyone in it.`,
      confirmLabel: "End game",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    setPendingAction("end");
    try {
      await api(`/games/${target.type}/${target.id}/end`, { method: "POST" });
      show("Game ended.", "success");
      onChanged?.();
      await refresh();
    } catch (error) {
      show(getErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const deleteGame = async () => {
    if (!target) {
      return;
    }

    const confirmed = await confirm({
      title: "Delete persisted game?",
      description: `Delete this ${formatGameType(target.type)} room, its chat messages, and saved encryption key. This removes it from admin cleanup lists.`,
      confirmLabel: "Delete game",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    setPendingAction("delete");
    try {
      await api(`/games/${target.type}/${target.id}`, { method: "DELETE" });
      show("Game deleted.", "success");
      onChanged?.();
      onOpenChange(false);
    } catch (error) {
      show(getErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const kickPlayer = async (sessionId: string) => {
    if (!target) {
      return;
    }

    const confirmed = await confirm({
      title: "Kick player from room?",
      description: `Remove ${shortId(sessionId, 12)} from the current game session.`,
      confirmLabel: "Kick player",
      tone: "warning",
    });

    if (!confirmed) {
      return;
    }

    setPendingAction(sessionId);
    try {
      await api(`/games/${target.type}/${target.id}/kick/${sessionId}`, {
        method: "POST",
      });
      show("Player removed from game.", "success");
      onChanged?.();
      await refresh();
    } catch (error) {
      show(getErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const gameSections =
    game == null
      ? []
      : (
          [
            ["Settings", (game as { settings?: unknown }).settings],
            ["Scores", (game as { scores?: unknown }).scores],
            ["Announcement", (game as { announcement?: unknown }).announcement],
          ] as const
        ).reduce<Array<readonly [string, unknown]>>((sections, section) => {
          if (section[1] != null) {
            sections.push(section);
          }
          return sections;
        }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="[--dialog-content-width:84rem] 2xl:[--dialog-content-width:90rem] border-border bg-card text-foreground shadow-none">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <DialogTitle className="text-xl text-foreground">
                {game
                  ? `${formatGameType(game.type)} state`
                  : "Live game state"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-muted-foreground">
                Opens the raw state with a readable layer on top and keeps
                polling while the modal stays open.
              </DialogDescription>
              {game && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge className="border border-border bg-muted text-foreground">
                    Code {String(game.code ?? "----")}
                  </Badge>
                  <Badge
                    className={cn(
                      "border",
                      getPhaseTone(String(game.phase ?? "unknown")),
                    )}
                  >
                    {String(game.phase ?? "unknown")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-border text-foreground"
                  >
                    Updated {formatRelativeTime(Number(game.updatedAt ?? 0))}
                  </Badge>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="border-border bg-card text-foreground hover:bg-accent"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCcw className="size-4" />
                Refresh
              </Button>
              <Button
                variant="destructive"
                className="border border-border bg-muted text-foreground hover:bg-accent"
                onClick={() => void (gameEnded ? deleteGame() : endGame())}
                disabled={
                  !target ||
                  pendingAction === "end" ||
                  pendingAction === "delete"
                }
              >
                {gameEnded ? (
                  <Trash2 className="size-4" />
                ) : (
                  <ShieldAlert className="size-4" />
                )}
                {gameEnded ? "Delete game" : "End game"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {!target ? null : loading && !detail ? (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 bg-muted" />
              ))}
            </div>
            <Skeleton className="h-12 bg-muted" />
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Skeleton className="h-72 bg-muted" />
              <Skeleton className="h-72 bg-muted" />
            </div>
          </div>
        ) : !detail || !game ? (
          <div className="rounded-lg border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
            No state available for this game yet.
          </div>
        ) : (
          <Tabs defaultValue="overview" className="gap-4">
            <TabsList className="rounded-md bg-muted/40">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="raw">Raw state</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                  {
                    label: "Players",
                    value: getPlayerCount(game).toLocaleString(),
                    icon: Users,
                  },
                  {
                    label: "Spectators",
                    value: getSpectatorCount(game).toLocaleString(),
                    icon: Activity,
                  },
                  {
                    label: "Tracked rounds",
                    value: getRoundCount(game).toLocaleString(),
                    icon: Layers3,
                  },
                  {
                    label: "Attached sessions",
                    value: detail.sessions.length.toLocaleString(),
                    icon: Clock3,
                  },
                  {
                    label: "Chat messages",
                    value: detail.chatMessages.length.toLocaleString(),
                    icon: MessageSquare,
                  },
                ].map((metric) => {
                  const Icon = metric.icon;

                  return (
                    <Surface
                      key={metric.label}
                      className="flex items-center gap-3"
                    >
                      <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                        <Icon className="size-5" />
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-normal text-muted-foreground">
                          {metric.label}
                        </div>
                        <div className="mt-1 text-2xl font-semibold tracking-normal text-foreground">
                          {metric.value}
                        </div>
                      </div>
                    </Surface>
                  );
                })}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <Surface>
                  <div className="text-sm font-semibold text-foreground">
                    Operational highlights
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {[
                      ["Type", formatGameType(game.type)],
                      ["Code", String(game.code ?? "--")],
                      ["Phase", String(game.phase ?? "--")],
                      [
                        "Host",
                        shortId(
                          typeof game.hostId === "string" ? game.hostId : null,
                          14,
                        ),
                      ],
                      [
                        "Created",
                        formatDateTime(
                          typeof game.createdAt === "number"
                            ? game.createdAt
                            : null,
                        ),
                      ],
                      [
                        "Updated",
                        formatDateTime(
                          typeof game.updatedAt === "number"
                            ? game.updatedAt
                            : null,
                        ),
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg border border-border bg-muted/40 p-3"
                      >
                        <div className="text-[11px] uppercase tracking-normal text-muted-foreground">
                          {label}
                        </div>
                        <div className="mt-2 text-sm text-foreground">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </Surface>

                <Surface>
                  <div className="text-sm font-semibold text-foreground">
                    Live attachments
                  </div>
                  <div className="mt-4 space-y-2">
                    {detail.sessions.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                        No active sessions currently attached.
                      </div>
                    ) : (
                      detail.sessions.map((session) => (
                        <div
                          key={String(
                            session.sessionId ??
                              session.name ??
                              session.lastSeen ??
                              "attached-session",
                          )}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm"
                        >
                          <div>
                            <div className="font-medium text-foreground">
                              {session.name || "Anonymous"}
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              {shortId(session.sessionId, 14)}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-border text-foreground"
                          >
                            {formatRelativeTime(session.lastSeen)}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </Surface>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {gameSections.map(([label, value]) => (
                  <Surface key={label}>
                    <div className="text-sm font-semibold text-foreground">
                      {label}
                    </div>
                    <div className="mt-4 space-y-2">
                      {value &&
                      typeof value === "object" &&
                      !Array.isArray(value) ? (
                        Object.entries(value).map(([entryKey, entryValue]) => (
                          <div
                            key={entryKey}
                            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                          >
                            <div className="text-muted-foreground">
                              {humanizeKey(entryKey)}
                            </div>
                            <div className="max-w-[60%] truncate text-right text-foreground">
                              {summarizeValue(entryValue)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
                          {summarizeValue(value)}
                        </div>
                      )}
                    </div>
                  </Surface>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="people" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <Surface>
                  <div className="text-sm font-semibold text-foreground">
                    Players and teams
                  </div>
                  <div className="mt-4 space-y-3">
                    {Array.isArray((game as { players?: unknown[] }).players) &&
                      (
                        game as { players?: Array<Record<string, unknown>> }
                      ).players!.map((player) => {
                        const playerSessionId =
                          typeof player.sessionId === "string"
                            ? player.sessionId
                            : null;
                        const playerKey = String(
                          playerSessionId ??
                            player.name ??
                            player.role ??
                            "player",
                        );

                        return (
                          <div
                            key={playerKey}
                            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-foreground">
                                {typeof player.name === "string" && player.name
                                  ? player.name
                                  : "Anonymous"}
                              </div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {shortId(playerSessionId, 14)}
                              </div>
                            </div>
                            {typeof player.role === "string" && (
                              <Badge
                                variant="outline"
                                className="border-border text-foreground"
                              >
                                {player.role}
                              </Badge>
                            )}
                            {typeof player.totalScore === "number" && (
                              <Badge
                                variant="outline"
                                className="border-border text-foreground"
                              >
                                Score {player.totalScore}
                              </Badge>
                            )}
                            {playerSessionId && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg border-border bg-card text-foreground hover:bg-accent"
                                onClick={() => void kickPlayer(playerSessionId)}
                                disabled={pendingAction === playerSessionId}
                              >
                                Kick
                              </Button>
                            )}
                          </div>
                        );
                      })}

                    {Array.isArray((game as { teams?: unknown[] }).teams) &&
                      (
                        game as { teams?: Array<Record<string, unknown>> }
                      ).teams!.map((team, index) => {
                        const teamMembers = Array.isArray(team.members)
                          ? team.members
                          : [];
                        const teamKey = String(
                          team.id ??
                            team.name ??
                            teamMembers.map(String).join("-") ??
                            "team",
                        );

                        return (
                          <div
                            key={teamKey}
                            className="rounded-lg border border-border bg-muted/40 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-foreground">
                                {String(team.name ?? `Team ${index + 1}`)}
                              </div>
                              <Badge
                                variant="outline"
                                className="border-border text-foreground"
                              >
                                {teamMembers.length} members
                              </Badge>
                            </div>
                            <div className="mt-3 space-y-2">
                              {teamMembers.map((memberId) => (
                                <div
                                  key={String(memberId)}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                                >
                                  <div className="text-foreground">
                                    {shortId(String(memberId), 14)}
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg border-border bg-card text-foreground hover:bg-accent"
                                    onClick={() =>
                                      void kickPlayer(String(memberId))
                                    }
                                    disabled={
                                      pendingAction === String(memberId)
                                    }
                                  >
                                    Kick
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                    {!Array.isArray(
                      (game as { players?: unknown[] }).players,
                    ) &&
                      !Array.isArray((game as { teams?: unknown[] }).teams) && (
                        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                          No roster data exposed on this game state.
                        </div>
                      )}
                  </div>
                </Surface>

                <Surface>
                  <div className="text-sm font-semibold text-foreground">
                    Spectators
                  </div>
                  <div className="mt-4 space-y-2">
                    {Array.isArray(
                      (game as { spectators?: unknown[] }).spectators,
                    ) &&
                    (game as { spectators?: Array<Record<string, unknown>> })
                      .spectators!.length > 0 ? (
                      (
                        game as { spectators?: Array<Record<string, unknown>> }
                      ).spectators!.map((spectator) => (
                        <div
                          key={String(
                            spectator.sessionId ??
                              spectator.name ??
                              "spectator",
                          )}
                          className="rounded-lg border border-border bg-muted/40 p-3 text-sm"
                        >
                          <div className="font-medium text-foreground">
                            {typeof spectator.name === "string" &&
                            spectator.name
                              ? spectator.name
                              : "Spectator"}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {shortId(
                              typeof spectator.sessionId === "string"
                                ? spectator.sessionId
                                : null,
                              14,
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                        No spectators attached.
                      </div>
                    )}
                  </div>
                </Surface>
              </div>
            </TabsContent>

            <TabsContent value="chat">
              <Surface>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-foreground">
                    Game chat messages
                  </div>
                  <Badge
                    variant="outline"
                    className="w-fit border-border text-foreground"
                  >
                    Read only
                  </Badge>
                </div>

                <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                  {detail.chatMessages.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                      No chat messages have been sent in this room.
                    </div>
                  ) : (
                    detail.chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {message.senderName || "Anonymous"}
                              </span>
                              {message.badge ? (
                                <Badge
                                  variant="outline"
                                  className="border-border text-foreground"
                                >
                                  {message.badge}
                                </Badge>
                              ) : null}
                              <Badge
                                variant="outline"
                                className="border-border text-foreground"
                              >
                                #{message.channel || "all"}
                              </Badge>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {shortId(message.senderId, 14)}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">
                            {formatDateTime(message.createdAt)}
                          </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-foreground">
                          {message.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Surface>
            </TabsContent>

            <TabsContent value="raw">
              <Surface>
                <div className="text-sm font-semibold text-foreground">
                  Structured raw state
                </div>
                <div className="mt-4 space-y-3">
                  {Object.entries(game).map(([label, value]) => (
                    <JsonNode
                      key={label}
                      label={humanizeKey(label)}
                      value={value}
                    />
                  ))}
                </div>
              </Surface>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
