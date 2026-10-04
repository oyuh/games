"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Edit3,
  Grid3x3,
  LayoutGrid,
  MoreHorizontal,
  PlusCircle,
  Search,
  TimerReset,
  Trash2,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/client-api";
import {
  formatDateTime,
  fromLocalDateTimeValue,
  normalizeSearchText,
  shortId,
  toLocalDateTimeValue,
  type ZipScoreRecord,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { PuzzleViewDialog } from "@/components/admin/puzzle-view-dialog";
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

type Difficulty = ZipScoreRecord["difficulty"];

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

type ScoreDraft = {
  sessionId: string;
  name: string;
  seed: string;
  difficulty: Difficulty;
  timeMs: string;
  puzzleCount: string;
  createdAt: string;
};

function createDraft(score: ZipScoreRecord): ScoreDraft {
  return {
    sessionId: score.sessionId,
    name: score.name,
    seed: String(score.seed),
    difficulty: score.difficulty,
    timeMs: String(score.timeMs),
    puzzleCount: String(score.puzzleCount),
    createdAt: toLocalDateTimeValue(score.createdAt),
  };
}

function formatPreciseTime(milliseconds: number) {
  const safeMs = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const tenths = Math.floor((safeMs % 1000) / 100);
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`
    : `${seconds}.${tenths}s`;
}

const boardLabel = (score: Pick<ZipScoreRecord, "difficulty" | "size">) =>
  `${score.difficulty.charAt(0).toUpperCase()}${score.difficulty.slice(1)} ${score.size}x${score.size}`;

export default function ZipAdminPage() {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [scores, setScores] = useState<ZipScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedScore, setSelectedScore] = useState<ZipScoreRecord | null>(null);
  const [draft, setDraft] = useState<ScoreDraft | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [boardScore, setBoardScore] = useState<ZipScoreRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (difficulty !== "all") params.set("difficulty", difficulty);
        const response = await api(`/zip/scores?${params}`);
        if (cancelled) return;
        setScores((response.scores ?? []) as ZipScoreRecord[]);
        setTotal(response.total ?? 0);
        setTotalPages(Math.max(1, response.totalPages ?? 1));
      } catch (error) {
        if (!cancelled) {
          show(error instanceof Error ? error.message : "Unable to load Zip runs.", "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [difficulty, page, pageSize, refreshKey, show]);

  const normalizedSearch = normalizeSearchText(search);

  const visibleScores = useMemo(() => {
    if (!normalizedSearch) return scores;
    return scores.filter((score) =>
      [score.name, score.sessionId, String(score.seed), String(score.timeMs)].some((value) =>
        normalizeSearchText(value).includes(normalizedSearch),
      ),
    );
  }, [normalizedSearch, scores]);

  const summary = useMemo(() => {
    const fastest = visibleScores.reduce((best, score) => Math.min(best, score.timeMs), Number.POSITIVE_INFINITY);
    const average = visibleScores.length > 0
      ? Math.round(visibleScores.reduce((sum, score) => sum + score.timeMs, 0) / visibleScores.length)
      : 0;
    const boards = new Set(visibleScores.map(boardLabel)).size;
    return { loaded: visibleScores.length, fastest, average, boards };
  }, [visibleScores]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      show(`${label} copied.`, "success");
    } catch {
      show(`Unable to copy ${label.toLowerCase()}.`, "error");
    }
  };

  const openEditor = (score: ZipScoreRecord) => {
    setSelectedScore(score);
    setDraft(createDraft(score));
  };

  const closeEditor = () => {
    setSelectedScore(null);
    setDraft(null);
  };

  const saveScore = async () => {
    if (!selectedScore || !draft) return;

    // Only send what changed, so an untouched field can't overwrite a value
    // someone else edited in the meantime.
    const payload: Record<string, unknown> = {};
    const nextSeed = Number(draft.seed);
    const nextTimeMs = Number(draft.timeMs);
    const nextPuzzleCount = Number(draft.puzzleCount);
    const nextCreatedAt = fromLocalDateTimeValue(draft.createdAt);

    if (draft.sessionId.trim() && draft.sessionId.trim() !== selectedScore.sessionId) payload.sessionId = draft.sessionId.trim();
    if (draft.name.trim() && draft.name.trim() !== selectedScore.name) payload.name = draft.name.trim();
    if (Number.isInteger(nextSeed) && nextSeed >= 0 && nextSeed !== selectedScore.seed) payload.seed = nextSeed;
    if (draft.difficulty !== selectedScore.difficulty) payload.difficulty = draft.difficulty;
    if (Number.isFinite(nextTimeMs) && nextTimeMs >= 0 && nextTimeMs !== selectedScore.timeMs) payload.timeMs = Math.floor(nextTimeMs);
    if (Number.isInteger(nextPuzzleCount) && nextPuzzleCount >= 0 && nextPuzzleCount !== selectedScore.puzzleCount) payload.puzzleCount = nextPuzzleCount;
    if (nextCreatedAt > 0 && nextCreatedAt !== selectedScore.createdAt) payload.createdAt = nextCreatedAt;

    if (Object.keys(payload).length === 0) {
      closeEditor();
      return;
    }

    setPendingAction(`save-${selectedScore.id}`);
    try {
      await api(`/zip/scores/${selectedScore.id}`, { method: "PATCH", body: payload });
      show("Zip run updated.", "success");
      closeEditor();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to update Zip run.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const deleteScore = async (score: ZipScoreRecord) => {
    const confirmed = await confirm({
      title: "Delete Zip run?",
      description: `Remove ${score.name}'s ${boardLabel(score)} run permanently from the leaderboard.`,
      confirmLabel: "Delete run",
      tone: "destructive",
    });
    if (!confirmed) return;

    setPendingAction(`delete-${score.id}`);
    try {
      await api(`/zip/scores/${score.id}`, { method: "DELETE" });
      show("Zip run deleted.", "success");
      if (selectedScore?.id === score.id) closeEditor();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to delete Zip run.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const clearScores = async () => {
    const confirmed = await confirm({
      title: "Delete all Zip runs?",
      description: "This clears every persisted Zip leaderboard entry on every board and cannot be undone.",
      confirmLabel: "Clear runs",
      tone: "destructive",
    });
    if (!confirmed) return;

    setPendingAction("clear");
    try {
      await api("/zip/scores", { method: "DELETE", body: {} });
      show("Cleared all Zip runs.", "success");
      closeEditor();
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to clear Zip runs.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  // Built fresh each render, same reasoning as the Pips page.
  const columns: Column<ZipScoreRecord>[] = [
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
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{shortId(score.id, 14)}</div>
        </div>
      ),
    },
    {
      id: "board",
      header: "Board",
      width: 130,
      sortValue: (score) => `${score.difficulty}-${String(score.size).padStart(2, "0")}`,
      cell: (score) => boardLabel(score),
    },
    {
      id: "timeMs",
      header: "Time",
      width: 110,
      align: "right",
      sortValue: (score) => score.timeMs,
      cell: (score) => <span className="font-semibold text-foreground">{formatPreciseTime(score.timeMs)}</span>,
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
      width: 140,
      sortValue: (score) => score.seed,
      cell: (score) => <CopyChip label={String(score.seed)} onCopy={() => void copyText(String(score.seed), "Seed")} />,
    },
    {
      id: "sessionId",
      header: "Session",
      width: 170,
      sortValue: (score) => score.sessionId,
      cell: (score) => (
        <CopyChip label={shortId(score.sessionId, 14)} onCopy={() => void copyText(score.sessionId, "Session id")} />
      ),
    },
    {
      id: "createdAt",
      header: "Submitted",
      width: 170,
      sortValue: (score) => score.createdAt,
      cell: (score) => <span className="text-muted-foreground">{formatDateTime(score.createdAt)}</span>,
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
            <DropdownMenuItem onSelect={() => setBoardScore(score)}>
              <LayoutGrid />
              View boards
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openEditor(score)}>
              <Edit3 />
              Edit run
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={pendingAction === `delete-${score.id}`}
              onSelect={() => void deleteScore(score)}
            >
              <Trash2 />
              Delete run
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Surface pad="sm" className="shrink-0">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Loaded runs", value: summary.loaded.toLocaleString(), icon: Trophy },
            {
              label: "Fastest run",
              value: summary.fastest === Number.POSITIVE_INFINITY ? "--" : formatPreciseTime(summary.fastest),
              icon: TimerReset,
            },
            { label: "Average run", value: summary.average > 0 ? formatPreciseTime(summary.average) : "--", icon: Search },
            { label: "Boards shown", value: summary.boards.toLocaleString(), icon: Grid3x3 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  <Icon className="size-4" />
                  {item.label}
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-normal text-foreground">{item.value}</div>
              </div>
            );
          })}
        </div>
      </Surface>

      <Surface pad="sm" className="shrink-0">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by player, session, seed, or time"
                className="border-border bg-card pl-11 text-foreground"
              />
            </div>
            <Select
              value={difficulty}
              onValueChange={(value) => {
                setDifficulty(value as Difficulty | "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-full capitalize md:w-40" aria-label="Difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All difficulties</SelectItem>
                {DIFFICULTIES.map((value) => (
                  <SelectItem key={value} value={value} className="capitalize">
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setCreateOpen(true)}
            >
              <PlusCircle className="size-4" />
              Add run
            </Button>
            <Button
              variant="destructive"
              className="border border-border bg-muted text-foreground hover:bg-accent"
              disabled={pendingAction === "clear"}
              onClick={() => void clearScores()}
            >
              <Trash2 className="size-4" />
              Clear all runs
            </Button>
          </div>
        </div>
      </Surface>

      <Surface pad="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading && scores.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: Math.min(pageSize, 12) }).map((_, index) => (
              <Skeleton key={index} className="h-12 bg-muted" />
            ))}
          </div>
        ) : (
          <DataTable
            className="min-h-0 flex-1"
            tableKey="zip-scores"
            columns={columns}
            rows={visibleScores}
            rowKey={(score) => score.id}
            empty="No Zip runs match the current filters."
          />
        )}

        <div className="mt-3 shrink-0">
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

      <PuzzleViewDialog
        game="zip"
        scoreId={boardScore?.id ?? null}
        seed={boardScore?.seed ?? null}
        puzzleCount={boardScore?.puzzleCount ?? 1}
        accent="var(--game-zip)"
        open={Boolean(boardScore)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setBoardScore(null);
        }}
      />

      <ScoreCreateDialog
        game="zip"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setPage(1);
          setRefreshKey((value) => value + 1);
        }}
      />

      <Dialog open={Boolean(selectedScore && draft)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="[--dialog-content-width:56rem] border-border bg-card text-foreground shadow-none">
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground">Edit Zip run</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Adjust the persisted run, including its board, total time, seed, player name, and source session.
            </DialogDescription>
          </DialogHeader>

          {selectedScore && draft ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                {(
                  [
                    ["zip-session-id", "Session id", "sessionId", "text"],
                    ["zip-player-name", "Player name", "name", "text"],
                    ["zip-seed", "Seed", "seed", "number"],
                    ["zip-created-at", "Submitted at", "createdAt", "datetime-local"],
                  ] as const
                ).map(([id, label, key, type]) => (
                  <div key={id}>
                    <Label htmlFor={id} className="mb-2">
                      {label}
                    </Label>
                    <Input
                      id={id}
                      type={type}
                      min={type === "number" ? 0 : undefined}
                      value={draft[key]}
                      onChange={(event) => setDraft((current) => (current ? { ...current, [key]: event.target.value } : current))}
                      className="border-border bg-card text-foreground"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="zip-difficulty" className="mb-2">
                    Difficulty
                  </Label>
                  <Select
                    value={draft.difficulty}
                    onValueChange={(value) => setDraft((current) => (current ? { ...current, difficulty: value as Difficulty } : current))}
                  >
                    <SelectTrigger id="zip-difficulty" className="h-10 w-full capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((value) => (
                        <SelectItem key={value} value={value} className="capitalize">
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(
                  [
                    ["zip-time-ms", "Total time in ms", "timeMs"],
                    ["zip-puzzle-count", "Puzzle count", "puzzleCount"],
                  ] as const
                ).map(([id, label, key]) => (
                  <div key={id}>
                    <Label htmlFor={id} className="mb-2">
                      {label}
                    </Label>
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      value={draft[key]}
                      onChange={(event) => setDraft((current) => (current ? { ...current, [key]: event.target.value } : current))}
                      className="border-border bg-card text-foreground"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="destructive"
              className="border border-border bg-muted text-foreground hover:bg-accent"
              disabled={!selectedScore || pendingAction === `delete-${selectedScore?.id}`}
              onClick={() => selectedScore && void deleteScore(selectedScore)}
            >
              <Trash2 className="size-4" />
              Delete run
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-border bg-card text-foreground hover:bg-accent" onClick={closeEditor}>
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
    </div>
  );
}
