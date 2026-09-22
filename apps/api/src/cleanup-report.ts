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

const GAME_LABELS = { imposter: "Imposter", password: "Password", chainReaction: "Chain Reaction", shadeSignal: "Shade Signal", locationSignal: "Location Signal" };

export function cleanupReportLines(summary: Summary): CleanupReportLine[] {
  const lines: CleanupReportLine[] = [];
  for (const [key, label] of Object.entries(GAME_LABELS)) {
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
  );
  return lines;
}

export const CLEANUP_POLICY = "End rooms after 20 minutes idle. Delete rooms ended for 1 hour. Keep up to 20 scores per player, per difficulty for Shikaku. Validate stored replays when present; legacy scores without replays receive metadata checks.";

export type CleanupStats = Record<string, number>;

// Saved runs keep flat counters with zeros dropped instead of prose, which
// takes a typical run from ~2KB to a few hundred bytes. Lines render on read.
export function compactSummary(summary: object, prefix = ""): CleanupStats {
  const stats: CleanupStats = {};
  for (const [key, value] of Object.entries(summary)) {
    if (typeof value === "number" && value !== 0) stats[prefix + key] = value;
    else if (value && typeof value === "object") Object.assign(stats, compactSummary(value, `${prefix}${key}.`));
  }
  return stats;
}

export function expandStats(stats: CleanupStats): Summary {
  const group = (name: string) => Object.fromEntries(Object.entries(stats)
    .filter(([key]) => key.startsWith(`${name}.`))
    .map(([key, value]) => [key.slice(name.length + 1), value]));
  const n = (key: string) => stats[key] ?? 0;
  const audit = (name: string) => ({ scoresChecked: n(`${name}.scoresChecked`), scoresTrimmed: n(`${name}.scoresTrimmed`), suspiciousRemoved: n(`${name}.suspiciousRemoved`) });
  return {
    ended: group("ended"),
    deleted: { sessions: 0, encryptionKeys: 0, chatMessages: 0, ...group("deleted") },
    totals: { sessions: 0, ...group("totals") },
    archive: { sessionsArchived: n("archive.sessionsArchived"), sessionsTrimmed: n("archive.sessionsTrimmed") },
    detachedSessions: n("detachedSessions"),
    shikaku: audit("shikaku"),
    pips: audit("pips"),
  };
}

// Rows saved before the compact format hold the prose from cleanupReportLines.
// Pull the numbers back out so they can be compacted and archived like the rest.
// Returns null for a failed run, whose only line was an error message.
export function legacyReportStats(lines: CleanupReportLine[]): CleanupStats | null {
  const labels: Record<string, string> = Object.fromEntries(Object.entries(GAME_LABELS).map(([key, label]) => [label, key]));
  const patterns = (label: string): [RegExp, string[]] | null => {
    const game = labels[label];
    if (game) return [/(\d+) rooms? checked, (\d+) ended .*?, (\d+) deleted .*?, (\d+) remaining/, ["", `ended.${game}`, `deleted.${game}`, `totals.${game}Games`]];
    const audit = label === "Pips" ? "pips" : label === "Shikaku" ? "shikaku" : null;
    if (audit) return [/(\d+) scores? checked, (\d+) invalid removed .*?, (\d+) over/, [`${audit}.scoresChecked`, `${audit}.suspiciousRemoved`, `${audit}.scoresTrimmed`]];
    if (label === "Sessions") return [/(\d+) room links cleared, (\d+) archived, (\d+) deleted, (\d+) remaining/, ["detachedSessions", "archive.sessionsArchived", "deleted.sessions", "totals.sessions"]];
    if (label === "Orphaned data") return [/(\d+) encryption keys and (\d+) chat messages/, ["deleted.encryptionKeys", "deleted.chatMessages"]];
    if (label === "Archive retention") return [/(\d+) sessions/, ["archive.sessionsTrimmed"]];
    return null;
  };
  const stats: CleanupStats = {};
  let parsed = false;
  for (const { label, value } of lines) {
    const pattern = patterns(label);
    const match = pattern && value.match(pattern[0]);
    if (!pattern || !match) continue;
    parsed = true;
    pattern[1].forEach((key, i) => {
      const count = Number(match[i + 1]);
      if (key && count) stats[key] = count;
    });
  }
  return parsed ? stats : null;
}

