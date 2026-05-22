"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Shuffle, UploadCloud } from "lucide-react";
import { api } from "@/lib/client-api";
import {
  ClientRecord,
  formatGameType,
  fromLocalDateTimeValue,
  shortId,
  toLocalDateTimeValue,
  type ShikakuScoreRecord,
} from "@/lib/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/Toast";

type GameKind = "shikaku" | "pips";
type DifficultyValue = ShikakuScoreRecord["difficulty"];

type ShikakuCreateDraft = {
  sessionId: string;
  name: string;
  seed: string;
  difficulty: DifficultyValue;
  score: string;
  timeMs: string;
  puzzleCount: string;
  createdAt: string;
};

type PipsCreateDraft = {
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

type ScoreCreateDialogProps = {
  game: GameKind;
  open: boolean;
  defaultDifficulty?: DifficultyValue;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

const DIFFICULTIES: DifficultyValue[] = ["easy", "medium", "hard", "expert"];
const DIFFICULTY_MULTIPLIER: Record<DifficultyValue, number> = {
  easy: 1,
  medium: 1.5,
  hard: 2.2,
  expert: 3,
};
const PAR_TIMES: Record<DifficultyValue, number> = {
  easy: 30_000,
  medium: 60_000,
  hard: 90_000,
  expert: 120_000,
};

function randomInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomSeed() {
  return randomInt(100_000, 999_999);
}

function calculateShikakuScore(timeMs: number, difficulty: DifficultyValue) {
  const puzzleCount = 5;
  const totalParMs = PAR_TIMES[difficulty] * puzzleCount;
  const timeBonus = Math.max(0.1, 2 - timeMs / totalParMs);
  return Math.max(
    0,
    Math.round(
      1000 * puzzleCount * DIFFICULTY_MULTIPLIER[difficulty] * timeBonus,
    ),
  );
}

function formatPreciseTime(value: string) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) {
    return "--";
  }
  const safeMs = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function requireWholeNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return Math.floor(parsed);
}

function displayClientName(client: ClientRecord) {
  const name = client.name?.trim();
  return name || `Player ${shortId(client.sessionId, 12)}`;
}

function createShikakuDraft(
  difficulty: DifficultyValue = "easy",
): ShikakuCreateDraft {
  const timeMs = 150_000;
  return {
    sessionId: "",
    name: "",
    seed: String(randomSeed()),
    difficulty,
    score: String(calculateShikakuScore(timeMs, difficulty)),
    timeMs: String(timeMs),
    puzzleCount: "5",
    createdAt: toLocalDateTimeValue(Date.now()),
  };
}

function createPipsDraft(): PipsCreateDraft {
  const easyMs = 22_000;
  const mediumMs = 42_000;
  const hardMs = 68_000;
  return {
    sessionId: "",
    name: "",
    seed: String(randomSeed()),
    totalMs: String(easyMs + mediumMs + hardMs),
    easyMs: String(easyMs),
    mediumMs: String(mediumMs),
    hardMs: String(hardMs),
    puzzleCount: "3",
    createdAt: toLocalDateTimeValue(Date.now()),
  };
}

