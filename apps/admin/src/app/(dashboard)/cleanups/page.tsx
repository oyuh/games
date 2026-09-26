"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, History, RefreshCcw, XCircle } from "lucide-react";
import { api } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Column, DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/Pagination";
import { StatTile } from "@/components/ui/stat-tile";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Run = {
  id: string;
  trigger: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  report: Line[] | null;
};
type Line = { label: string; value: string; tone: string };
type Day = { day: string; runs: number; completed: number; failed: number; unfinished: number; durationMs: number; report: Line[] };
type History = { runs: Run[]; days: Day[]; policy: string; pageTotal: number; total: number; completed: number; failed: number; running: number; pageSize: number };
const tones: Record<string, string> = {
  info: "text-muted-foreground",
  success: "text-ok",
  warning: "text-warn",
  error: "text-danger",
};

/**
 * One column per report label, in the order they first appear. The labels are
 * per game plus a few totals, and older runs can carry labels newer ones do
 * not, so they come from the rows rather than a fixed list.
 */
function reportColumns<Row>(rows: Row[], report: (row: Row) => Line[] | null): Column<Row>[] {
  const labels = [...new Set(rows.flatMap((row) => report(row)?.map((line) => line.label) ?? []))];
  return labels.map((label) => ({
    id: `report:${label}`,
    header: label,
    width: 240,
    cell: (row) => {
      const line = report(row)?.find((entry) => entry.label === label);
      if (!line) return <span className="text-muted-foreground/40">-</span>;
      return <span className={`font-mono text-xs ${tones[line.tone] ?? tones.info}`}>{line.value}</span>;
    },
  }));
}

const runColumns = (runs: Run[]): Column<Run>[] => [
  {
    id: "status",
    header: "Status",
    width: 120,
    sortValue: (run) => run.status,
    cell: (run) =>
      run.status === "completed" ? <Badge variant="success">Completed</Badge>
      : run.status === "failed" ? <Badge variant="danger">Failed</Badge>
      : <Badge variant="warn">Unfinished</Badge>,
  },
  {
    id: "startedAt",
    header: "Started",
    width: 190,
    sortValue: (run) => run.startedAt,
    cell: (run) => <time dateTime={new Date(run.startedAt).toISOString()}>{new Date(run.startedAt).toLocaleString()}</time>,
  },
  {
    id: "trigger",
    header: "Trigger",
    width: 110,
    sortValue: (run) => run.trigger,
    cell: (run) => <span className="text-muted-foreground">{run.trigger}</span>,
  },
  {
    id: "duration",
    header: "Duration",
    width: 100,
    align: "right",
    sortValue: (run) => (run.finishedAt === null ? null : run.finishedAt - run.startedAt),
    cell: (run) =>
      run.finishedAt === null ? <span className="text-muted-foreground/40">-</span> : `${((run.finishedAt - run.startedAt) / 1000).toFixed(2)}s`,
  },
  ...reportColumns(runs, (run) => run.report),
];

const count = (value: number, tone: string) =>
  value ? <span className={tones[tone]}>{value}</span> : <span className="text-muted-foreground/40">0</span>;

const dayColumns = (days: Day[]): Column<Day>[] => [
  { id: "day", header: "Day", width: 120, sortValue: (day) => day.day, cell: (day) => <time dateTime={day.day}>{day.day}</time> },
  { id: "runs", header: "Runs", width: 80, align: "right", sortValue: (day) => day.runs, cell: (day) => day.runs },
  { id: "failed", header: "Failed", width: 80, align: "right", sortValue: (day) => day.failed, cell: (day) => count(day.failed, "error") },
  { id: "unfinished", header: "Unfinished", width: 110, align: "right", sortValue: (day) => day.unfinished, cell: (day) => count(day.unfinished, "warning") },
  {
    id: "average",
    header: "Average",
    width: 100,
    align: "right",
    sortValue: (day) => {
      const finished = day.completed + day.failed;
      return finished ? day.durationMs / finished : null;
    },
    cell: (day) => {
      const finished = day.completed + day.failed;
      return finished ? `${(day.durationMs / finished / 1000).toFixed(2)}s` : <span className="text-muted-foreground/40">-</span>;
    },
  },
  ...reportColumns(days, (day) => day.report),
];

export default function CleanupsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const next: History = await api(`/cleanups?page=${page}`);
        if (!canceled) { setData(next); setError(""); }
      } catch (error) {
        if (!canceled) setError(error instanceof Error ? error.message : "Could not load cleanup history.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    setLoading(true);
    void load();
    const timer = setInterval(load, 15_000);
    return () => { canceled = true; clearInterval(timer); };
  }, [page, refresh]);
  const pageSize = data?.pageSize ?? 25;
  const finished = (data?.completed ?? 0) + (data?.failed ?? 0);
  const runs = data?.runs ?? [];
  const days = data?.days ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Cleanups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Refreshes every 15 seconds. Scheduled cleanup runs every 15 minutes. Runs are kept for 7 days, then folded into one row per day.
          </p>
          {data?.policy && <p className="mt-1 text-sm"><span className="font-semibold">Policy:</span> {data.policy}</p>}
        </div>
        <Button variant="outline" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCcw className="size-4" />
          Refresh
        </Button>
      </header>
      {error && <p role="alert" className={`shrink-0 ${tones.error}`}>{error} Use Refresh to retry.</p>}
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Lifetime runs" value={data?.total ?? 0} icon={History} />
        <StatTile
          label="Completion rate"
          value={finished && data ? `${(data.completed / finished * 100).toFixed(1)}%` : "-"}
          icon={CheckCircle2}
          accent="var(--ok)"
        />
        <StatTile label="Failed" value={data?.failed ?? 0} icon={XCircle} accent="var(--danger)" />
        <StatTile label="Unfinished" value={data?.running ?? 0} icon={CircleDashed} accent="var(--warn)" />
      </div>
      <Tabs defaultValue="runs" className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="shrink-0">
          <TabsTrigger value="runs">
            Runs
            <Badge variant="muted" className="ml-1.5 h-4 text-[0.6rem]">{data?.pageTotal ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="days">
            Archived days
            <Badge variant="muted" className="ml-1.5 h-4 text-[0.6rem]">{days.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="runs" className="flex min-h-0 flex-1 flex-col gap-3">
          <Surface pad="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DataTable
              className="min-h-0 flex-1"
              tableKey="cleanup-runs"
              columns={runColumns(runs)}
              rows={runs}
              rowKey={(run) => run.id}
              empty={loading ? "Loading cleanup history..." : "No cleanup runs recorded yet."}
            />
          </Surface>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil((data?.pageTotal ?? 0) / pageSize))}
            total={data?.pageTotal ?? 0}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </TabsContent>
        <TabsContent value="days" className="flex min-h-0 flex-1 flex-col gap-3">
          <Surface pad="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DataTable
              className="min-h-0 flex-1"
              tableKey="cleanup-days"
              columns={dayColumns(days)}
              rows={days}
              rowKey={(day) => day.day}
              empty="No archived days yet. Runs fold into a day once they are a week old."
            />
          </Surface>
        </TabsContent>
      </Tabs>
    </div>
  );
}
