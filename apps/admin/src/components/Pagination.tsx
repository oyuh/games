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
  const pages: (number | "...")[] = [];
  const delta = 2;
  const left = Math.max(2, page - delta);
  const right = Math.min(totalPages - 1, page + delta);

  pages.push(1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages - 1) pages.push("...");
  if (totalPages > 1) pages.push(totalPages);

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-slate-400">
        {startItem}–{endItem} of {total.toLocaleString()}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
          Prev
        </Button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="px-1 text-slate-500">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              className={p === page ? "min-w-9 rounded-full bg-white text-slate-900 hover:bg-white/90" : "min-w-9 rounded-full border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {onPageSizeChange && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 rounded-full border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-50 outline-none"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
