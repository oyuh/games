"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  RotateCcw,
  Rows2,
  Rows3,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTableState, type SortDir } from "@/hooks/use-table-state";

/**
 * A table you can actually work in: resize, sort, reorder, hide columns, and
 * switch density, with the arrangement remembered per table.
 *
 * Widths live on <col> elements under table-layout: fixed, so one element per
 * column sets the width rather than a class on every cell. That is the whole
 * trick, and it is why this does not need a column-def library: the caller
 * still writes ordinary <td>s.
 */

export type Column<Row> = {
  id: string;
  header: React.ReactNode;
  /** Cell contents. */
  cell: (row: Row) => React.ReactNode;
  /** Sort key. Omit to make the column unsortable. */
  sortValue?: (row: Row) => string | number | null | undefined;
  /** Starting width in px, before anyone drags. */
  width?: number;
  /** Kept out of the hide menu, e.g. the row-actions column. */
  alwaysVisible?: boolean;
  /** Right-aligns the header and cells, for numeric columns. */
  align?: "left" | "right";
  className?: string;
};

const MIN_WIDTH = 64;

export function compare(a: unknown, b: unknown) {
  // Nulls sort last in both directions: an empty cell is never "the smallest",
  // it is just missing.
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function useSortedRows<Row>(
  rows: Row[],
  columns: Column<Row>[],
  sort: { col: string; dir: SortDir } | null,
) {
  return React.useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.col);
    if (!column?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    // Sort a copy: mutating the caller's array would fight React's state.
    return [...rows].sort(
      (a, b) => compare(column.sortValue!(a), column.sortValue!(b)) * factor,
    );
  }, [rows, columns, sort]);
}

function ResizeHandle({
  onResize,
  onReset,
  label,
}: {
  onResize: (deltaX: number, startWidth: number) => void;
  onReset: () => void;
  label: string;
}) {
  const start = React.useRef<{ x: number; width: number } | null>(null);

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      title="Drag to resize, double-click to reset"
      className={cn(
        "absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-center justify-center select-none",
        "after:h-1/2 after:w-px after:bg-border after:transition-colors",
        "hover:after:w-[2px] hover:after:bg-primary active:after:w-[2px] active:after:bg-primary",
      )}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onReset();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const th = event.currentTarget.parentElement as HTMLElement | null;
        start.current = { x: event.clientX, width: th?.offsetWidth ?? MIN_WIDTH };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onResize(event.clientX - start.current.x, start.current.width);
      }}
      onPointerUp={(event) => {
        start.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    />
  );
}

export function DataTable<Row>({
  tableKey,
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  className,
  toolbarSlot,
}: {
  /** Storage key for this table's arrangement. Stable per table, not per page. */
  tableKey: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  empty?: React.ReactNode;
  className?: string;
  /** Extra controls rendered beside the column and density menus. */
  toolbarSlot?: React.ReactNode;
}) {
  const ids = React.useMemo(() => columns.map((c) => c.id), [columns]);
  const table = useTableState(tableKey, ids);
  const [dragging, setDragging] = React.useState<string | null>(null);

  const byId = React.useMemo(
    () => new Map(columns.map((c) => [c.id, c])),
    [columns],
  );

  const visible = React.useMemo(
    () =>
      table.order
        .map((id) => byId.get(id))
        .filter((c): c is Column<Row> => !!c && !table.hidden.includes(c.id)),
    [table.order, table.hidden, byId],
  );

  const sorted = useSortedRows(rows, columns, table.sort);
  const compact = table.density === "compact";

  const hideable = columns.filter((c) => !c.alwaysVisible);
  const hiddenCount = table.hidden.length;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {toolbarSlot}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 />
              Columns
              {hiddenCount > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  ({hiddenCount} hidden)
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            {hideable.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={!table.hidden.includes(column.id)}
                // Radix closes the menu on select; keep it open so several
                // columns can be toggled in one go.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => table.toggleHidden(column.id)}
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => table.setDensity(compact ? "normal" : "compact")}>
              {compact ? <Rows3 /> : <Rows2 />}
              {compact ? "Comfortable rows" : "Compact rows"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => table.reset()}>
              <RotateCcw />
              Reset layout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* The scroll region. min-h-0 lets it shrink inside a flex parent rather
          than growing the page, which is what keeps the document scrollbar
          from ever appearing. The sticky header stays put inside it. */}
      <div className="relative min-h-0 w-full flex-1 overflow-auto rounded-lg border border-border">
        <table
          data-slot="data-table"
          data-density={table.density}
          className="w-full table-fixed caption-bottom text-sm"
        >
          <colgroup>
            {visible.map((column) => {
              const width = table.widths[column.id] ?? column.width;
              return (
                <col
                  key={column.id}
                  style={width ? { width: `${width}px` } : undefined}
                />
              );
            })}
          </colgroup>

          <thead className="[&_tr]:border-b [&_tr]:border-border">
            <tr>
              {visible.map((column) => {
                const sortable = !!column.sortValue;
                const active = table.sort?.col === column.id;
                const dir = active ? table.sort!.dir : null;

                return (
                  <th
                    key={column.id}
                    scope="col"
                    // aria-sort is what a screen reader announces. The arrow is
                    // only the sighted half of the same information.
                    aria-sort={
                      active ? (dir === "asc" ? "ascending" : "descending") : "none"
                    }
                    draggable
                    onDragStart={(event) => {
                      setDragging(column.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => {
                      if (dragging && dragging !== column.id) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragging && dragging !== column.id) {
                        table.moveColumn(dragging, column.id);
                      }
                      setDragging(null);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "sticky top-0 z-10 bg-[color-mix(in_srgb,var(--foreground)_5%,var(--card))] px-3 text-left align-middle",
                      "text-[0.65rem] font-extrabold tracking-[0.1em] whitespace-nowrap text-muted-foreground uppercase",
                      compact ? "h-9" : "h-11",
                      "relative select-none",
                      dragging === column.id && "opacity-40",
                      column.align === "right" && "text-right",
                      column.className,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => table.toggleSort(column.id)}
                        className={cn(
                          "-mx-1 inline-flex max-w-full items-center gap-1.5 rounded-sm px-1 py-0.5 outline-none",
                          "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30",
                          active && "text-foreground",
                          column.align === "right" && "flex-row-reverse",
                        )}
                      >
                        <span className="truncate">{column.header}</span>
                        {active ? (
                          dir === "asc" ? (
                            <ArrowUp className="size-3 shrink-0 text-primary" />
                          ) : (
                            <ArrowDown className="size-3 shrink-0 text-primary" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 shrink-0 opacity-40" />
                        )}
                      </button>
                    ) : (
                      <span className="block truncate">{column.header}</span>
                    )}

                    <ResizeHandle
                      label={typeof column.header === "string" ? column.header : column.id}
                      onResize={(deltaX, startWidth) =>
                        table.setWidth(column.id, Math.max(MIN_WIDTH, startWidth + deltaX))
                      }
                      onReset={() => table.setWidth(column.id, null)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="[&_tr:last-child]:border-0">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={visible.length}
                  className="px-3 py-14 text-center text-sm text-muted-foreground"
                >
                  {empty ?? "Nothing to show."}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border transition-colors",
                    "hover:bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {visible.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        "overflow-hidden px-3 align-middle text-ellipsis whitespace-nowrap",
                        compact ? "py-1.5" : "py-2.5",
                        column.align === "right" && "text-right tabular-nums",
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Wraps a cell's text so a truncated value is still readable on hover. */
export function TruncatedCell({ children }: { children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block truncate">{children}</span>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}
