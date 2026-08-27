import * as React from "react";

import { cn } from "@/lib/utils";
import { Surface } from "@/components/ui/surface";

/**
 * One number, its label, and an optional set of short factual sub-figures.
 *
 * The sub-figures are deliberately values rather than sentences: the old tiles
 * carried lines like "0 clients are seated in rooms, with 0 active players
 * generating the current session load", which is slower to read than the two
 * numbers it contained.
 */
export function StatTile({
  label,
  value,
  parts = [],
  icon: Icon,
  accent = "var(--primary)",
  className,
}: {
  label: string;
  value: string | number;
  parts?: Array<{ label: string; value: string | number }>;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  className?: string;
}) {
  return (
    <Surface
      tone="accent"
      accent={accent}
      pad="none"
      className={cn("flex min-w-0 items-center gap-3 px-3.5 py-3", className)}
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-md border"
        style={{
          borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          color: accent,
        }}
      >
        <Icon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.62rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl leading-none font-extrabold tabular-nums text-foreground">
            {value}
          </span>
          {parts.length > 0 ? (
            <span className="flex min-w-0 gap-2 truncate text-xs text-muted-foreground">
              {parts.map((part) => (
                <span key={part.label} className="whitespace-nowrap">
                  <b className="font-semibold tabular-nums text-foreground/80">
                    {part.value}
                  </b>{" "}
                  {part.label}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}

/**
 * A dashboard-style column: a fixed header and a body that scrolls on its own.
 * min-h-0 is what lets it shrink inside a grid or flex parent instead of
 * growing the page.
 */
export function Panel({
  title,
  meta,
  accent = "var(--primary)",
  children,
  className,
  bodyClassName,
}: {
  title: string;
  meta?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Surface
      pad="none"
      accent={accent}
      className={cn("flex min-h-0 flex-col overflow-hidden", className)}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="truncate text-[0.68rem] font-extrabold tracking-[0.12em] text-foreground uppercase">
          {title}
        </h2>
        {meta}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-3", bodyClassName)}>
        {children}
      </div>
    </Surface>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
