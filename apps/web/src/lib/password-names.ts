import { getDisplayName } from "./session";

type PasswordSession = {
  id: string;
  name: string | null;
};

type PasswordGameNameSource = {
  host_id?: string;
  teams?: Array<{ members: string[] }>;
  spectators?: Array<{ sessionId: string; name: string | null }>;
  settings?: {
    playerNames?: Record<string, string>;
  };
};

function isLikelySessionToken(value: string, sessionId?: string | null) {
  if (sessionId && value === sessionId) {
    return true;
  }

  return value.length >= 18 && /^[A-Za-z0-9_-]+$/.test(value) && /[_-]/.test(value);
}

export function getPasswordPlayerName(names: Record<string, string>, sessionId: string) {
  const resolved = names[sessionId] ?? getDisplayName(null, sessionId);
  return isLikelySessionToken(resolved, sessionId) ? getDisplayName(null, sessionId) : resolved;
}

export function buildPasswordPlayerNames(
  game: PasswordGameNameSource | null | undefined,
  sessions: PasswordSession[]
) {
  const names: Record<string, string> = { ...(game?.settings?.playerNames ?? {}) };

  for (const spectator of game?.spectators ?? []) {
    names[spectator.sessionId] = getDisplayName(spectator.name, spectator.sessionId);
  }

  for (const session of sessions) {
    names[session.id] = getDisplayName(session.name, session.id);
  }

  for (const team of game?.teams ?? []) {
    for (const memberId of team.members) {
      names[memberId] = getPasswordPlayerName(names, memberId);
    }
  }

  if (game?.host_id) {
    names[game.host_id] = getPasswordPlayerName(names, game.host_id);
  }

  return names;
}
