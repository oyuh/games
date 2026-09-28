/**
 * What a host can change from the lobby, and how far. Each game's
 * updateSettings mutator validates against these and the lobby's pickers read
 * them for their custom entries, so the two can never disagree about what
 * counts as a legal value.
 *
 * Timers are in seconds. A timer the create form never asked about still
 * lives here, because the lobby is the first place a host can reach it.
 */
export interface SettingRange {
  min: number;
  max: number;
}

export const LOBBY_SETTING_LIMITS = {
  imposter: {
    rounds: { min: 1, max: 10 },
    imposters: { min: 1, max: 5 },
    roundDurationSec: { min: 15, max: 300 },
  },
  password: {
    targetScore: { min: 1, max: 50 },
    roundDurationSec: { min: 30, max: 900 },
  },
  chain: {
    chainLength: { min: 5, max: 10 },
    rounds: { min: 1, max: 10 },
    turnTimeSec: { min: 15, max: 600 },
  },
  shade: {
    roundsPerPlayer: { min: 1, max: 3 },
    clueDurationSec: { min: 10, max: 180 },
    guessDurationSec: { min: 10, max: 180 },
  },
  location: {
    roundsPerPlayer: { min: 1, max: 3 },
    cluePairs: { min: 1, max: 4 },
    clueDurationSec: { min: 10, max: 180 },
    guessDurationSec: { min: 10, max: 180 },
  },
} as const satisfies Record<string, Record<string, SettingRange>>;
