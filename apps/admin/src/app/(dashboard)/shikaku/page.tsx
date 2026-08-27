"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Edit3,
  PlusCircle,
  Search,
  TimerReset,
  MoreHorizontal,
  Trophy,
  Trash2,
} from "lucide-react";
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
import { ScoreCreateDialog } from "@/components/admin/score-create-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { CopyChip } from "@/components/ui/copy-chip";
import { Column, DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DIFFICULTIES = ["all", "easy", "medium", "hard", "expert"] as const;

type DifficultyFilter = (typeof DIFFICULTIES)[number];
type DifficultyValue = ShikakuScoreRecord["difficulty"];

const EDITABLE_DIFFICULTIES: readonly DifficultyValue[] = [
  "easy",
  "medium",
  "hard",
  "expert",
];

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

/**
 * The colours the site itself draws each difficulty in, from DIFF_ACCENT in
 * apps/api/src/shikaku-image.ts. The old version painted easy and medium
 * identically and invented a rose and a violet that appear nowhere else.
 */
const DIFFICULTY_ACCENT: Record<DifficultyValue, string> = {
  easy: "#34d399",
  medium: "#60a5fa",
  hard: "#f59e0b",
  expert: "#f87171",
};

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
  const [selectedScore, setSelectedScore] = useState<ShikakuScoreRecord | null>(
    null,
  );
  const [draft, setDraft] = useState<ScoreDraft | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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
          show(
            error instanceof Error
              ? error.message
              : "Unable to load Shikaku scores.",
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
      return [
        score.name,
        score.sessionId,
        score.difficulty,
        String(score.seed),
      ].some((value) => normalizeSearchText(value).includes(normalizedSearch));
    });
  }, [normalizedSearch, scores]);

  const summary = useMemo(() => {
    const bestScore = visibleScores.reduce(
      (max, score) => Math.max(max, score.score),
      0,
    );
    const fastestTime = visibleScores.reduce(
      (fastest, score) => Math.min(fastest, score.timeMs),
      Number.POSITIVE_INFINITY,
    );
    const puzzleAverage =
      visibleScores.length > 0
        ? Math.round(
            visibleScores.reduce((sum, score) => sum + score.puzzleCount, 0) /
              visibleScores.length,
          )
        : 0;

    return {
      loaded: visibleScores.length,
      bestScore,
      fastestTime,
      puzzleAverage,
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
    if (
      Number.isInteger(nextSeed) &&
      nextSeed >= 0 &&
      nextSeed !== selectedScore.seed
    ) {
      payload.seed = nextSeed;
    }
    if (draft.difficulty !== selectedScore.difficulty) {
      payload.difficulty = draft.difficulty;
    }
    if (
      Number.isFinite(nextScore) &&
      nextScore >= 0 &&
      nextScore !== selectedScore.score
    ) {
      payload.score = nextScore;
    }
    if (
      Number.isFinite(nextTimeMs) &&
      nextTimeMs >= 0 &&
      nextTimeMs !== selectedScore.timeMs
    ) {
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
      show(
        error instanceof Error
          ? error.message
          : "Unable to update Shikaku entry.",
        "error",
      );
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
      show(
        error instanceof Error
          ? error.message
          : "Unable to delete Shikaku entry.",
        "error",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const clearScores = async () => {
    const label = difficulty === "all" ? "all scores" : `${difficulty} scores`;
    const confirmed = await confirm({
      title: `Delete ${label}?`,
      description:
        "This clears the selected score set permanently and cannot be undone.",
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
      show(
        error instanceof Error ? error.message : "Unable to clear scores.",
        "error",
      );
    } finally {
      setPendingAction(null);
    }
  };

  // Built fresh each render on purpose. Memoising would mean turning every
  // handler above into a useCallback just to keep the deps honest.
  const columns: Column<ShikakuScoreRecord>[] = [
    {
      id: "rank",
      header: "Rank",
      width: 76,
      align: "right",
      cell: (score) => (
        <span className="text-muted-foreground">
          {(page - 1) * pageSize + visibleScores.indexOf(score) + 1}
        </span>
      ),
    },
    {
      id: "name",
      header: "Player",
      width: 190,
      sortValue: (score) => score.name,
      cell: (score) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{score.name}</div>
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {shortId(score.id, 14)}
          </div>
        </div>
      ),
    },
    {
      id: "difficulty",
      header: "Difficulty",
      width: 120,
      sortValue: (score) => score.difficulty,
      cell: (score) => (
        <Badge
          variant="accent"
          accent={DIFFICULTY_ACCENT[score.difficulty] ?? "var(--primary)"}
          className="capitalize"
        >
          {score.difficulty}
        </Badge>
      ),
    },
    {
      id: "score",
      header: "Score",
      width: 100,
      align: "right",
      sortValue: (score) => score.score,
      cell: (score) => (
        <span className="font-semibold text-foreground">
          {score.score.toLocaleString()}
        </span>
      ),
    },
    {
      id: "timeMs",
      header: "Time",
      width: 110,
      align: "right",
      sortValue: (score) => score.timeMs,
      cell: (score) => formatDurationMs(score.timeMs),
    },
    {
      id: "puzzleCount",
      header: "Puzzles",
      width: 90,
      align: "right",
      sortValue: (score) => score.puzzleCount,
      cell: (score) => score.puzzleCount,
    },
    {
      id: "seed",
      header: "Seed",
      width: 130,
      sortValue: (score) => score.seed,
      cell: (score) => (
        <CopyChip
          label={String(score.seed)}
          onCopy={() => void copyText(String(score.seed), "Seed")}
        />
      ),
    },
    {
      id: "sessionId",
      header: "Session",
      width: 170,
      sortValue: (score) => score.sessionId,
      cell: (score) => (
        <CopyChip
          label={shortId(score.sessionId, 14)}
          onCopy={() => void copyText(score.sessionId, "Session id")}
        />
      ),
    },
    {
      id: "createdAt",
      header: "Submitted",
      width: 170,
      sortValue: (score) => score.createdAt,
      cell: (score) => (
        <span className="text-muted-foreground">
          {formatDateTime(score.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      width: 80,
      align: "right",
      alwaysVisible: true,
      cell: (score) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Row actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openEditor(score)}>
              <Edit3 />
              Edit entry
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={pendingAction === `delete-${score.id}`}
              onSelect={() => void deleteScore(score)}
            >
              <Trash2 />
              Delete entry
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

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
              <div
                key={item.label}
                className="rounded-lg border border-border bg-muted/40 p-4"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  <Icon className="size-4" />
                  {item.label}
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-normal text-foreground">
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
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by player, session, seed, or difficulty"
                className="border-border bg-card pl-11 text-foreground"
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
                      : "border-border bg-card text-foreground hover:bg-accent"
                  }
                  onClick={() => setDifficulty(value)}
                >
                  {value === "all" ? "All difficulties" : value}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setCreateOpen(true)}
            >
              <PlusCircle className="size-4" />
              Add score
            </Button>
            <Button
              variant="destructive"
              className="border border-border bg-muted text-foreground hover:bg-accent"
              disabled={pendingAction === "clear"}
              onClick={() => void clearScores()}
            >
              <Trash2 className="size-4" />
              Clear {difficulty === "all" ? "all" : difficulty} scores
            </Button>
          </div>
        </div>
      </Surface>

      <Surface className="mt-4">
        {loading && scores.length === 0 ? (
          <div className="space-y-2">
            {/* Match the skeleton count to the page size so the layout does not
                jump when the real rows land. */}
            {Array.from({ length: Math.min(pageSize, 12) }).map((_, index) => (
              <Skeleton key={index} className="h-12 bg-muted" />
            ))}
          </div>
        ) : (
          <DataTable
            tableKey="shikaku-scores"
            columns={columns}
            rows={visibleScores}
            rowKey={(score) => score.id}
            empty="No Shikaku entries match the current search."
          />
        )}

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
        game="shikaku"
        open={createOpen}
        defaultDifficulty={difficulty === "all" ? "easy" : difficulty}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setPage(1);
          setRefreshKey((value) => value + 1);
        }}
      />

      <Dialog
        open={Boolean(selectedScore && draft)}
        onOpenChange={(open) => !open && closeEditor()}
      >
        <DialogContent className="[--dialog-content-width:66rem] 2xl:[--dialog-content-width:72rem] border-border bg-card text-foreground shadow-none">
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground">
              Edit Shikaku entry
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Every persisted field on the score record is editable here,
              including the timestamp and source session id.
            </DialogDescription>
          </DialogHeader>

          {selectedScore && draft ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="score-session-id" className="mb-2">
                    Session id
                  </Label>
                  <Input
                    id="score-session-id"
                    value={draft.sessionId}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, sessionId: event.target.value }
                          : current,
                      )
                    }
                    className="border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="score-player-name" className="mb-2">
                    Player name
                  </Label>
                  <Input
                    id="score-player-name"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, name: event.target.value }
                          : current,
                      )
                    }
                    className="border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="score-difficulty" className="mb-2">
                    Difficulty
                  </Label>
                  <Select
                    value={draft.difficulty}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current
                          ? { ...current, difficulty: value as DifficultyValue }
                          : current,
                      )
                    }
                  >
                    <SelectTrigger id="score-difficulty" className="h-10 w-full capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EDITABLE_DIFFICULTIES.map((value) => (
                        <SelectItem key={value} value={value} className="capitalize">
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="score-created-at" className="mb-2">
                    Submitted at
                  </Label>
                  <Input
                    id="score-created-at"
                    type="datetime-local"
                    value={draft.createdAt}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, createdAt: event.target.value }
                          : current,
                      )
                    }
                    className="border-border bg-card text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="score-seed" className="mb-2">
                    Seed
                  </Label>
                  <Input
                    id="score-seed"
                    type="number"
                    min={0}
                    value={draft.seed}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, seed: event.target.value }
                          : current,
                      )
                    }
                    className="border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="score-score" className="mb-2">
                    Score
                  </Label>
                  <Input
                    id="score-score"
                    type="number"
                    min={0}
                    value={draft.score}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, score: event.target.value }
                          : current,
                      )
                    }
                    className="border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="score-time-ms" className="mb-2">
                    Time in ms
                  </Label>
                  <Input
                    id="score-time-ms"
                    type="number"
                    min={0}
                    value={draft.timeMs}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, timeMs: event.target.value }
                          : current,
                      )
                    }
                    className="border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="score-puzzle-count" className="mb-2">
                    Puzzle count
                  </Label>
                  <Input
                    id="score-puzzle-count"
                    type="number"
                    min={0}
                    value={draft.puzzleCount}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, puzzleCount: event.target.value }
                          : current,
                      )
                    }
                    className="rounded-lg border-border bg-muted text-foreground"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="destructive"
              className="border border-border bg-muted text-foreground hover:bg-accent"
              disabled={
                !selectedScore ||
                pendingAction === `delete-${selectedScore?.id}`
              }
              onClick={() => selectedScore && void deleteScore(selectedScore)}
            >
              <Trash2 className="size-4" />
              Delete entry
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-border bg-card text-foreground hover:bg-accent"
                onClick={closeEditor}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !selectedScore ||
                  !draft ||
                  pendingAction === `save-${selectedScore?.id}`
                }
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
