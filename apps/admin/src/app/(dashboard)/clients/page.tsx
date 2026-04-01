"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Activity, Globe2, RefreshCcw, Search, Shield, SlidersHorizontal, Users } from "lucide-react";

import { api } from "@/lib/client-api";
import {
  ClientListResponse,
  ClientRecord,
  formatGameType,
  formatRelativeTime,
  GAME_TYPE_OPTIONS,
  shortId,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Pagination } from "@/components/Pagination";
import { ClientDetailDialog } from "@/components/admin/client-detail-dialog";
import { GameStateDialog } from "@/components/admin/game-state-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function ClientsPageSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Surface>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_180px_180px_180px] xl:flex-1">
              <Skeleton className="h-10 bg-white/6" />
              <Skeleton className="h-10 bg-white/6" />
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

        <Skeleton className="h-12 rounded-[20px] bg-white/6" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Surface key={index} className="bg-[#111b2a]">
            <Skeleton className="h-4 w-28 bg-white/6" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: index === 2 ? 6 : 3 }).map((__, itemIndex) => (
                <Skeleton key={itemIndex} className="h-14 bg-white/5" />
              ))}
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const { show } = useToast();
  const [data, setData] = useState<ClientListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [gameType, setGameType] = useState<"all" | any>("all");
  const [activity, setActivity] = useState<"all" | "in-game" | "idle" | "named" | "anonymous">("all");
  const [region, setRegion] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [selectedGame, setSelectedGame] = useState<{ id: string; type: any } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [activity, deferredSearch, gameType, region]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          q: deferredSearch,
          gameType,
          activity,
          region,
        });
        const response = await api(`/clients?${params}`);
        if (!cancelled) {
          setData(response as ClientListResponse);
        }
      } catch (error) {
        if (!cancelled) {
          show(error instanceof Error ? error.message : "Unable to load clients.", "error");
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
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activity, deferredSearch, gameType, page, pageSize, refreshKey, region, show]);

  const clients = data?.clients ?? [];
  const visibleRegions = data?.filters.regions ?? [];

  const filterTags = useMemo(() => {
    return [
      gameType === "all" ? "All games" : formatGameType(gameType),
      activity === "all" ? "All states" : activity.replace("-", " "),
      region === "all" ? "All regions" : region,
      deferredSearch.trim() ? `Query: ${deferredSearch.trim()}` : `Page size: ${pageSize}`,
    ];
  }, [activity, deferredSearch, gameType, pageSize, region]);

  if (loading && !data) {
    return <ClientsPageSkeleton />;
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Surface>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_180px_180px_180px] xl:flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by session, name, region, IP, or game"
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
                  value={activity}
                  onChange={(event) => setActivity(event.target.value as any)}
                  className="h-10 rounded-xl border border-white/8 bg-[#0d1624] px-4 text-sm text-slate-50 outline-none"
                >
                  <option value="all">All states</option>
                  <option value="in-game">In game</option>
                  <option value="idle">Idle</option>
                  <option value="named">Named</option>
                  <option value="anonymous">Anonymous</option>
                </select>

                <select
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  className="h-10 rounded-xl border border-white/8 bg-[#0d1624] px-4 text-sm text-slate-50 outline-none"
                >
                  <option value="all">All regions</option>
                  {visibleRegions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-white/8 bg-white/3 text-slate-200">
                  {data?.total ?? 0} results
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
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Live Roster</div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">Session list</div>
              </div>
              <div className="text-sm text-slate-400">Click any session row to open its control panel.</div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="text-slate-400">Identity</TableHead>
                  <TableHead className="text-slate-400">Location</TableHead>
                  <TableHead className="text-slate-400">Game</TableHead>
                  <TableHead className="hidden text-slate-400 xl:table-cell">Fingerprint / UA</TableHead>
                  <TableHead className="text-slate-400">Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableCell colSpan={5} className="px-4 py-16 text-center text-sm text-slate-500">
                      No active clients match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow
                      key={client.sessionId ?? shortId(client.fingerprint, 12)}
                      className="cursor-pointer border-white/8 hover:bg-[#142033]"
                      onClick={() => setSelectedClient(client)}
                    >
                      <TableCell className="align-top">
                        <div className="font-medium text-white">{client.name || "Anonymous"}</div>
                        <div className="mt-1 text-sm text-slate-400">{shortId(client.sessionId, 16)}</div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-300/78">
                        <div>{client.region || "Unknown region"}</div>
                        <div className="mt-1 text-slate-500">{client.ip || "Unknown IP"}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        {client.gameId && client.gameType ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/6"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedGame({ id: client.gameId!, type: client.gameType! });
                            }}
                          >
                            <Activity className="size-4" />
                            {formatGameType(client.gameType)}
                          </Button>
                        ) : (
                          <span className="text-sm text-slate-500">Not attached</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-sm align-top text-sm text-slate-400 xl:table-cell">
                        <div>{shortId(client.fingerprint, 18)}</div>
                        <div className="mt-1 truncate">{client.userAgent || "Unknown device"}</div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-300/78">
                        <div>{formatRelativeTime(client.lastSeen)}</div>
                        <div className="mt-1 text-slate-500">Connected {formatRelativeTime(client.connectedAt ?? null)}</div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Surface>

          <Pagination
            page={page}
            totalPages={data?.totalPages ?? 1}
            total={data?.total ?? 0}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
          />
        </div>

        <div className="space-y-4">
          <Surface className="bg-[#111b2a]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Roster Snapshot</div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Visible sessions", value: (data?.total ?? 0).toLocaleString(), icon: Users },
                { label: "Loaded this page", value: clients.length.toLocaleString(), icon: Activity },
                { label: "Search mode", value: activity.replace("-", " "), icon: Shield },
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
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              <SlidersHorizontal className="size-4" />
              Filter Context
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {filterTags.map((tag) => (
                <Badge key={tag} variant="outline" className="border-white/8 bg-[#0d1624] text-slate-200">
                  {tag}
                </Badge>
              ))}
            </div>
          </Surface>

          <Surface className="bg-[#111b2a]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              <Globe2 className="size-4" />
              Available Regions
            </div>
            <div className="mt-4 space-y-2">
              {visibleRegions.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-white/8 px-4 py-5 text-sm text-slate-500">
                  Region filters will appear as live traffic comes in.
                </div>
              ) : (
                visibleRegions.slice(0, 10).map((value) => (
                  <div key={value} className="flex items-center justify-between rounded-[18px] border border-white/8 bg-[#0d1624] px-4 py-3 text-sm">
                    <span className="text-slate-200">{value}</span>
                    {region === value ? (
                      <Badge variant="outline" className="border-[#38589a] bg-[#15274a] text-slate-100">
                        Active
                      </Badge>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Surface>
        </div>
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
