"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function Table({
  className,
  density = "normal",
  ...props
}: React.ComponentProps<"table"> & { density?: "compact" | "normal" }) {
  return (
    // The scroll region is the container, not the table. flex-1 and min-h-0
    // only bite when the parent is a flex column and are inert otherwise, so
    // one container works both inside a viewport-fitting page and on its own.
    <div
      data-slot="table-container"
      className="relative min-h-0 w-full flex-1 overflow-auto"
    >
      <table
        data-slot="table"
        data-density={density}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors has-aria-expanded:bg-accent data-[state=selected]:bg-muted",
        "hover:bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Sticky by default. On a table long enough to scroll, losing the header is the
 * fastest way to stop knowing what you are looking at, and it costs one line.
 */
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "sticky top-0 z-10 bg-[color-mix(in_srgb,var(--foreground)_5%,var(--card))] px-3 text-left align-middle whitespace-nowrap",
        "text-[0.65rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase",
        "group-data-[density=compact]/table:h-9 h-11",
        "[&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Numerals are tabular so columns of times, scores and seeds line up and stop
 * jittering as the table refreshes.
 */
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 align-middle whitespace-nowrap tabular-nums",
        "py-2.5 in-data-[density=compact]:py-1.5",
        "[&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
