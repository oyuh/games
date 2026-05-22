"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  if (total === 0) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  // Build page numbers to show (window of 5 around current)
  const pages: (number | "start-ellipsis" | "end-ellipsis")[] = [];
  const delta = 2;
  const left = Math.max(2, page - delta);
  const right = Math.min(totalPages - 1, page + delta);

  pages.push(1);
  if (left > 2) pages.push("start-ellipsis");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages - 1) pages.push("end-ellipsis");
  if (totalPages > 1) pages.push(totalPages);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">
        {startItem}–{endItem} of {total.toLocaleString()}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg border-border bg-card text-foreground hover:bg-accent"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
          Prev
        </Button>

        {pages.map((p) =>
          typeof p === "string" ? (
            <span key={p} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              className={
                p === page
                  ? "min-w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                  : "min-w-9 rounded-lg border-border bg-card text-foreground hover:bg-accent"
              }
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ),
        )}

        <Button
          variant="outline"
          size="sm"
          className="rounded-lg border-border bg-card text-foreground hover:bg-accent"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {onPageSizeChange && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
