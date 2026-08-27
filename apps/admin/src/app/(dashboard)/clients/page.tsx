"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Globe2,
  RefreshCcw,
  Search,
  Users,
} from "lucide-react";

import { api } from "@/lib/client-api";
import {
  ClientListResponse,
  ClientRecord,
  formatActivity,
  formatGameType,
  formatRelativeTime,
  gameAccent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyNote, Panel } from "@/components/ui/stat-tile";
import { Surface } from "@/components/ui/surface";
import { Column, DataTable } from "@/components/ui/data-table";

function ClientsPageSkeleton() {
  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 flex-col gap-3">
        <Surface>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_180px_180px_180px] xl:flex-1">
              <Skeleton className="h-10 bg-muted" />
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

        <Skeleton className="h-12 rounded-lg bg-muted" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Surface key={index} className="bg-muted/40">
            <Skeleton className="h-4 w-28 bg-muted" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: index === 2 ? 6 : 3 }).map(
                (__, itemIndex) => (
                  <Skeleton key={itemIndex} className="h-14 bg-muted" />
                ),
              )}
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
  const [activity, setActivity] = useState<
    "all" | "in-game" | "idle" | "named" | "anonymous"
  >("all");
  const [region, setRegion] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(
    null,
  );
  const [selectedGame, setSelectedGame] = useState<{
    id: string;
    type: any;
  } | null>(null);

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
          show(
            error instanceof Error ? error.message : "Unable to load clients.",
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
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activity,
    deferredSearch,
    gameType,
    page,
    pageSize,
    refreshKey,
    region,
    show,
  ]);

  const clients = data?.clients ?? [];
  const visibleRegions = data?.filters.regions ?? [];

  const onlineCount = clients.filter((client) => client.online).length;

  if (loading && !data) {
    return <ClientsPageSkeleton />;
  }

  const columns: Column<ClientRecord>[] = [
    {
      id: "name",
      header: "Identity",
      width: 200,
      sortValue: (client) => client.name ?? "",
      cell: (client) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              title={client.online ? "Online" : "Idle"}
              className={`size-1.5 shrink-0 rounded-full ${
                client.online ? "bg-[var(--ok)]" : "bg-[var(--warn)]"
              }`}
              aria-hidden
            />
            <span className="truncate font-medium text-foreground">
              {client.name || "Anonymous"}
            </span>
          </div>
          <div className="mt-0.5 truncate pl-3.5 font-mono text-xs text-muted-foreground">
            {shortId(client.sessionId, 16)}
          </div>
        </div>
      ),
    },
    {
      id: "region",
      header: "Location",
      width: 160,
      sortValue: (client) => client.region ?? "",
      cell: (client) => (
        <div className="min-w-0">
          <div className="truncate text-foreground">
            {client.region || "Unknown"}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {client.ip || "No IP"}
          </div>
        </div>
      ),
    },
    {
      id: "activity",
      header: "Doing",
      width: 170,
      sortValue: (client) => client.activity ?? "",
      cell: (client) =>
        client.gameId && client.gameType ? (
          <Button
            variant="outline"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedGame({ id: client.gameId!, type: client.gameType! });
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ background: gameAccent(client.gameType) }}
              aria-hidden
            />
            {formatGameType(client.gameType)}
            {!client.online ? " (idle)" : ""}
          </Button>
        ) : (
          <Badge variant={client.online ? "muted" : "warn"}>
            {client.activity
              ? `${formatActivity(client.activity)}${client.online ? "" : " (idle)"}`
              : "Idle"}
          </Badge>
        ),
    },
    {
      id: "userAgent",
      header: "Device",
      width: 220,
      sortValue: (client) => client.userAgent ?? "",
      cell: (client) => (
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-muted-foreground">
            {shortId(client.fingerprint, 18)}
          </div>
          <div
            className="truncate text-xs text-muted-foreground"
            title={client.userAgent ?? undefined}
          >
            {client.userAgent || "Unknown device"}
          </div>
        </div>
      ),
    },
    {
      id: "lastSeen",
      header: "Seen",
      width: 130,
      sortValue: (client) => client.lastSeen,
      cell: (client) => (
        <div className="min-w-0">
          <div className="truncate text-muted-foreground">
            {formatRelativeTime(client.lastSeen)}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            joined {formatRelativeTime(client.connectedAt ?? null)}
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col gap-3">
          <Surface pad="sm" className="shrink-0">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_180px_180px_180px] xl:flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by session, name, region, IP, or game"
                    className="border-border bg-card pl-11 text-foreground"
                  />
                </div>

                <Select
                  value={gameType}
                  onValueChange={(value) => setGameType(value as any)}
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
                  value={activity}
                  onValueChange={(value) => setActivity(value as any)}
                >
                  <SelectTrigger className="h-10 min-w-[9rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    <SelectItem value="in-game">In game</SelectItem>
                    <SelectItem value="idle">Idle</SelectItem>
                    <SelectItem value="named">Named</SelectItem>
                    <SelectItem value="anonymous">Anonymous</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger className="h-10 min-w-[9rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All regions</SelectItem>
                    {visibleRegions.map((value) => (
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
                  {data?.total ?? 0} results
                </Badge>
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
              tableKey="clients"
              columns={columns}
              rows={clients}
              rowKey={(client) =>
                client.sessionId ?? shortId(client.fingerprint, 12)
              }
              onRowClick={(client) => setSelectedClient(client)}
              empty="No sessions match these filters."
            />
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

        {/* The rail used to hold three full-size cards for single digits, a
            Filter Context panel that repeated the dropdowns sitting inches
            above it, and a regions panel that was usually just a placeholder
            sentence. This is the same information as compact rows, plus the
            regions as actual one-click filters. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <Surface pad="none" className="shrink-0">
            <dl className="divide-y divide-border">
              {[
                { label: "Matching filters", value: (data?.total ?? 0).toLocaleString() },
                { label: "On this page", value: clients.length.toLocaleString() },
                { label: "Online now", value: onlineCount.toLocaleString() },
                { label: "Idle", value: (clients.length - onlineCount).toLocaleString() },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-3 px-3.5 py-2"
                >
                  <dt className="truncate text-[0.7rem] text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-base font-extrabold tabular-nums text-foreground">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Surface>

          <Panel
            title="Regions"
            accent="var(--game-chain)"
            className="min-h-0 flex-1"
            meta={
              region !== "all" ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setRegion("all")}
                >
                  Clear
                </Button>
              ) : null
            }
          >
            {visibleRegions.length === 0 ? (
              <EmptyNote>Regions appear as traffic comes in.</EmptyNote>
            ) : (
              <ul className="flex flex-col gap-1">
                {visibleRegions.map((value) => {
                  const active = region === value;
                  return (
                    <li key={value}>
                      <button
                        type="button"
                        onClick={() => setRegion(active ? "all" : value)}
                        className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? "border-primary/40 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                        }`}
                      >
                        <Globe2 className="size-3 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{value}</span>
                        {active ? (
                          <span className="shrink-0 text-[0.6rem] font-bold tracking-wider text-primary uppercase">
                            On
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
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
