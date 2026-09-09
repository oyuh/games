"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";

type Run = {
  id: string;
  trigger: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  report: { label: string; value: string; tone: string }[] | null;
};
type History = { runs: Run[]; total: number; completed: number; failed: number; running: number; pageSize: number };
const tones: Record<string, string> = {
  info: "text-blue-700 dark:text-blue-300",
  success: "text-green-800 dark:text-green-300",
  warning: "text-amber-800 dark:text-amber-300",
  error: "text-red-700 dark:text-red-300",
};

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
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));
  const finished = (data?.completed ?? 0) + (data?.failed ?? 0);
  return (
    <div className="h-full overflow-y-auto space-y-6 p-1">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cleanups</h1>
          <p className="mt-1 text-sm text-muted-foreground">Saved run history. Refreshes every 15 seconds. Scheduled cleanup runs every 15 minutes.</p>
        </div>
        <Button className="min-h-11 min-w-11" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</Button>
      </header>
      {error && <p role="alert" className={tones.error}>{error} Use Refresh to retry.</p>}
      {data && <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {[["Lifetime runs", data.total], ["Completion rate", finished ? `${(data.completed / finished * 100).toFixed(1)}%` : "No finished runs"], ["Failed", data.failed], ["Unfinished", data.running]].map(([label, value]) => (
          <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>
        ))}
      </dl>}
      <p className="text-sm text-muted-foreground">History starts when cleanup tracking is deployed. Older console output is unavailable here. Completion rate uses finished runs only.</p>
      {loading ? <p role="status" className="min-h-24">Loading cleanup history...</p> : data?.runs.length === 0 ? <p>No cleanup runs recorded yet.</p> : <div className="space-y-5">
        {data?.runs.map((run) => <details key={run.id} className="bg-muted/30 p-3" open={data.runs[0]?.id === run.id}>
          <summary className="min-h-11 cursor-pointer rounded-sm py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <span className={run.status === "failed" ? tones.error : run.status === "completed" ? tones.success : tones.warning}>{run.status === "running" ? "Unfinished" : run.status === "completed" ? "Completed" : "Failed"}</span>
            <span className="ml-3"><time dateTime={new Date(run.startedAt).toISOString()}>{new Date(run.startedAt).toLocaleString()}</time></span>
            <span className="ml-3 text-sm text-muted-foreground">{run.trigger}{run.finishedAt !== null ? `, ${((run.finishedAt - run.startedAt) / 1000).toFixed(2)}s` : ""}</span>
          </summary>
          <dl className="mt-3 space-y-4 font-mono text-sm">
            {run.report?.map((line) => <div key={line.label}><dt className={`font-semibold ${tones[line.tone] ?? tones.info}`}>{line.label}</dt><dd className="mt-1 break-words leading-relaxed">{line.value}</dd></div>)}
          </dl>
          {!run.finishedAt && <p className="mt-3 text-sm text-muted-foreground">This run has not reported completion. It may still be running or the server may have stopped.</p>}
        </details>)}
      </div>}
      <nav aria-label="Cleanup history pages" className="flex flex-wrap items-center gap-4">
        <Button className="min-h-11 min-w-11" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-sm">Page {page} of {pages}</span>
        <Button className="min-h-11 min-w-11" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
      </nav>
    </div>
  );
}
