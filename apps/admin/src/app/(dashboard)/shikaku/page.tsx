"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Search, TimerReset, Trophy, Trash2 } from "lucide-react";
import { api } from "@/lib/client-api";
import {
  formatDateTime,
  formatDurationMs,
  fromLocalDateTimeValue,
  normalizeSearchText,
  ShikakuScoreRecord,
  shortId,
  toLocalDateTimeValue,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Pagination } from "@/components/Pagination";
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

const DIFFICULTIES = ["all", "easy", "medium", "hard", "expert"] as const;

type DifficultyFilter = (typeof DIFFICULTIES)[number];
type DifficultyValue = ShikakuScoreRecord["difficulty"];

type ScoreDraft = {
  sessionId: string;
  name: string;
  seed: string;
  difficulty: DifficultyValue;
  score: string;
  timeMs: string;
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

function createDraft(score: ShikakuScoreRecord): ScoreDraft {
  return {
    sessionId: score.sessionId,
    name: score.name,
    seed: String(score.seed),
    difficulty: score.difficulty,
    score: String(score.score),
    timeMs: String(score.timeMs),
    puzzleCount: String(score.puzzleCount),
    createdAt: toLocalDateTimeValue(score.createdAt),
  };
}

function difficultyTone(difficulty: DifficultyValue) {
  if (difficulty === "easy") {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-50";
  }
  if (difficulty === "medium") {
    return "border-amber-300/20 bg-amber-300/10 text-amber-50";
  }
  if (difficulty === "hard") {
    return "border-rose-300/20 bg-rose-300/10 text-rose-50";
  }
  return "border-violet-300/20 bg-violet-300/10 text-violet-50";
}

export default function ShikakuPage() {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [scores, setScores] = useState<ShikakuScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedScore, setSelectedScore] = useState<ShikakuScoreRecord | null>(null);
  const [draft, setDraft] = useState<ScoreDraft | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [difficulty]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (difficulty !== "all") {
          params.set("difficulty", difficulty);
        }

        const response = await api(`/shikaku/scores?${params}`);
        if (cancelled) {
          return;
        }

        setScores((response.scores ?? []) as ShikakuScoreRecord[]);
        setTotal(response.total ?? 0);
        setTotalPages(Math.max(1, response.totalPages ?? 1));
      } catch (error) {
        if (!cancelled) {
          show(error instanceof Error ? error.message : "Unable to load Shikaku scores.", "error");
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
  }, [difficulty, page, pageSize, refreshKey, show]);

  const normalizedSearch = normalizeSearchText(search);

  const visibleScores = useMemo(() => {
    return scores.filter((score) => {
      if (!normalizedSearch) {
        return true;
      }
      return [score.name, score.sessionId, score.difficulty, String(score.seed)].some((value) =>
        normalizeSearchText(value).includes(normalizedSearch)
      );
    });
  }, [normalizedSearch, scores]);

  const summary = useMemo(() => {
    const bestScore = visibleScores.reduce((max, score) => Math.max(max, score.score), 0);
    const fastestTime = visibleScores.reduce(
      (fastest, score) => Math.min(fastest, score.timeMs),
      Number.POSITIVE_INFINITY
    );
    const puzzleAverage =
      visibleScores.length > 0
        ? Math.round(
            visibleScores.reduce((sum, score) => sum + score.puzzleCount, 0) / visibleScores.length
          )
        : 0;

    return {
      loaded: visibleScores.length,
      bestScore,
      fastestTime,
      puzzleAverage,
    };
  }, [visibleScores]);

  const openEditor = (score: ShikakuScoreRecord) => {
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
    const nextScore = Number(draft.score);
    const nextTimeMs = Number(draft.timeMs);
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
    if (draft.difficulty !== selectedScore.difficulty) {
      payload.difficulty = draft.difficulty;
    }
    if (Number.isFinite(nextScore) && nextScore >= 0 && nextScore !== selectedScore.score) {
      payload.score = nextScore;
    }
    if (Number.isFinite(nextTimeMs) && nextTimeMs >= 0 && nextTimeMs !== selectedScore.timeMs) {
      payload.timeMs = nextTimeMs;
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
      await api(`/shikaku/scores/${selectedScore.id}`, {
        method: "PATCH",
        body: payload,
      });
      show("Shikaku entry updated.", "success");
      closeEditor();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to update Shikaku entry.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const deleteScore = async (score: ShikakuScoreRecord) => {
    const confirmed = await confirm({
      title: "Delete score entry?",
      description: `Remove ${score.name}'s Shikaku record permanently from the leaderboard.`,
      confirmLabel: "Delete entry",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    setPendingAction(`delete-${score.id}`);
    try {
      await api(`/shikaku/scores/${score.id}`, { method: "DELETE" });
      show("Shikaku entry deleted.", "success");
      if (selectedScore?.id === score.id) {
        closeEditor();
      }
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to delete Shikaku entry.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const clearScores = async () => {
    const label = difficulty === "all" ? "all scores" : `${difficulty} scores`;
    const confirmed = await confirm({
      title: `Delete ${label}?`,
      description: "This clears the selected score set permanently and cannot be undone.",
      confirmLabel: "Clear scores",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    setPendingAction("clear");
    try {
      await api("/shikaku/scores", {
        method: "DELETE",
        body: difficulty === "all" ? {} : { difficulty },
      });
      show(`Cleared ${label}.`, "success");
      closeEditor();
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to clear scores.", "error");
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
              label: "Loaded entries",
              value: summary.loaded.toLocaleString(),
              icon: Trophy,
            },
            {
              label: "Best score",
              value: summary.bestScore.toLocaleString(),
              icon: Edit3,
            },
            {
              label: "Fastest time",
              value:
                summary.fastestTime === Number.POSITIVE_INFINITY
                  ? "--"
                  : formatDurationMs(summary.fastestTime),
              icon: TimerReset,
            },
            {
              label: "Average puzzles",
              value: summary.puzzleAverage.toLocaleString(),
              icon: Search,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-[20px] border border-white/8 bg-[#111b2a] px-4 py-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by player, session, seed, or difficulty"
                className="border-white/8 bg-[#0d1624] pl-11 text-slate-50"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={difficulty === value ? "default" : "outline"}
                  className={
                    difficulty === value
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]"
                  }
                  onClick={() => setDifficulty(value)}
                >
                  {value === "all" ? "All difficulties" : value}
                </Button>
              ))}
            </div>
          </div>

          <Button
            variant="destructive"
            className="border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22"
            disabled={pendingAction === "clear"}
            onClick={() => void clearScores()}
          >
            <Trash2 className="size-4" />
            Clear {difficulty === "all" ? "all" : difficulty} scores
          </Button>
        </div>
      </Surface>

      <Surface className="mt-4">
        <div className="overflow-hidden rounded-[20px] border border-white/8 bg-[#0d1624]">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-slate-400">Rank</TableHead>
                <TableHead className="text-slate-400">Player</TableHead>
                <TableHead className="text-slate-400">Difficulty</TableHead>
                <TableHead className="text-slate-400">Score</TableHead>
                <TableHead className="text-slate-400">Time</TableHead>
                <TableHead className="text-slate-400">Puzzles</TableHead>
                <TableHead className="text-slate-400">Seed</TableHead>
                <TableHead className="text-slate-400">Session</TableHead>
                <TableHead className="text-slate-400">Submitted</TableHead>
                <TableHead className="text-slate-400">Actions</TableHead>
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
                  <TableCell colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                    No Shikaku entries match the current search.
                  </TableCell>
                </TableRow>
              ) : (
                visibleScores.map((score, index) => (
                  <TableRow key={score.id} className="border-white/8 hover:bg-[#142033]">
                    <TableCell className="text-slate-400">{(page - 1) * pageSize + index + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium text-white">{score.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{shortId(score.id, 14)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`border ${difficultyTone(score.difficulty)}`}>
                        {score.difficulty}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-200">{score.score.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-200">{formatDurationMs(score.timeMs)}</TableCell>
                    <TableCell className="text-slate-200">{score.puzzleCount}</TableCell>
                    <TableCell className="font-mono text-sm text-slate-300">{score.seed}</TableCell>
                    <TableCell className="font-mono text-sm text-slate-300">{shortId(score.sessionId, 14)}</TableCell>
                    <TableCell className="text-sm text-slate-400">{formatDateTime(score.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]"
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

      <Dialog open={Boolean(selectedScore && draft)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-w-[min(860px,95vw)] border-white/8 bg-[#0d1624]/96 text-foreground shadow-[0_36px_120px_-52px_rgba(0,0,0,0.96)]">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Edit Shikaku entry</DialogTitle>
            <DialogDescription className="text-slate-300/74">
              Every persisted field on the score record is editable here, including the timestamp and source session id.
            </DialogDescription>
          </DialogHeader>

          {selectedScore && draft ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Session id
                  </label>
                  <Input
                    value={draft.sessionId}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, sessionId: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Player name
                  </label>
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, name: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Difficulty
                  </label>
                  <select
                    value={draft.difficulty}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, difficulty: event.target.value as DifficultyValue } : current
                      )
                    }
                    className="h-10 w-full rounded-xl border border-white/8 bg-[#0d1624] px-4 text-sm text-slate-50 outline-none"
                  >
                    {DIFFICULTIES.filter((value) => value !== "all").map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Submitted at
                  </label>
                  <Input
                    type="datetime-local"
                    value={draft.createdAt}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, createdAt: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-slate-50"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Seed
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.seed}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, seed: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Score
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.score}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, score: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Time in ms
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.timeMs}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, timeMs: event.target.value } : current))
                    }
                    className="border-white/8 bg-[#0d1624] text-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Puzzle count
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.puzzleCount}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, puzzleCount: event.target.value } : current))
                    }
                    className="rounded-full border-white/10 bg-white/4 text-slate-50"
                  />
                </div>
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
              Delete entry
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]"
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
