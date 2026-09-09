export type CleanupReportLine = { label: string; value: string; tone: "info" | "success" | "warning" | "error" };
type Summary = {
  ended: Record<string, number>;
  deleted: Record<string, number>;
  totals: Record<string, number>;
  archive: { sessionsArchived: number; sessionsTrimmed: number };
  detachedSessions: number;
  shikaku: { scoresChecked: number; scoresTrimmed: number; suspiciousRemoved: number };
  pips: { scoresChecked: number; scoresTrimmed: number; suspiciousRemoved: number };
};

export function percentage(part: number, total: number) {
  return total > 0 ? `${(part / total * 100).toFixed(1)}%` : "0.0%";
}

export function cleanupReportLines(summary: Summary): CleanupReportLine[] {
  const lines: CleanupReportLine[] = [];
  for (const [key, label] of Object.entries({ imposter: "Imposter", password: "Password", chainReaction: "Chain Reaction", shadeSignal: "Shade Signal", locationSignal: "Location Signal" })) {
    const ended = summary.ended[key] ?? 0;
    const deleted = summary.deleted[key] ?? 0;
    const remaining = summary.totals[`${key}Games`] ?? 0;
    const checked = remaining + deleted;
    lines.push({ label, value: `${checked} ${checked === 1 ? "room" : "rooms"} checked, ${ended} ended (${percentage(ended, checked)}), ${deleted} deleted (${percentage(deleted, checked)}), ${remaining} remaining`, tone: ended + deleted ? "warning" : "success" });
  }
  for (const key of ["shikaku", "pips"] as const) {
    const audit = summary[key];
    lines.push({ label: key === "pips" ? "Pips" : "Shikaku", value: `${audit.scoresChecked} ${audit.scoresChecked === 1 ? "score" : "scores"} checked, ${audit.suspiciousRemoved} invalid removed (${percentage(audit.suspiciousRemoved, audit.scoresChecked)}), ${audit.scoresTrimmed} over the 20-score limit removed`, tone: audit.suspiciousRemoved ? "warning" : "success" });
  }
  lines.push(
    { label: "Sessions", value: `${summary.detachedSessions} room links cleared, ${summary.archive.sessionsArchived} archived, ${summary.deleted.sessions} deleted, ${summary.totals.sessions} remaining`, tone: "info" },
    { label: "Orphaned data", value: `${summary.deleted.encryptionKeys} encryption keys and ${summary.deleted.chatMessages} chat messages deleted`, tone: "info" },
    { label: "Archive retention", value: `${summary.archive.sessionsTrimmed} sessions older than 30 days removed`, tone: "info" },
    { label: "Policy", value: "End rooms after 20 minutes idle. Delete rooms ended for 1 hour. Keep up to 20 scores per player, per difficulty for Shikaku. Validate stored replays when present; legacy scores without replays receive metadata checks.", tone: "info" },
  );
  return lines;
}

export function formatCleanupReport(lines: CleanupReportLine[], trigger: string, durationMs: number, color = false) {
  const colors = { info: 36, success: 32, warning: 33, error: 31 };
  const paint = (text: string, tone: CleanupReportLine["tone"]) => color ? `\x1b[${colors[tone]}m${text}\x1b[0m` : text;
  return [paint(`Cleanup completed (${trigger}) in ${(durationMs / 1000).toFixed(2)}s`, "success"), ...lines.map((line) => `${paint(line.label, line.tone)}: ${line.value}`)].join("\n");
}
