export type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

export type FooterStatus = {
  text: string;
  link?: string | null;
  color?: string | null;
  flash?: boolean;
} | null;

export type ClientRecord = {
  sessionId: string | null;
  name: string | null;
  ip: string | null;
  userAgent: string | null;
  region: string | null;
  fingerprint: string | null;
  connectedAt: number | null;
  lastSeen: number;
  gameId: string | null;
  gameType: GameType | null;
};

export type GameSummary = {
  id: string;
  code: string;
  hostId: string;
  phase: string;
  type: GameType;
  createdAt: number;
  updatedAt: number;
  playerCount: number;
  spectatorCount: number;
  roundCount: number;
};

export type BanRecord = {
  id: string;
  type: "session" | "ip" | "region";
  value: string;
  reason: string;
  createdAt: number;
};

export type RestrictedNameRecord = {
  id: string;
  pattern: string;
  reason: string;
  createdAt: number;
};

export type NameOverrideRecord = {
  sessionId: string;
  forcedName: string;
  reason: string;
  updatedAt: number;
};

export type DashboardSummaryResponse = {
  summary: {
    clients: {
      total: number;
      inGame: number;
      named: number;
      anonymous: number;
      byGameType: Record<GameType, number>;
      topRegions: Array<{ region: string; total: number }>;
    };
    games: {
      total: number;
      activePlayers: number;
      activeSpectators: number;
      byType: Record<GameType, number>;
    };
    moderation: {
      totalBans: number;
      sessionBans: number;
      ipBans: number;
      regionBans: number;
      restrictedNames: number;
      nameOverrides: number;
    };
    footerStatus: FooterStatus;
  };
  recentClients: ClientRecord[];
  recentGames: GameSummary[];
  recentBans: BanRecord[];
  nameRules: RestrictedNameRecord[];
  nameOverrides: NameOverrideRecord[];
};

export type ClientListResponse = {
  clients: ClientRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: {
    regions: string[];
  };
};

export type ClientDetailResponse = {
  client: ClientRecord;
  nameOverride: NameOverrideRecord | null;
  matchedBans: BanRecord[];
};

export type GameDetailResponse = {
  game: Record<string, unknown> & {
    id: string;
    code?: string;
    phase?: string;
    type: GameType;
    createdAt?: number;
    updatedAt?: number;
    hostId?: string;
  };
  sessions: ClientRecord[];
};

export type ShikakuScoreRecord = {
  id: string;
  sessionId: string;
  name: string;
  seed: number;
  difficulty: "easy" | "medium" | "hard" | "expert";
  score: number;
  timeMs: number;
  puzzleCount: number;
  createdAt: number;
};

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  imposter: "Imposter",
  password: "Password",
  chain_reaction: "Chain Reaction",
  shade_signal: "Shade Signal",
  location_signal: "Location Signal",
};

export const GAME_TYPE_OPTIONS: Array<{ value: GameType | "all"; label: string }> = [
  { value: "all", label: "All games" },
  { value: "imposter", label: GAME_TYPE_LABELS.imposter },
  { value: "password", label: GAME_TYPE_LABELS.password },
  { value: "chain_reaction", label: GAME_TYPE_LABELS.chain_reaction },
  { value: "shade_signal", label: GAME_TYPE_LABELS.shade_signal },
  { value: "location_signal", label: GAME_TYPE_LABELS.location_signal },
];

export function formatGameType(type: GameType | string | null | undefined) {
  if (!type) {
    return "Unknown";
  }
  return GAME_TYPE_LABELS[type as GameType] ?? humanizeKey(type);
}

export function shortId(value: string | null | undefined, length = 10) {
  if (!value) {
    return "--";
  }
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

export function formatRelativeTime(timestamp: number | null | undefined) {
  if (!timestamp) {
    return "--";
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }
  if (elapsedSeconds < 3600) {
    return `${Math.floor(elapsedSeconds / 60)}m ago`;
  }
  if (elapsedSeconds < 86_400) {
    return `${Math.floor(elapsedSeconds / 3600)}h ago`;
  }
  return `${Math.floor(elapsedSeconds / 86_400)}d ago`;
}

export function formatDateTime(timestamp: number | null | undefined) {
  if (!timestamp) {
    return "--";
  }
  return new Date(timestamp).toLocaleString();
}

export function formatDurationMs(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function toLocalDateTimeValue(timestamp: number | null | undefined) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalDateTimeValue(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}