export function ScoreCreateDialog({
  game,
  open,
  defaultDifficulty = "easy",
  onOpenChange,
  onCreated,
}: ScoreCreateDialogProps) {
  const { show } = useToast();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shikakuDraft, setShikakuDraft] = useState(() =>
    createShikakuDraft(defaultDifficulty),
  );
  const [pipsDraft, setPipsDraft] = useState(() => createPipsDraft());

  const usableClients = useMemo(
    () =>
      clients.filter((client): client is ClientRecord & { sessionId: string } =>
        Boolean(client.sessionId),
      ),
    [clients],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedSessionId("");
    if (game === "shikaku") {
      setShikakuDraft(createShikakuDraft(defaultDifficulty));
    } else {
      setPipsDraft(createPipsDraft());
    }
    void loadClients();
  }, [defaultDifficulty, game, open]);

  const loadClients = async () => {
    setLoadingClients(true);
    try {
      const response = await api("/clients?pageSize=200");
      setClients((response.clients ?? []) as ClientRecord[]);
    } catch (error) {
      show(
        error instanceof Error
          ? error.message
          : "Unable to load active sessions.",
        "error",
      );
    } finally {
      setLoadingClients(false);
    }
  };

  const applySession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    const client = usableClients.find((item) => item.sessionId === sessionId);
    if (!client) {
      return;
    }

    const name = displayClientName(client);
    setShikakuDraft((current) => ({
      ...current,
      sessionId: client.sessionId,
      name,
    }));
    setPipsDraft((current) => ({
      ...current,
      sessionId: client.sessionId,
      name,
    }));
  };

  const updateShikakuTime = (timeMs: string) => {
    setShikakuDraft((current) => {
      const parsed = Number(timeMs);
      return {
        ...current,
        timeMs,
        score:
          Number.isFinite(parsed) && parsed >= 0
            ? String(
                calculateShikakuScore(Math.floor(parsed), current.difficulty),
              )
            : current.score,
      };
    });
  };

  const updateShikakuDifficulty = (difficulty: DifficultyValue) => {
    setShikakuDraft((current) => {
      const parsed = Number(current.timeMs);
      return {
        ...current,
        difficulty,
        score:
          Number.isFinite(parsed) && parsed >= 0
            ? String(calculateShikakuScore(Math.floor(parsed), difficulty))
            : current.score,
      };
    });
  };

  const randomizeShikaku = () => {
    setShikakuDraft((current) => {
      const ranges: Record<DifficultyValue, [number, number]> = {
        easy: [95_000, 210_000],
        medium: [190_000, 430_000],
        hard: [310_000, 650_000],
        expert: [460_000, 880_000],
      };
      const timeMs = randomInt(...ranges[current.difficulty]);
      return {
        ...current,
        seed: String(randomSeed()),
        timeMs: String(timeMs),
        score: String(calculateShikakuScore(timeMs, current.difficulty)),
        puzzleCount: "5",
        createdAt: toLocalDateTimeValue(Date.now()),
      };
    });
  };

  const updatePipsSplit = (
    key: "easyMs" | "mediumMs" | "hardMs",
    value: string,
  ) => {
    setPipsDraft((current) => {
      const next = { ...current, [key]: value };
      const easyMs = Number(next.easyMs);
      const mediumMs = Number(next.mediumMs);
      const hardMs = Number(next.hardMs);
      if (
        [easyMs, mediumMs, hardMs].every(
          (item) => Number.isFinite(item) && item >= 0,
        )
      ) {
        next.totalMs = String(
          Math.floor(easyMs) + Math.floor(mediumMs) + Math.floor(hardMs),
        );
      }
      return next;
    });
  };

  const randomizePips = () => {
    const easyMs = randomInt(16_000, 32_000);
    const mediumMs = randomInt(31_000, 58_000);
    const hardMs = randomInt(52_000, 96_000);
    setPipsDraft((current) => ({
      ...current,
      seed: String(randomSeed()),
      easyMs: String(easyMs),
      mediumMs: String(mediumMs),
      hardMs: String(hardMs),
      totalMs: String(easyMs + mediumMs + hardMs),
      puzzleCount: "3",
      createdAt: toLocalDateTimeValue(Date.now()),
    }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      if (game === "shikaku") {
        await api("/shikaku/scores", {
          method: "POST",
          body: {
            sessionId: shikakuDraft.sessionId.trim(),
            name: shikakuDraft.name.trim(),
            seed: requireWholeNumber(shikakuDraft.seed, "Seed"),
            difficulty: shikakuDraft.difficulty,
            score: requireWholeNumber(shikakuDraft.score, "Score"),
            timeMs: requireWholeNumber(shikakuDraft.timeMs, "Time"),
            puzzleCount: requireWholeNumber(
              shikakuDraft.puzzleCount,
              "Puzzle count",
            ),
            createdAt: fromLocalDateTimeValue(shikakuDraft.createdAt),
          },
        });
        show("Shikaku score added.", "success");
      } else {
        const easyMs = requireWholeNumber(pipsDraft.easyMs, "Easy split");
        const mediumMs = requireWholeNumber(pipsDraft.mediumMs, "Medium split");
        const hardMs = requireWholeNumber(pipsDraft.hardMs, "Hard split");
        await api("/pips/scores", {
          method: "POST",
          body: {
            sessionId: pipsDraft.sessionId.trim(),
            name: pipsDraft.name.trim(),
            seed: requireWholeNumber(pipsDraft.seed, "Seed"),
            easyMs,
            mediumMs,
            hardMs,
            totalMs: easyMs + mediumMs + hardMs,
            puzzleCount: requireWholeNumber(
              pipsDraft.puzzleCount,
              "Puzzle count",
            ),
            createdAt: fromLocalDateTimeValue(pipsDraft.createdAt),
          },
        });
        show("Pips run added.", "success");
      }

      onCreated();
      onOpenChange(false);
    } catch (error) {
      show(
        error instanceof Error ? error.message : "Unable to add score.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title = game === "shikaku" ? "Add Shikaku score" : "Add Pips run";
  const description =
    game === "shikaku"
      ? "Create a leaderboard row with the same persisted fields used by Shikaku submissions."
      : "Create a ranked Pips run. Total is calculated from the easy, medium, and hard splits.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="[--dialog-content-width:66rem] 2xl:[--dialog-content-width:72rem] border-border bg-card text-foreground shadow-none">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                Active session
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border bg-card text-foreground hover:bg-accent"
                disabled={loadingClients}
                onClick={() => void loadClients()}
              >
                <RefreshCw className="size-4" />
                {loadingClients ? "Loading" : "Refresh"}
              </Button>
            </div>
            <select
              value={selectedSessionId}
              onChange={(event) => applySession(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-card px-4 text-sm text-foreground outline-none"
            >
              <option value="">Choose active session</option>
              {usableClients.map((client) => (
                <option key={client.sessionId} value={client.sessionId}>
                  {displayClientName(client)} - {shortId(client.sessionId, 14)}{" "}
                  - {formatGameType(client.gameType)}
                </option>
              ))}
            </select>
          </section>

          {game === "shikaku" ? (
            <section className="rounded-lg border border-border bg-muted p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                  Score fields
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border bg-muted text-foreground hover:bg-accent"
                  onClick={randomizeShikaku}
                >
                  <Shuffle className="size-4" />
                  Randomize
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <CreateField
                  label="Session id"
                  value={shikakuDraft.sessionId}
                  onChange={(value) =>
                    setShikakuDraft((current) => ({
                      ...current,
                      sessionId: value,
                    }))
                  }
                />
                <CreateField
                  label="Player name"
                  value={shikakuDraft.name}
                  onChange={(value) =>
                    setShikakuDraft((current) => ({ ...current, name: value }))
                  }
                />
                <CreateField
                  label="Seed"
                  type="number"
                  value={shikakuDraft.seed}
                  onChange={(value) =>
                    setShikakuDraft((current) => ({ ...current, seed: value }))
                  }
                />
                <div>
                  <label
                    htmlFor="new-shikaku-difficulty"
                    className="mb-2 block text-xs font-semibold uppercase tracking-normal text-muted-foreground"
                  >
                    Difficulty
                  </label>
                  <select
                    id="new-shikaku-difficulty"
                    value={shikakuDraft.difficulty}
                    onChange={(event) =>
                      updateShikakuDifficulty(
                        event.target.value as DifficultyValue,
                      )
                    }
                    className="h-10 w-full rounded-md border border-border bg-card px-4 text-sm text-foreground outline-none"
                  >
                    {DIFFICULTIES.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>
                        {difficulty}
                      </option>
                    ))}
                  </select>
                </div>
                <CreateField
                  label="Time in ms"
                  type="number"
                  value={shikakuDraft.timeMs}
                  onChange={updateShikakuTime}
                  hint={formatPreciseTime(shikakuDraft.timeMs)}
                />
                <CreateField
                  label="Score"
                  type="number"
                  value={shikakuDraft.score}
                  onChange={(value) =>
                    setShikakuDraft((current) => ({ ...current, score: value }))
                  }
                />
                <CreateField
                  label="Puzzle count"
                  type="number"
                  value={shikakuDraft.puzzleCount}
                  onChange={(value) =>
                    setShikakuDraft((current) => ({
                      ...current,
                      puzzleCount: value,
                    }))
                  }
                />
                <CreateField
                  label="Submitted at"
                  type="datetime-local"
                  value={shikakuDraft.createdAt}
                  onChange={(value) =>
                    setShikakuDraft((current) => ({
                      ...current,
                      createdAt: value,
                    }))
                  }
                />
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-border bg-muted p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                  Run fields
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border bg-muted text-foreground hover:bg-accent"
                  onClick={randomizePips}
                >
                  <Shuffle className="size-4" />
                  Randomize
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <CreateField
                  label="Session id"
                  value={pipsDraft.sessionId}
                  onChange={(value) =>
                    setPipsDraft((current) => ({
                      ...current,
                      sessionId: value,
                    }))
                  }
                />
                <CreateField
                  label="Player name"
                  value={pipsDraft.name}
                  onChange={(value) =>
                    setPipsDraft((current) => ({ ...current, name: value }))
                  }
                />
                <CreateField
                  label="Seed"
                  type="number"
                  value={pipsDraft.seed}
                  onChange={(value) =>
                    setPipsDraft((current) => ({ ...current, seed: value }))
                  }
                />
                <CreateField
                  label="Easy split in ms"
                  type="number"
                  value={pipsDraft.easyMs}
                  onChange={(value) => updatePipsSplit("easyMs", value)}
                  hint={formatPreciseTime(pipsDraft.easyMs)}
                />
                <CreateField
                  label="Medium split in ms"
                  type="number"
                  value={pipsDraft.mediumMs}
                  onChange={(value) => updatePipsSplit("mediumMs", value)}
                  hint={formatPreciseTime(pipsDraft.mediumMs)}
                />
                <CreateField
                  label="Hard split in ms"
                  type="number"
                  value={pipsDraft.hardMs}
                  onChange={(value) => updatePipsSplit("hardMs", value)}
                  hint={formatPreciseTime(pipsDraft.hardMs)}
                />
                <CreateField
                  label="Total in ms"
                  type="number"
                  value={pipsDraft.totalMs}
                  onChange={() => undefined}
                  hint={`Total: ${formatPreciseTime(pipsDraft.totalMs)}`}
                  readOnly
                />
                <CreateField
                  label="Puzzle count"
                  type="number"
                  value={pipsDraft.puzzleCount}
                  onChange={(value) =>
                    setPipsDraft((current) => ({
                      ...current,
                      puzzleCount: value,
                    }))
                  }
                />
                <CreateField
                  label="Submitted at"
                  type="datetime-local"
                  value={pipsDraft.createdAt}
                  onChange={(value) =>
                    setPipsDraft((current) => ({
                      ...current,
                      createdAt: value,
                    }))
                  }
                />
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-border bg-card text-foreground hover:bg-accent"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
          >
            <UploadCloud className="size-4" />
            {submitting
              ? "Adding..."
              : game === "shikaku"
                ? "Add score"
                : "Add run"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateField({
  label,
  value,
  onChange,
  type = "text",
  hint,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  readOnly?: boolean;
}) {
  const id = `create-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold uppercase tracking-normal text-muted-foreground"
      >
        {label}
      </label>
      <Input
        id={id}
        type={type}
        min={type === "number" ? 0 : undefined}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={`border-border bg-card text-foreground ${readOnly ? "text-muted-foreground" : ""}`}
      />
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
