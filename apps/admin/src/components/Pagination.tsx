"use client";

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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.8125rem" }}>
      <span style={{ color: "var(--muted)" }}>
        {startItem}–{endItem} of {total.toLocaleString()}
      </span>

      <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
        <button
          className="btn btn-ghost"
          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          ← Prev
        </button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} style={{ padding: "0.25rem 0.25rem", color: "var(--muted)" }}>…</span>
          ) : (
            <button
              key={p}
              className={`btn ${p === page ? "btn-primary" : "btn-ghost"}`}
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", minWidth: "2rem" }}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}

        <button
          className="btn btn-ghost"
          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next →
        </button>
      </div>

      {onPageSizeChange && (
        <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
          <span style={{ color: "var(--muted)" }}>Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{ width: "auto", padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
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
