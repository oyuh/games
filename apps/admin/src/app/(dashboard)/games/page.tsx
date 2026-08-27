"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  MoreHorizontal,
  RefreshCcw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { api } from "@/lib/client-api";
import {
  formatGameType,
  formatRelativeTime,
  gameAccent,
  shortId,
  GAME_TYPE_OPTIONS,
  GameSummary,
  GameType,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { GameStateDialog } from "@/components/admin/game-state-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Column, DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Panel } from "@/components/ui/stat-tile";

function GamesPageSkeleton() {
  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 flex-col gap-3">
        <Surface>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-[minmax(0,1fr)_160px_160px_160px] xl:flex-1">
              <Skeleton className="h-10 bg-muted sm:col-span-4 xl:col-span-1" />
              <Skeleton className="h-10 bg-muted" />
              <Skeleton className="h-10 bg-muted" />
              <Skeleton className="h-10 bg-muted" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 bg-muted" />
              <Skeleton className="h-10 w-28 bg-muted" />
            </div>
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="space-y-3">
            <Skeleton className="h-12 bg-muted" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 bg-muted" />
            ))}
          </div>
        </Surface>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Surface key={index} className="bg-muted/40">
            <Skeleton className="h-4 w-28 bg-muted" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((__, itemIndex) => (
                <Skeleton key={itemIndex} className="h-14 bg-muted" />
              ))}
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}

type GamesResponse = {
  games: Record<string, GameSummary[]>;
  totals: Record<string, number>;
  lifecycleTotals?: {
    active: number;
    ended: number;
    total: number;
  };
};

const GAME_TYPE_FILTER_OPTIONS = GAME_TYPE_OPTIONS.filter(
  (option) => option.value !== "all",
);