// Reads both the compact format and the prose lines older rows still hold.
export function storedReportLines(report: unknown): CleanupReportLine[] | null {
  if (Array.isArray(report)) return report as CleanupReportLine[];
  return report && typeof report === "object" ? cleanupReportLines(expandStats(report as CleanupStats)) : null;
}

type ArchivedRun = { startedAt: number; finishedAt: number | null; status: string; report: unknown };
export type CleanupDay = { day: string; runs: number; completed: number; failed: number; unfinished: number; durationMs: number; stats: CleanupStats };

// Room and score totals are snapshots, so summing them across runs means nothing.
const isSnapshot = (key: string) => key.startsWith("totals.") || key.endsWith(".scoresChecked");

export function foldCleanupRuns(runs: ArchivedRun[], existing: CleanupDay[] = []): CleanupDay[] {
  const days = new Map(existing.map((day) => [day.day, { ...day, stats: { ...day.stats } }]));
  for (const run of runs) {
    const key = new Date(run.startedAt).toISOString().slice(0, 10);
    const day = days.get(key) ?? { day: key, runs: 0, completed: 0, failed: 0, unfinished: 0, durationMs: 0, stats: {} };
    day.runs += 1;
    if (run.status === "completed") day.completed += 1;
    else if (run.status === "failed") day.failed += 1;
    else day.unfinished += 1;
    if (run.finishedAt !== null) day.durationMs += run.finishedAt - run.startedAt;
    if (run.report && typeof run.report === "object" && !Array.isArray(run.report)) {
      for (const [stat, value] of Object.entries(run.report as CleanupStats)) {
        if (!isSnapshot(stat)) day.stats[stat] = (day.stats[stat] ?? 0) + value;
      }
    }
    days.set(key, day);
  }
  return [...days.values()];
}

export function cleanupDayLines(stats: CleanupStats): CleanupReportLine[] {
  const sum = (prefix: string, keys?: string[]) => Object.entries(stats)
    .filter(([key]) => key.startsWith(prefix) && (!keys || keys.includes(key.slice(prefix.length))))
    .reduce((total, [, value]) => total + value, 0);
  const games = ["imposter", "password", "chainReaction", "shadeSignal", "locationSignal"];
  const invalid = sum("shikaku.", ["suspiciousRemoved"]) + sum("pips.", ["suspiciousRemoved"]);
  return [
    { label: "Rooms", value: `${sum("ended.")} ended, ${sum("deleted.", games)} deleted`, tone: "info" },
    { label: "Scores", value: `${invalid} invalid removed, ${sum("shikaku.", ["scoresTrimmed"]) + sum("pips.", ["scoresTrimmed"])} over the limit removed`, tone: invalid ? "warning" : "info" },
    { label: "Sessions", value: `${stats["archive.sessionsArchived"] ?? 0} archived, ${stats["deleted.sessions"] ?? 0} deleted, ${stats["archive.sessionsTrimmed"] ?? 0} trimmed from the archive`, tone: "info" },
    { label: "Orphaned data", value: `${stats["deleted.encryptionKeys"] ?? 0} encryption keys and ${stats["deleted.chatMessages"] ?? 0} chat messages deleted`, tone: "info" },
  ];
}

export function formatCleanupReport(lines: CleanupReportLine[], trigger: string, durationMs: number, color = false) {
  const colors = { info: 36, success: 32, warning: 33, error: 31 };
  const paint = (text: string, tone: CleanupReportLine["tone"]) => color ? `\x1b[${colors[tone]}m${text}\x1b[0m` : text;
  return [paint(`Cleanup completed (${trigger}) in ${(durationMs / 1000).toFixed(2)}s`, "success"), ...lines.map((line) => `${paint(line.label, line.tone)}: ${line.value}`), `${paint("Policy", "info")}: ${CLEANUP_POLICY}`].join("\n");
}
