"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Layers3, RefreshCcw, Search, Users } from "lucide-react";

import { api } from "@/lib/client-api";
import {
  formatGameType,
  formatRelativeTime,
  GAME_TYPE_OPTIONS,
  GameSummary,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { GameStateDialog } from "@/components/admin/game-state-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`rounded-[24px] border border-white/8 bg-[#0f1826] p-5 ${className}`}>{children}</section>;
}

function GamesPageSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Surface>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_180px_180px] xl:flex-1">
              <Skeleton className="h-10 bg-white/6 sm:col-span-3 xl:col-span-1" />
              <Skeleton className="h-10 bg-white/6" />
              <Skeleton className="h-10 bg-white/6" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 bg-white/6" />
              <Skeleton className="h-10 w-28 bg-white/6" />
            </div>
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="space-y-3">
            <Skeleton className="h-12 bg-white/6" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 bg-white/5" />
            ))}
          </div>
        </Surface>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Surface key={index} className="bg-[#111b2a]">
            <Skeleton className="h-4 w-28 bg-white/6" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((__, itemIndex) => (
                <Skeleton key={itemIndex} className="h-14 bg-white/5" />
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
};

export default function GamesPage() {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [response, setResponse] = useState<GamesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [gameType, setGameType] = useState<"all" | any>("all");
  const [phase, setPhase] = useState("all");
  const [selectedGame, setSelectedGame] = useState<{ id: string; type: any } | null>(null);

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
          show(error instanceof Error ? error.message : "Unable to load games.", "error");
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
      if (!deferredSearch.trim()) {
        return true;
      }

      const query = deferredSearch.trim().toLowerCase();
      return [game.code, game.id, game.hostId, game.phase, game.type].some((value) => value.toLowerCase().includes(query));
    });
  }, [deferredSearch, gameType, games, phase]);

  const phaseOptions = useMemo(() => Array.from(new Set(games.map((game) => game.phase))).sort(), [games]);

  const phaseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const game of filteredGames) {
      counts.set(game.phase, (counts.get(game.phase) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  }, [filteredGames]);

  const visiblePlayers = useMemo(() => filteredGames.reduce((sum, game) => sum + game.playerCount, 0), [filteredGames]);
  const visibleSpectators = useMemo(() => filteredGames.reduce((sum, game) => sum + game.spectatorCount, 0), [filteredGames]);
  const maxTypeTotal = useMemo(() => {
    const totals = GAME_TYPE_OPTIONS.filter((option) => option.value !== "all").map((option) => response?.totals?.[option.value] ?? 0);
    return Math.max(1, ...totals);
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
      show(error instanceof Error ? error.message : "Unable to end game.", "error");
    }
  };

  if (loading && !response) {
    return <GamesPageSkeleton />;
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Surface>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_180px_180px] xl:flex-1">
                <div className="relative sm:col-span-3 xl:col-span-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by code, host, id, type, or phase"
                    className="border-white/8 bg-[#0d1624] pl-11 text-slate-50"
                  />
                </div>

                <select
                  value={gameType}
                  onChange={(event) => setGameType(event.target.value as any)}
                  className="h-10 rounded-xl border border-white/8 bg-[#0d1624] px-4 text-sm text-slate-50 outline-none"
                >
                  {GAME_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={phase}
                  onChange={(event) => setPhase(event.target.value)}
                  className="h-10 rounded-xl border border-white/8 bg-[#0d1624] px-4 text-sm text-slate-50 outline-none"
                >
                  <option value="all">All phases</option>
                  {phaseOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-white/8 bg-white/3 text-slate-200">
                  {filteredGames.length} visible
                </Badge>
                <Button
                  variant="outline"
                  className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/6"
                  onClick={() => setRefreshKey((value) => value + 1)}
                >
                  <RefreshCcw className="size-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </Surface>

          <Surface className="overflow-hidden">
            <div className="mb-4 flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Room List</div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">Active game sessions</div>
              </div>
              <div className="text-sm text-slate-400">Open any room to inspect live state and attached people.</div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="text-slate-400">Game</TableHead>
                  <TableHead className="text-slate-400">Players</TableHead>
                  <TableHead className="text-slate-400">Spectators</TableHead>
                  <TableHead className="text-slate-400">Phase</TableHead>
                  <TableHead className="text-slate-400">Updated</TableHead>
                  <TableHead className="text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGames.length === 0 ? (
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableCell colSpan={6} className="px-4 py-16 text-center text-sm text-slate-500">
                      No active games match the current search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGames.map((game) => (
                    <TableRow key={game.id} className="border-white/8 hover:bg-[#142033]">
                      <TableCell>
                        <div className="font-medium text-white">{game.code}</div>
                        <div className="mt-1 text-sm text-slate-400">{formatGameType(game.type)}</div>
                      </TableCell>
                      <TableCell className="text-slate-200">{game.playerCount}</TableCell>
                      <TableCell className="text-slate-200">{game.spectatorCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-white/8 bg-[#0d1624] text-slate-200">
                          {game.phase}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">{formatRelativeTime(game.updatedAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/6"
                            onClick={() => setSelectedGame({ id: game.id, type: game.type })}
                          >
                            <Activity className="size-4" />
                            View
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22"
                            onClick={() => void endGame(game)}
                          >
                            End
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Surface>
        </div>

        <div className="space-y-4">
          <Surface className="bg-[#111b2a]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Room Snapshot</div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Visible rooms", value: filteredGames.length.toLocaleString(), icon: Layers3 },
                { label: "Visible players", value: visiblePlayers.toLocaleString(), icon: Users },
                { label: "Visible spectators", value: visibleSpectators.toLocaleString(), icon: Activity },
                { label: "Active phases", value: phaseCounts.length.toLocaleString(), icon: BarChart3 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-[18px] border border-white/8 bg-[#0d1624] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[14px] border border-white/8 bg-[#18253a] text-slate-100">
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</div>
                      <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">{value}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Surface>

          <Surface className="bg-[#111b2a]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Type Distribution</div>
            <div className="mt-4 space-y-3">
              {GAME_TYPE_OPTIONS.filter((option) => option.value !== "all").map((option) => {
                const total = response?.totals?.[option.value] ?? 0;

                return (
                  <div key={option.value}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm text-slate-300">
                      <span>{option.label}</span>
                      <span className="text-slate-400">{total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#0c1420]">
                      <div className="h-2 rounded-full bg-[#4f7cff]" style={{ width: `${(total / maxTypeTotal) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>

          <Surface className="bg-[#111b2a]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Phase Mix</div>
            <div className="mt-4 space-y-2">
              {phaseCounts.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-white/8 px-4 py-5 text-sm text-slate-500">
                  Phase distribution appears once live rooms load.
                </div>
              ) : (
                phaseCounts.map(([phaseName, total]) => (
                  <div key={phaseName} className="flex items-center justify-between rounded-[18px] border border-white/8 bg-[#0d1624] px-4 py-3 text-sm">
                    <span className="text-slate-200">{phaseName}</span>
                    <span className="text-slate-400">{total}</span>
                  </div>
                ))
              )}
            </div>
          </Surface>
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
