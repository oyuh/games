import { useEffect } from "react";
import { mutators } from "@games/shared";
import { publishAvatars } from "../lib/avatar";

type SessionRow = { id: string; avatar?: string | null };

/**
 * Hand the session rows a game already queried to the avatar registry, so
 * everyone in the lobby draws with the avatar they picked. Saves threading an
 * avatar prop through every card, chip and map marker that shows a face.
 */
export function usePublishedAvatars(rows: ReadonlyArray<SessionRow>) {
  useEffect(() => {
    publishAvatars(rows);
  }, [rows]);
}

/**
 * Push your pick to your session row so other players see it. Runs on mount
 * too, which heals a row whose avatar never made it up (picked while the sync
 * server was still waking, say).
 */
export function useAvatarSync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zero: { mutate: any },
  sessionId: string,
  encoded: string
) {
  useEffect(() => {
    if (!sessionId) return;
    const mutation = zero.mutate(mutators.sessions.setAvatar({ id: sessionId, avatar: encoded }));
    // Local-first: the pick already applied from localStorage, so a server that
    // is still waking up must not surface as an error.
    void mutation?.server?.catch?.(() => undefined);
    void mutation?.client?.catch?.(() => undefined);
  }, [zero, sessionId, encoded]);
}
