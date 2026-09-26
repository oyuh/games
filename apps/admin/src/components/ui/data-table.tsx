"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  Columns3,
  Copy,
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
const CORNER_WIDTH = 40;

/**
 * The innermost element under the pointer that is actually clipping its text,
 * stopping at the cell. Checks the real overflow rather than looking for a
 * `truncate` class, so it covers every cell every page renders without the
 * pages opting in, and stays quiet when the text fits.
 */
function clippedAt(target: EventTarget, boundary: Element): HTMLElement | null {
  for (
    let el = target instanceof HTMLElement ? target : null;
    el && boundary.contains(el);
    el = el.parentElement
  ) {
    if (
      el.scrollWidth > el.clientWidth + 1 &&
      getComputedStyle(el).overflowX !== "visible" &&
      el.textContent?.trim()
    ) {
      return el;
    }
    if (el.tagName === "TD") break;
  }
  return null;
}

type Peek = { el: HTMLElement; text: string; rect: DOMRect; font: string };

/**
 * The full text of a clipped cell, opened just under it. It sits beside the
 * value rather than on top of it so a truncated button or copy chip stays
 * clickable, and the text is selectable so it can be copied by hand too.
 */
function PeekCard({
  peek,
  onPointerEnter,
  onPointerLeave,
}: {
  peek: Peek;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const { rect } = peek;
  // Flip above the value near the bottom of the window.
  const above = rect.bottom + 160 > window.innerHeight;
  const left = Math.max(8, rect.left - 9);

  return createPortal(
    <div
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="fixed z-50 flex items-start gap-2 rounded-md border border-primary/40 bg-popover py-1 pr-1 pl-2 text-popover-foreground shadow-[var(--surface-shadow-hover)]"
      style={{
        left,
        ...(above
          ? { bottom: window.innerHeight - rect.top + 2 }
          : { top: rect.bottom + 2 }),
        minWidth: Math.min(rect.width + 18, window.innerWidth - left - 8),
        maxWidth: Math.max(240, Math.min(560, window.innerWidth - left - 8)),
      }}
    >
      <span
        className="min-w-0 flex-1 cursor-text py-0.5 break-words whitespace-pre-wrap select-text"
        style={{ font: peek.font }}
      >
        {peek.text}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={() => {
          void navigator.clipboard.writeText(peek.text).then(() => setCopied(true));
        }}
      >
        {copied ? <Check className="text-[var(--ok)]" /> : <Copy />}
      </Button>
    </div>,
    document.body,
  );
}

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
  onActive,
  label,
}: {
  onResize: (deltaX: number, startWidth: number) => void;
  onReset: () => void;
  /** Lights the whole column edge while the handle is hovered or dragged. */
  onActive: (active: boolean) => void;
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
        "absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize touch-none justify-end select-none",
        "after:h-full after:w-px after:bg-[color-mix(in_srgb,var(--foreground)_18%,transparent)] after:transition-colors",
        "hover:after:w-[2px] hover:after:bg-primary active:after:w-[2px] active:after:bg-primary",
      )}
      onPointerEnter={() => onActive(true)}
      onPointerLeave={() => {
        if (!start.current) onActive(false);
      }}
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
        // pointerleave was swallowed by the capture, so check where the drag ended.
        if (document.elementFromPoint(event.clientX, event.clientY) !== event.currentTarget) {
          onActive(false);
        }
      }}
      onPointerCancel={() => {
        start.current = null;
        onActive(false);
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
}: {
  /** Storage key for this table's arrangement. Stable per table, not per page. */
  tableKey: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  empty?: React.ReactNode;
  className?: string;
}) {
  const ids = React.useMemo(() => columns.map((c) => c.id), [columns]);
  const table = useTableState(tableKey, ids);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [edge, setEdge] = React.useState<string | null>(null);
  const [peek, setPeek] = React.useState<Peek | null>(null);
  const peekTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(peekTimer.current), []);

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

  // One timer covers both directions: a short wait before opening so sweeping
  // across rows does not flash cards, and a short grace after leaving so the
  // pointer can cross the gap into the card to copy from it.
  const schedulePeek = (next: () => void, delay: number) => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(next, delay);
  };
  const closePeek = () => {
    if (peek) schedulePeek(() => setPeek(null), 150);
    else window.clearTimeout(peekTimer.current);
  };

  return (
    // The scroll region. min-h-0 lets it shrink inside a flex parent rather
    // than growing the page, which is what keeps the document scrollbar from
    // ever appearing. The sticky header stays put inside it.
    <div
      className={cn(
        "relative min-h-0 w-full flex-1 overflow-auto rounded-lg border border-border",
        className,
      )}
      onScroll={() => {
        window.clearTimeout(peekTimer.current);
        setPeek(null);
      }}
    >
      <table
        data-slot="data-table"
        data-density={table.density}
        className="w-full table-fixed caption-bottom text-sm"
      >
        <colgroup>
          <col style={{ width: `${CORNER_WIDTH}px` }} />
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

        {/* Collapsed borders do not travel with a sticky cell, so the header's
            bottom edge is an inset shadow instead of a border. */}
        <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-[color-mix(in_srgb,var(--foreground)_5%,var(--card))] [&_th]:shadow-[inset_0_-2px_0_color-mix(in_srgb,var(--primary)_45%,transparent)]">
          <tr>
            <th scope="col" className="px-1 text-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      hiddenCount > 0
                        ? `Columns and layout, ${hiddenCount} hidden`
                        : "Columns and layout"
                    }
                    className={cn(hiddenCount > 0 && "text-primary")}
                  >
                    <Columns3 />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel>
                    Show columns
                    {hiddenCount > 0 ? (
                      <span className="ml-1 font-normal text-muted-foreground tabular-nums">
                        ({hiddenCount} hidden)
                      </span>
                    ) : null}
                  </DropdownMenuLabel>
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
                  <DropdownMenuItem
                    onSelect={() => table.setDensity(compact ? "normal" : "compact")}
                  >
                    {compact ? <Rows3 /> : <Rows2 />}
                    {compact ? "Comfortable rows" : "Compact rows"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => table.reset()}>
                    <RotateCcw />
                    Reset layout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </th>

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
                  // No `relative` here: sticky already anchors the resize
                  // handle, and cn() would let `relative` knock `sticky` out.
                  className={cn(
                    "px-3 text-left align-middle select-none",
                    "text-[0.65rem] font-extrabold tracking-[0.1em] whitespace-nowrap text-muted-foreground uppercase",
                    compact ? "h-9" : "h-11",
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
                    onActive={(on) =>
                      setEdge((current) =>
                        on ? column.id : current === column.id ? null : current,
                      )
                    }
                  />
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody
          onPointerOver={(event) => {
            const el = clippedAt(event.target, event.currentTarget);
            if (!el) return closePeek();
            if (peek?.el === el) return window.clearTimeout(peekTimer.current);
            schedulePeek(
              () =>
                setPeek({
                  el,
                  text: el.textContent ?? "",
                  rect: el.getBoundingClientRect(),
                  font: getComputedStyle(el).font,
                }),
              // Already reading one: move to the next without the wait.
              peek ? 60 : 300,
            );
          }}
          onPointerLeave={closePeek}
        >
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={visible.length + 1}
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
                  "border-b border-border transition-colors last:border-0",
                  "even:bg-[color-mix(in_srgb,var(--primary)_3%,transparent)]",
                  "hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]",
                  onRowClick && "cursor-pointer",
                )}
              >
                <td className="border-r border-r-[color-mix(in_srgb,var(--foreground)_10%,transparent)]" />
                {visible.map((column) => (
                  <td
                    key={column.id}
                    // The column edges are cell borders so they run the full
                    // height of the table, not just the header.
                    className={cn(
                      "overflow-hidden border-r border-r-[color-mix(in_srgb,var(--foreground)_10%,transparent)] px-3 align-middle text-ellipsis whitespace-nowrap last:border-r-0",
                      compact ? "py-1.5" : "py-2.5",
                      edge === column.id && "border-r-primary/70",
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

      {peek ? (
        <PeekCard
          key={peek.text}
          peek={peek}
          onPointerEnter={() => window.clearTimeout(peekTimer.current)}
          onPointerLeave={closePeek}
        />
      ) : null}
    </div>
  );
}
