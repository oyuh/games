import { customAlphabet } from "nanoid";
import { chainWordBank, passwordWordBank } from "./word-banks";

export const now = () => Date.now();
export const code = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);
export const PRESENCE_TIMEOUT_MS = 30_000;

export function pickRandom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

export function normalized(input: string) {
  return input.trim().toLowerCase();
}

export function isOneWord(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length === 1;
}

export function isClueTooSimilar(clue: string, word: string) {
  const c = normalized(clue);
  const w = normalized(word);
  if (c === w) return true;
  if (c.startsWith(w) || w.startsWith(c)) return true;
  return false;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function chooseRoles(
  players: Array<{ sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player" }>,
  imposterCount: number
) {
  const shuffled = shuffle(players);
  const imposterIds = new Set(
    shuffled.slice(0, Math.max(1, Math.min(imposterCount, Math.max(1, players.length - 1)))).map((p) => p.sessionId)
  );
  return players.map((player) => ({
    ...player,
    role: imposterIds.has(player.sessionId) ? ("imposter" as const) : ("player" as const)
  }));
}

export function pickChain(length: number): string[] {
  const matching = chainWordBank.filter((c) => c.length === length);
  const pool = matching.length > 0 ? matching : chainWordBank.filter((c) => c.length >= length);
  const chain = pickRandom(pool);
  return chain.slice(0, length);
}

export function scoreForLetters(lettersShown: number): number {
  if (lettersShown <= 2) return 3;
  if (lettersShown <= 4) return 2;
  return 1;
}

export function getConnectedSet(sessions: Array<{ id: string; last_seen: number }>) {
  const cutoff = now() - PRESENCE_TIMEOUT_MS;
  return new Set(sessions.filter((session) => session.last_seen >= cutoff).map((session) => session.id));
}

export function pickPasswordWord(usedWords?: string[]) {
  const available = usedWords?.length
    ? passwordWordBank.filter((w) => !usedWords.includes(w))
    : passwordWordBank;
  const pool = available.length > 0 ? available : passwordWordBank;
  return pickRandom(pool);
}

export function buildTeamRound(team: { name: string; members: string[] }, teamIndex: number, roundNum: number, word: string) {
  if (team.members.length < 2) {
    throw new Error(`${team.name} needs at least 2 players`);
  }
  const guesserId = team.members[(roundNum - 1) % team.members.length]!;

  return {
    teamIndex,
    guesserId,
    word,
    clues: [] as Array<{ sessionId: string; text: string }>,
    guess: null as string | null,
  };
}

export function buildAllTeamRounds(teams: Array<{ name: string; members: string[] }>, roundNum: number, usedWords?: string[]) {
  const word = pickPasswordWord(usedWords);
  return teams
    .map((team, i) => (team.members.length >= 2 ? buildTeamRound(team, i, roundNum, word) : null))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}
