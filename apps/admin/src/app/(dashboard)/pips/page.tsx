"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Dice5, Edit3, PlusCircle, Search, TimerReset, Trash2, Trophy } from "lucide-react";
import { api } from "@/lib/client-api";
import {
  formatDateTime,
  fromLocalDateTimeValue,
  normalizeSearchText,
  PipsScoreRecord,
  shortId,
  toLocalDateTimeValue,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScoreCreateDialog } from "@/components/admin/score-create-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type ScoreDraft = {
  sessionId: string;
  name: string;
  seed: string;
  totalMs: string;
  easyMs: string;
  mediumMs: string;
  hardMs: string;
  puzzleCount: string;
  createdAt: string;
};

function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[24px] border border-white/8 bg-[#0f1826] p-5 ${className}`}>
      {children}
    </section>
  );
}

function createDraft(score: PipsScoreRecord): ScoreDraft {
  return {
    sessionId: score.sessionId,
    name: score.name,
    seed: String(score.seed),
    totalMs: String(score.totalMs),
    easyMs: String(score.easyMs),
    mediumMs: String(score.mediumMs),
    hardMs: String(score.hardMs),
    puzzleCount: String(score.puzzleCount),
    createdAt: toLocalDateTimeValue(score.createdAt),
  };
}

function formatPreciseTime(milliseconds: number) {
  const safeMs = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const tenths = Math.floor((safeMs % 1000) / 100);
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}` : `${seconds}.${tenths}s`;
}

export default function PipsAdminPage() {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [scores, setScores] = useState<PipsScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedScore, setSelectedScore] = useState<PipsScoreRecord | null>(null);
  const [draft, setDraft] = useState<ScoreDraft | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        const response = await api(`/pips/scores?${params}`);
        if (cancelled) {
          return;
        }

        setScores((response.scores ?? []) as PipsScoreRecord[]);
        setTotal(response.total ?? 0);
        setTotalPages(Math.max(1, response.totalPages ?? 1));
      } catch (error) {
        if (!cancelled) {
          show(error instanceof Error ? error.message : "Unable to load Pips runs.", "error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, refreshKey, show]);

  const normalizedSearch = normalizeSearchText(search);

  const visibleScores = useMemo(() => {
    return scores.filter((score) => {
      if (!normalizedSearch) {
        return true;
      }
      return [score.name, score.sessionId, String(score.seed), String(score.totalMs), String(score.easyMs), String(score.mediumMs), String(score.hardMs)].some((value) =>
        normalizeSearchText(value).includes(normalizedSearch)
      );
    });
  }, [normalizedSearch, scores]);

  const summary = useMemo(() => {
    const fastestTotal = visibleScores.reduce(
      (fastest, score) => Math.min(fastest, score.totalMs),
      Number.POSITIVE_INFINITY
    );
    const averageTotal =
      visibleScores.length > 0
        ? Math.round(visibleScores.reduce((sum, score) => sum + score.totalMs, 0) / visibleScores.length)
        : 0;
    const averageHard =
      visibleScores.length > 0
        ? Math.round(visibleScores.reduce((sum, score) => sum + score.hardMs, 0) / visibleScores.length)
        : 0;

    return {
      loaded: visibleScores.length,
      fastestTotal,
      averageTotal,
      averageHard,
    };
  }, [visibleScores]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      show(`${label} copied.`, "success");
    } catch {
      show(`Unable to copy ${label.toLowerCase()}.`, "error");
    }
  };

  const openEditor = (score: PipsScoreRecord) => {
    setSelectedScore(score);
    setDraft(createDraft(score));
  };

  const closeEditor = () => {
    setSelectedScore(null);
    setDraft(null);
  };

  const saveScore = async () => {
    if (!selectedScore || !draft) {
      return;
    }

    const payload: Record<string, unknown> = {};
    const nextSessionId = draft.sessionId.trim();
    const nextName = draft.name.trim();
    const nextSeed = Number(draft.seed);
    const nextTotalMs = Number(draft.totalMs);
    const nextEasyMs = Number(draft.easyMs);
    const nextMediumMs = Number(draft.mediumMs);
    const nextHardMs = Number(draft.hardMs);
    const nextPuzzleCount = Number(draft.puzzleCount);
    const nextCreatedAt = fromLocalDateTimeValue(draft.createdAt);

    if (nextSessionId && nextSessionId !== selectedScore.sessionId) {
      payload.sessionId = nextSessionId;
    }
    if (nextName && nextName !== selectedScore.name) {
      payload.name = nextName;
    }
    if (Number.isInteger(nextSeed) && nextSeed >= 0 && nextSeed !== selectedScore.seed) {
      payload.seed = nextSeed;
    }
    if (Number.isFinite(nextTotalMs) && nextTotalMs >= 0 && nextTotalMs !== selectedScore.totalMs) {
      payload.totalMs = Math.floor(nextTotalMs);
    }
    if (Number.isFinite(nextEasyMs) && nextEasyMs >= 0 && nextEasyMs !== selectedScore.easyMs) {
      payload.easyMs = Math.floor(nextEasyMs);
    }
    if (Number.isFinite(nextMediumMs) && nextMediumMs >= 0 && nextMediumMs !== selectedScore.mediumMs) {
      payload.mediumMs = Math.floor(nextMediumMs);
    }
    if (Number.isFinite(nextHardMs) && nextHardMs >= 0 && nextHardMs !== selectedScore.hardMs) {
      payload.hardMs = Math.floor(nextHardMs);
    }
    if (
      Number.isInteger(nextPuzzleCount) &&
      nextPuzzleCount >= 0 &&
      nextPuzzleCount !== selectedScore.puzzleCount
    ) {
      payload.puzzleCount = nextPuzzleCount;
    }
    if (nextCreatedAt > 0 && nextCreatedAt !== selectedScore.createdAt) {
      payload.createdAt = nextCreatedAt;
    }

    if (Object.keys(payload).length === 0) {
      closeEditor();
      return;
    }

    setPendingAction(`save-${selectedScore.id}`);
    try {
      await api(`/pips/scores/${selectedScore.id}`, {
        method: "PATCH",
        body: payload,
      });
      show("Pips run updated.", "success");
      closeEditor();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to update Pips run.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const deleteScore = async (score: PipsScoreRecord) => {
    const confirmed = await confirm({
      title: "Delete Pips run?",
      description: `Remove ${score.name}'s Pips run permanently from the leaderboard.`,
      confirmLabel: "Delete run",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    setPendingAction(`delete-${score.id}`);
    try {
      await api(`/pips/scores/${score.id}`, { method: "DELETE" });
      show("Pips run deleted.", "success");
      if (selectedScore?.id === score.id) {
        closeEditor();
      }
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to delete Pips run.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const clearScores = async () => {
    const confirmed = await confirm({
      title: "Delete all Pips runs?",
      description: "This clears every persisted Pips leaderboard entry and cannot be undone.",
      confirmLabel: "Clear runs",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    setPendingAction("clear");
    try {
      await api("/pips/scores", {
        method: "DELETE",
        body: {},
      });
      show("Cleared all Pips runs.", "success");
      closeEditor();
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to clear Pips runs.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <>
      <Surface>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Loaded runs",
              value: summary.loaded.toLocaleString(),
              icon: Trophy,
            },
            {
              label: "Fastest total",
              value:
                summary.fastestTotal === Number.POSITIVE_INFINITY
                  ? "--"
                  : formatPreciseTime(summary.fastestTotal),
              icon: TimerReset,
            },
            {
              label: "Average total",
              value: summary.averageTotal > 0 ? formatPreciseTime(summary.averageTotal) : "--",
              icon: Dice5,
            },
            {
              label: "Average hard",
              value: summary.averageHard > 0 ? formatPreciseTime(summary.averageHard) : "--",
              icon: Search,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-[20px] border border-white/8 bg-[#111b2a] p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                  <Icon className="size-4" />
                  {item.label}
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>
      </Surface>

      <Surface className="mt-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by player, session, seed, or split time"
              className="border-white/8 bg-[#0d1624] pl-11 text-zinc-50"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-orange-300 text-orange-950 hover:bg-orange-200"
              onClick={() => setCreateOpen(true)}
            >
              <PlusCircle className="size-4" />
              Add run
            </Button>
            <Button
              variant="destructive"
              className="border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22"
              disabled={pendingAction === "clear"}
              onClick={() => void clearScores()}
            >
              <Trash2 className="size-4" />
              Clear all runs
            </Button>
          </div>
        </div>
      </Surface>

      <Surface className="mt-4">
        <div className="overflow-hidden rounded-[20px] border border-white/8 bg-[#0d1624]">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-zinc-400">Rank</TableHead>
                <TableHead className="text-zinc-400">Player</TableHead>
                <TableHead className="text-zinc-400">Total</TableHead>
                <TableHead className="text-zinc-400">Easy</TableHead>
                <TableHead className="text-zinc-400">Medium</TableHead>
                <TableHead className="text-zinc-400">Hard</TableHead>
                <TableHead className="text-zinc-400">Seed</TableHead>
                <TableHead className="text-zinc-400">Session</TableHead>
                <TableHead className="text-zinc-400">Submitted</TableHead>
                <TableHead className="text-zinc-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && scores.length === 0 ? (
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableCell colSpan={10} className="px-4 py-5">
                    <div className="space-y-2">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 bg-white/5" />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ) : visibleScores.length === 0 ? (
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableCell colSpan={10} className="px-4 py-12 text-center text-sm text-zinc-500">
                    No Pips runs match the current search.
                  </TableCell>
                </TableRow>
              ) : (
                visibleScores.map((score, index) => (
                  <TableRow key={score.id} className="border-white/8 hover:bg-[#142033]">
                    <TableCell className="text-zinc-400">{(page - 1) * pageSize + index + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium text-white">{score.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{shortId(score.id, 14)}</div>
                    </TableCell>
                    <TableCell className="font-semibold text-orange-100">{formatPreciseTime(score.totalMs)}</TableCell>
                    <TableCell className="text-zinc-200">{formatPreciseTime(score.easyMs)}</TableCell>
                    <TableCell className="text-zinc-200">{formatPreciseTime(score.mediumMs)}</TableCell>
                    <TableCell className="text-zinc-200">{formatPreciseTime(score.hardMs)}</TableCell>
                    <TableCell>
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 font-mono text-sm text-zinc-300 transition-colors hover:bg-white/[0.08]"
                        type="button"
                        onClick={() => void copyText(String(score.seed), "Seed")}
                      >
                        <Copy className="size-3" />
                        {score.seed}
                      </button>
                    </TableCell>
                    <TableCell>
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 font-mono text-sm text-zinc-300 transition-colors hover:bg-white/[0.08]"
                        type="button"
                        onClick={() => void copyText(score.sessionId, "Session id")}
                      >
                        <Copy className="size-3" />
                        {shortId(score.sessionId, 14)}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-400">{formatDateTime(score.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-white/8 bg-[#0d1624] text-zinc-100 hover:bg-white/[0.06]"
                          onClick={() => openEditor(score)}
                        >
                          <Edit3 className="size-4" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22"
                          disabled={pendingAction === `delete-${score.id}`}
                          onClick={() => void deleteScore(score)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
          />
        </div>
      </Surface>

      <ScoreCreateDialog
        game="pips"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setPage(1);
          setRefreshKey((value) => value + 1);
        }}
      />

      <Dialog open={Boolean(selectedScore && draft)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="[--dialog-content-width:66rem] 2xl:[--dialog-content-width:72rem] border-white/8 bg-[#0d1624]/96 text-foreground shadow-[0_36px_120px_-52px_rgba(0,0,0,0.96)]">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Edit Pips run</DialogTitle>
            <DialogDescription className="text-zinc-300/74">
              Adjust the persisted run, including total time, individual splits, seed, player name, and source session.
            </DialogDescription>
          </DialogHeader>

          {selectedScore && draft ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label htmlFor="pips-session-id" className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Session id
                  </label>
                  <Input
                    id="pips-session-id"
                    value={draft.sessionId}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, sessionId: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-zinc-50"
                  />
                </div>
                <div>
                  <label htmlFor="pips-player-name" className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Player name
                  </label>
                  <Input
                    id="pips-player-name"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, name: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-zinc-50"
                  />
                </div>
                <div>
                  <label htmlFor="pips-seed" className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Seed
                  </label>
                  <Input
                    id="pips-seed"
                    type="number"
                    min={0}
                    value={draft.seed}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, seed: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-zinc-50"
                  />
                </div>
                <div>
                  <label htmlFor="pips-created-at" className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Submitted at
                  </label>
                  <Input
                    id="pips-created-at"
                    type="datetime-local"
                    value={draft.createdAt}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, createdAt: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-zinc-50"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {[
                  ["pips-total-ms", "Total time in ms", "totalMs"],
                  ["pips-easy-ms", "Easy split in ms", "easyMs"],
                  ["pips-medium-ms", "Medium split in ms", "mediumMs"],
                  ["pips-hard-ms", "Hard split in ms", "hardMs"],
                  ["pips-puzzle-count", "Puzzle count", "puzzleCount"],
                ].map(([id, label, key]) => (
                  <div key={id}>
                    <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      {label}
                    </label>
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      value={draft[key as keyof ScoreDraft]}
                      onChange={(event) =>
                        setDraft((current) => (current ? { ...current, [key]: event.target.value } : current))
                      }
                      className="border-white/8 bg-[#0d1624] text-zinc-50"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="destructive"
              className="border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22"
              disabled={!selectedScore || pendingAction === `delete-${selectedScore?.id}`}
              onClick={() => selectedScore && void deleteScore(selectedScore)}
            >
              <Trash2 className="size-4" />
              Delete run
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-white/8 bg-[#0d1624] text-zinc-100 hover:bg-white/[0.06]"
                onClick={closeEditor}
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedScore || !draft || pendingAction === `save-${selectedScore?.id}`}
                onClick={() => void saveScore()}
              >
                Save changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
