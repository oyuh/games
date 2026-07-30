// Seeds admin_restricted_names from public word lists.
//
//   bun apps/api/scripts/import-restricted-names.ts --dry-run   # print what would be inserted
//   bun apps/api/scripts/import-restricted-names.ts             # insert
//
// Sources:
//  - LDNOOBW english list -> exact-match patterns
//  - Surge AI profanity list (severe tier only) -> exact-match patterns,
//    which pulls in the leetspeak spellings (n1gg3r, k1ke, ...) as exacts
//  - WILDCARD_ROOTS below -> root* patterns for suffix evasion (-a, -er, -as, ...)
//
// Wildcards are curated by hand instead of derived from the CSV: the severe tier
// maps compounds to canonicals like "fuck"/"ass"/"monkey"/"darky", and auto-deriving
// roots from those blocks normal names (dark*, jigg* hits "jiggly", spic* hits "spicy").
// Only add a root here if no normal word/name starts with it.
import { adminRestrictedNames } from "@games/shared/db";
import { drizzleClient } from "../src/db-provider";

const LDNOOBW_URL =
  "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en";
// Original surge-ai/profanity repo is gone from GitHub; this HF dataset mirrors it verbatim.
const SURGE_URL =
  "https://huggingface.co/datasets/mmathys/profanity/resolve/main/profanity_en.csv";

const WILDCARD_ROOTS = [
  "nigg",
  "fagg",
  "kike",
  "kyke",
  "chink",
  "gook",
  "wetback",
  "beaner",
  "towelhead",
  "raghead",
  "trann",
  "shemale",
  "chingchong",
  "jiggab",
];

// staff*/official*/system* are deliberate: nothing normal starts with them.
// "games" (the app name) stays exact -- games* would block names like "gamesniper".
const IMPERSONATION = ["admin*", "moderator*", "staff*", "support*", "official*", "system*", "games"];

// sanitizeSessionName strips all whitespace from names, so patterns must too
// or they can never match. Terms containing "*" (surge has censored spellings
// like c*nt) are dropped: the matcher reads * as a wildcard, so c*nt would
// block "count".
function toPattern(raw: string) {
  const p = raw.trim().toLowerCase().replace(/\s+/g, "");
  return p.includes("*") ? "" : p;
}

async function fetchText(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

const dryRun = process.argv.includes("--dry-run");

const [ldnoobwRaw, surgeRaw] = await Promise.all([fetchText(LDNOOBW_URL), fetchText(SURGE_URL)]);

const ldnoobw = ldnoobwRaw.split("\n").map(toPattern).filter(Boolean);

// CSV has no quoted fields; header: text,...,severity_rating,severity_description
const surgeLines = surgeRaw.trim().split("\n");
const header = surgeLines[0].split(",");
const textCol = header.indexOf("text");
const sevCol = header.indexOf("severity_description");
if (textCol === -1 || sevCol === -1) throw new Error("surge csv columns changed");
const surgeSevere = surgeLines
  .slice(1)
  .map((line) => line.split(","))
  .filter((cols) => cols[sevCol] === "Severe")
  .map((cols) => toPattern(cols[textCol]))
  .filter(Boolean);

const wildcards = [...WILDCARD_ROOTS.map((root) => `${root}*`), ...IMPERSONATION];
const roots = wildcards.filter((p) => p.endsWith("*")).map((p) => p.slice(0, -1));
const coveredByWildcard = (word: string) => roots.some((root) => word.startsWith(root));

const candidates = new Map<string, string>(); // pattern -> reason (first source wins)
for (const root of WILDCARD_ROOTS) candidates.set(`${root}*`, "slur root (import)");
for (const p of IMPERSONATION) candidates.set(p, "impersonation (import)");
for (const p of surgeSevere) if (!coveredByWildcard(p) && !candidates.has(p)) candidates.set(p, "surge severe (import)");
for (const p of ldnoobw) if (!coveredByWildcard(p) && !candidates.has(p)) candidates.set(p, "ldnoobw (import)");

let existingSet = new Set<string>();
try {
  const existing = await drizzleClient.select({ pattern: adminRestrictedNames.pattern }).from(adminRestrictedNames);
  existingSet = new Set(existing.map((row) => row.pattern));
} catch (err) {
  if (!dryRun) throw err;
  console.warn("db unreachable, dry run continues without dedupe against existing rows");
}
for (const pattern of existingSet) candidates.delete(pattern);

const entries = [...candidates].map(([pattern, reason]) => ({
  id: `rn_${crypto.randomUUID().slice(0, 12)}`,
  pattern,
  reason,
  createdAt: Date.now(),
}));

console.log(`ldnoobw terms: ${ldnoobw.length}, surge severe terms: ${surgeSevere.length}`);
console.log(`already in db: ${existingSet.size}, new entries: ${entries.length}`);
console.log(`wildcards: ${entries.filter((e) => e.pattern.includes("*")).map((e) => e.pattern).join(", ") || "(none new)"}`);

if (dryRun) {
  for (const e of entries) console.log(`${e.pattern}\t${e.reason}`);
  console.log("dry run, nothing inserted");
  process.exit(0);
}

for (let i = 0; i < entries.length; i += 500) {
  await drizzleClient.insert(adminRestrictedNames).values(entries.slice(i, i + 500));
}
console.log(`inserted ${entries.length} patterns; api picks them up within 10s (cache ttl)`);
process.exit(0);
