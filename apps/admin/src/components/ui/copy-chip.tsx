"use client";

import { Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A monospace value you can click to copy: seeds, session ids, game ids.
 * Truncates rather than forcing its column wide, since these are long and the
 * point of them is usually to copy, not to read.
 */
export function CopyChip({
  label,
  onCopy,
  className,
}: {
  label: string;
  onCopy: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={(event) => {
        // The row may be clickable in its own right; copying is not "open this".
        event.stopPropagation();
        onCopy();
      }}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors",
        "hover:border-primary/40 hover:text-foreground",
        "focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
        className,
      )}
    >
      <Copy className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
