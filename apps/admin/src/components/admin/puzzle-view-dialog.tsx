"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Game = "pips" | "shikaku";
type View = "board" | "solution" | "replay";

const VIEWS: Array<{ value: View; label: string; hint: string }> = [
  { value: "board", label: "Board", hint: "The puzzle as it was served" },
  { value: "solution", label: "Solution", hint: "The canonical answer" },
  { value: "replay", label: "Their run", hint: "What this player submitted" },
];

/**
 * The board behind a solo score.
 *
 * Both engines rebuild a whole run deterministically from the seed, and every
 * score row already stores the moves the player made, so a flagged run can be
 * a picture instead of a validation code. Cells that disagree with the
 * canonical board are outlined in the render itself.
 *
 * The image comes from an admin-gated endpoint through the SVG proxy and is
 * loaded with an <img> tag on purpose: that renders SVG in a mode that cannot
 * execute script, which inlining the markup would not.
 */
export function PuzzleViewDialog({
  game,
  scoreId,
  seed,
  puzzleCount,
  accent,
  open,
  onOpenChange,
  labels,
}: {
  game: Game;
  scoreId: string | null;
  seed: number | null;
  /** 3 for Pips, 5 for Shikaku. */
  puzzleCount: number;
  accent: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Per-puzzle tab labels, e.g. the three Pips difficulties. */
  labels?: string[];
}) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>("board");

  if (!scoreId || seed === null) {
    return null;
  }

  const safeIndex = Math.min(index, Math.max(0, puzzleCount - 1));
  const src = `/api/proxy/svg?path=${encodeURIComponent(
    `/${game}/scores/${scoreId}/puzzle.svg?index=${safeIndex}&view=${view}`,
  )}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="[--dialog-content-width:56rem]"
        style={{ ["--card-accent" as string]: accent }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span
              className="size-2.5 rounded-full"
              style={{ background: accent }}
              aria-hidden
            />
            {game === "pips" ? "Pips" : "Shikaku"} board
            <Badge variant="muted" className="ml-1 font-mono">
              seed {seed}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Rebuilt from the seed on this score row. Cells that differ from the
            canonical answer are outlined in red.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {puzzleCount > 1 ? (
            <div className="flex overflow-hidden rounded-md border border-border">
              {Array.from({ length: puzzleCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    "h-8 px-3 text-xs font-semibold capitalize transition-colors",
                    safeIndex === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {labels?.[i] ?? `#${i + 1}`}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex overflow-hidden rounded-md border border-border">
            {VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.hint}
                onClick={() => setView(option.value)}
                className={cn(
                  "h-8 px-3 text-xs font-semibold transition-colors",
                  view === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open full size
            </a>
          </Button>
        </div>

        <div className="flex min-h-[24rem] items-center justify-center overflow-auto rounded-lg border border-border bg-[var(--surface-bottom)] p-4">
          {/* An <img>, never inline markup: SVG loaded this way cannot run
              script, and this page shares an origin with the session cookie. */}
          <img
            key={src}
            src={src}
            alt={`${game} puzzle ${safeIndex + 1}, ${view} view`}
            className="max-h-[60vh] max-w-full object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