export default function GamesPage() {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [response, setResponse] = useState<GamesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [gameType, setGameType] = useState<GameType | "all">("all");
  const [status, setStatus] = useState<"all" | "active" | "ended">("all");
  const [phase, setPhase] = useState("all");
  const [selectedGame, setSelectedGame] = useState<{
    id: string;
    type: GameType;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await api("/games");
        if (!cancelled) {
          setResponse(data as GamesResponse);
        }
      } catch (error) {
        if (!cancelled) {
          show(
            error instanceof Error ? error.message : "Unable to load games.",
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

  const games = useMemo(() => {
    if (!response?.games) {
      return [] as GameSummary[];
    }

    return Object.values(response.games)
      .flat()
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }, [response]);

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      if (gameType !== "all" && game.type !== gameType) {
        return false;
      }
      if (phase !== "all" && game.phase !== phase) {
        return false;
      }
      if (status === "active" && game.phase === "ended") {
        return false;
      }
      if (status === "ended" && game.phase !== "ended") {
        return false;
      }
      if (!deferredSearch.trim()) {
        return true;
      }

      const query = deferredSearch.trim().toLowerCase();
      return [game.code, game.id, game.hostId, game.phase, game.type].some(
        (value) => value.toLowerCase().includes(query),
      );
    });
  }, [deferredSearch, gameType, games, phase, status]);

  const phaseOptions = useMemo(
    () => Array.from(new Set(games.map((game) => game.phase))).sort(),
    [games],
  );

  const phaseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const game of filteredGames) {
      counts.set(game.phase, (counts.get(game.phase) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(
      (left, right) => right[1] - left[1],
    );
  }, [filteredGames]);

  const visiblePlayers = useMemo(
    () => filteredGames.reduce((sum, game) => sum + game.playerCount, 0),
    [filteredGames],
  );
  const visibleSpectators = useMemo(
    () => filteredGames.reduce((sum, game) => sum + game.spectatorCount, 0),
    [filteredGames],
  );
  const visibleEnded = useMemo(
    () => filteredGames.filter((game) => game.phase === "ended").length,
    [filteredGames],
  );
  const visibleActive = filteredGames.length - visibleEnded;
  const maxTypeTotal = useMemo(() => {
    let maxTotal = 1;
    for (const option of GAME_TYPE_FILTER_OPTIONS) {
      maxTotal = Math.max(maxTotal, response?.totals?.[option.value] ?? 0);
    }
    return maxTotal;
  }, [response]);

  const endGame = async (game: GameSummary) => {
    const confirmed = await confirm({
      title: "End live game?",
      description: `End ${formatGameType(game.type)} room ${game.code} immediately for everyone currently attached.`,
      confirmLabel: "End game",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    try {
      await api(`/games/${game.type}/${game.id}/end`, { method: "POST" });
      show("Game ended.", "success");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(
        error instanceof Error ? error.message : "Unable to end game.",
        "error",
      );
    }
  };

  const deleteGame = async (game: GameSummary) => {
    const confirmed = await confirm({
      title: "Delete persisted game?",
      description: `Delete ${formatGameType(game.type)} room ${game.code}, along with its chat messages and saved encryption key.`,
      confirmLabel: "Delete game",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    try {
      await api(`/games/${game.type}/${game.id}`, { method: "DELETE" });
      show("Game deleted.", "success");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(
        error instanceof Error ? error.message : "Unable to delete game.",
        "error",
      );
    }
  };

  if (loading && !response) {
    return <GamesPageSkeleton />;
  }

  const columns: Column<GameSummary>[] = [
    {
      id: "code",
      header: "Room",
      width: 190,
      sortValue: (game) => game.code,
      cell: (game) => (
        <div className="min-w-0">
          <div className="truncate font-mono font-semibold text-foreground">
            {game.code}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: gameAccent(game.type) }}
              aria-hidden
            />
            <span className="truncate text-xs text-muted-foreground">
              {formatGameType(game.type)}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "playerCount",
      header: "Players",
      width: 90,
      align: "right",
      sortValue: (game) => game.playerCount,
      cell: (game) => game.playerCount,
    },
    {
      id: "spectatorCount",
      header: "Watching",
      width: 100,
      align: "right",
      sortValue: (game) => game.spectatorCount,
      cell: (game) => game.spectatorCount,
    },
    {
      id: "roundCount",
      header: "Rounds",
      width: 90,
      align: "right",
      sortValue: (game) => game.roundCount,
      cell: (game) => game.roundCount,
    },
    {
      id: "phase",
      header: "Phase",
      width: 120,
      sortValue: (game) => game.phase,
      cell: (game) => (
        <Badge
          variant={game.phase === "ended" ? "muted" : "accent"}
          accent={gameAccent(game.type)}
        >
          {game.phase}
        </Badge>
      ),
    },
    {
      id: "hostId",
      header: "Host",
      width: 150,
      sortValue: (game) => game.hostId,
      cell: (game) => (
        <span className="truncate font-mono text-xs text-muted-foreground">
          {shortId(game.hostId, 14)}
        </span>
      ),
    },
    {
      id: "updatedAt",
      header: "Updated",
      width: 130,
      sortValue: (game) => game.updatedAt,
      cell: (game) => (
        <span className="text-muted-foreground">
          {formatRelativeTime(game.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      width: 80,
      align: "right",
      alwaysVisible: true,
      cell: (game) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Room actions"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => setSelectedGame({ id: game.id, type: game.type })}
            >
              <Activity />
              Inspect room
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {game.phase === "ended" ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => void deleteGame(game)}
              >
                <Trash2 />
                Delete room
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => void endGame(game)}
              >
                <ShieldAlert />
                End room
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col gap-3">
          <Surface pad="sm" className="shrink-0">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-[minmax(0,1fr)_160px_160px_160px] xl:flex-1">
                <div className="relative sm:col-span-4 xl:col-span-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by code, host, id, type, or phase"
                    className="border-border bg-card pl-11 text-foreground"
                  />
                </div>

                <Select
                  value={gameType}
                  onValueChange={(value) =>
                    setGameType(value as GameType | "all")
                  }
                >
                  <SelectTrigger className="h-10 min-w-[10rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GAME_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={status}
                  onValueChange={(value) =>
                    setStatus(value as "all" | "active" | "ended")
                  }
                >
                  <SelectTrigger className="h-10 min-w-[9.5rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active only</SelectItem>
                    <SelectItem value="ended">Ended only</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger className="h-10 min-w-[9rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All phases</SelectItem>
                    {phaseOptions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-border bg-card text-foreground"
                >
                  {filteredGames.length} visible
                </Badge>
                {visibleEnded > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-border bg-card text-foreground"
                  >
                    {visibleEnded} ended
                  </Badge>
                ) : null}
                <Button
                  variant="outline"
                  className="border-border bg-card text-foreground hover:bg-accent"
                  onClick={() => setRefreshKey((value) => value + 1)}
                >
                  <RefreshCcw className="size-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </Surface>

          <Surface pad="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DataTable
              className="min-h-0 flex-1"
              tableKey="games"
              columns={columns}
              rows={filteredGames}
              rowKey={(game) => game.id}
              onRowClick={(game) =>
                setSelectedGame({ id: game.id, type: game.type })
              }
              empty="No rooms match this search."
            />
          </Surface>
        </div>

        {/* The rail held six full-size cards for single digits, then two
            panels that mostly rendered placeholder sentences. Same numbers,
            read in a quarter of the space, and the type list doubles as a
            filter. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <Surface pad="none" className="shrink-0">
            <dl className="divide-y divide-border">
              {[
                { label: "Visible rooms", value: filteredGames.length },
                { label: "Active", value: visibleActive },
                { label: "Ended", value: visibleEnded },
                { label: "Players", value: visiblePlayers },
                { label: "Spectators", value: visibleSpectators },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-3 px-3.5 py-2"
                >
                  <dt className="truncate text-[0.7rem] text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-base font-extrabold tabular-nums text-foreground">
                    {row.value.toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
          </Surface>

          <Panel
            title="By type"
            accent="var(--game-password)"
            className="min-h-0 flex-1"
            meta={
              gameType !== "all" ? (
                <Button variant="ghost" size="xs" onClick={() => setGameType("all")}>
                  Clear
                </Button>
              ) : null
            }
          >
            <ul className="flex flex-col gap-1">
              {GAME_TYPE_FILTER_OPTIONS.map((option) => {
                const total = response?.totals?.[option.value] ?? 0;
                const active = gameType === option.value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => setGameType(active ? "all" : option.value)}
                      className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        active
                          ? "border-primary/40 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: gameAccent(option.value) }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">
                        {total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {phaseCounts.length > 0 ? (
              <>
                <div className="mt-3 border-t border-border pt-3 text-[0.6rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                  Phases
                </div>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {phaseCounts.map(([phaseName, total]) => (
                    <li
                      key={phaseName}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-xs"
                    >
                      <span className="truncate text-muted-foreground">
                        {phaseName}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">
                        {total}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Panel>
        </div>
      </div>

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
