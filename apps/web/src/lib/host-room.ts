/** The room numbers every game row carries, for the host controls' stat strip.
 *  Lives outside HostControlsModal so the header can build them without pulling
 *  the lazily loaded modal in with it. */
export function roomStats(game: { code: string; phase: string; created_at: number; kicked: readonly string[] }) {
  return { code: game.code, phase: game.phase, createdAt: game.created_at, kicked: game.kicked.length };
}
