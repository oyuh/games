import { isEncrypted, mutators, queries } from "@games/shared";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublishedAvatars } from "./useAvatars";
import { useNavigate, useParams } from "react-router-dom";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { publishRealtimeEvent, subscribeToRealtimeEvent } from "../lib/realtime";
import { callGameSecretInit, useGameSecret } from "../lib/game-secrets";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { playVote } from "../lib/sounds";
import { useGameSounds, playSoundSubmit } from "./useGameSounds";

/**
 * The non-visual half of an imposter game: queries, sounds, secret-word
 * decryption, the leave-on-unmount guard, the phase timer, and the join and
 * submit handlers.
 *
 * Desktop and mobile ran their own copies of all of it. Each view still owns
 * its markup, and mobile keeps its clue input ref, autofocus and countdown.
 */
export function useImposterGame(sessionId: string) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";

  const [games] = useQuery(queries.imposter.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "imposter", gameId }));
  usePublishedAvatars(sessions);
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const [clue, setClue] = useState("");
  const [voteTarget, setVoteTarget] = useState("");
  const [visibleSecretWord, setVisibleSecretWord] = useState<string | null>(null);
  const [decryptedRoundWords, setDecryptedRoundWords] = useState<Record<number, string | null>>({});
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);

  useGameSounds({
    phase: game?.phase,
    sessionId,
    isMyTurn: Boolean(me && !me.eliminated && (game?.phase === "playing" || game?.phase === "voting")),
    phaseEndsAt: game?.settings.phaseEndsAt,
  });

  const isHost = game?.host_id === sessionId;
  const inGame = Boolean(me);
  const isSpectator = useMemo(() => game?.spectators?.some((s) => s.sessionId === sessionId) ?? false, [game, sessionId]);

  const mySession = mySessionRows[0];
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "imposter" || activeGameId !== gameId));

  // Keep refs current so the unmount cleanup reads fresh values
  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  const isSpectatorRef = useRef(isSpectator);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;
  isSpectatorRef.current = isSpectator;

  useEffect(() => {
    if (isSpectator) showToast("You are a spectator", "info");
  }, [isSpectator]);

  // When the host navigates away (unmount), call the leave mutator so the
  // game ends for everyone.  A 500ms guard prevents React StrictMode's
  // double-mount from accidentally triggering the leave.
  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId }));
      } else if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.imposter.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = getDisplayName(s.name, s.id);
      return acc;
    }, {});
  }, [sessions]);

  const tally = useMemo(() => {
    if (!game) return {} as Record<string, number>;
    return game.votes.reduce<Record<string, number>>((acc, v) => {
      acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
      return acc;
    }, {});
  }, [game]);

  const { decryptValue } = useGameSecret({
    gameType: "imposter",
    gameId,
    sessionId,
    enabled: Boolean(game && game.phase !== "lobby"),
    /* Who is allowed the word changes with the phase: the imposter is turned
       away all round and then handed it at the reveal. */
    resetOn: game?.phase ?? "",
  });

  useEffect(() => {
    let cancelled = false;
    if (!game?.secret_word) {
      setVisibleSecretWord(null);
      return;
    }
    void decryptValue(game.secret_word).then((value) => {
      if (!cancelled) setVisibleSecretWord(value);
    });
    return () => { cancelled = true; };
  }, [game?.secret_word, decryptValue]);

  useEffect(() => {
    let cancelled = false;
    const roundHistory = game?.round_history ?? [];
    if (roundHistory.length === 0) {
      setDecryptedRoundWords({});
      return;
    }
    void Promise.all(
      roundHistory.map(async (round) => ({
        round: round.round,
        value: round.secretWord ? await decryptValue(round.secretWord) : null,
      }))
    ).then((rows) => {
      if (cancelled) return;
      setDecryptedRoundWords(
        rows.reduce<Record<number, string | null>>((acc, row) => {
          acc[row.round] = row.value;
          return acc;
        }, {})
      );
    });
    return () => { cancelled = true; };
  }, [game?.round_history, decryptValue]);

  // Host encrypts the word in place once the round is live.
  useEffect(() => {
    if (!game || !isHost || game.phase !== "playing" || !game.secret_word) return;
    if (isEncrypted(game.secret_word)) return;
    void callGameSecretInit("imposter", gameId, sessionId);
  }, [game, game?.phase, game?.secret_word, isHost, gameId, sessionId]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "imposter" });
  }, [game]);

  useEffect(() => {
    if (!game) return;
    if (game.phase === "ended") {
      showToast("The host ended the game", "info");
      navigate("/");
      return;
    }
    if (game.kicked.includes(sessionId)) {
      showToast("You were kicked from the game", "error");
      navigate("/");
    }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  // Timer auto-advance
  useEffect(() => {
    if (!game) return;
    const phaseEnd = game.settings.phaseEndsAt;
    if (!phaseEnd || (game.phase !== "playing" && game.phase !== "voting" && game.phase !== "results")) return;
    const remaining = phaseEnd - Date.now();
    if (remaining <= 0) {
      void zero.mutate(mutators.imposter.advanceTimer({ gameId }));
      return;
    }
    const timer = setTimeout(() => {
      void zero.mutate(mutators.imposter.advanceTimer({ gameId }));
    }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game?.settings.phaseEndsAt, game?.phase, gameId, zero]);

  // Announcement watcher (skip for host - they sent it)
  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement, isHost]);

  // No such game: don't strand the player on an empty screen.
  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  /* ── Who has started writing ──────────────────────────────────
     Over the realtime socket rather than the database: it is chatter, not
     state, and nothing about it is worth a row or a sync round trip. Anyone
     who missed the ping just sees "thinking" for a bit, which is the same
     thing they would see a second earlier anyway.

     Sticky for the round. A client announces once, on its first character,
     and this never removes anyone, so hesitating never shows. A signal that
     could go off again would point straight at whoever keeps deleting their
     clue, and whoever keeps deleting their clue is usually the imposter. */
  const [typing, setTyping] = useState<string[]>([]);
  const topic = `imposter-game:${gameId}`;

  useEffect(() => {
    setTyping([]);
  }, [game?.phase, game?.settings.currentRound]);

  useEffect(() => {
    if (!gameId || game?.phase !== "playing") return;
    return subscribeToRealtimeEvent<{ sessionId?: string }>(topic, "typing", (payload) => {
      const id = payload?.sessionId;
      if (!id) return;
      setTyping((current) => (current.includes(id) ? current : [...current, id]));
    });
  }, [topic, gameId, game?.phase]);

  const announceTyping = useCallback(() => {
    publishRealtimeEvent(topic, "typing", { sessionId });
  }, [topic, sessionId]);

  const joinGame = async () => {
    await ensureName(zero, sessionId);
    if (isSpectator) {
      void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId }))
        .client.then(() => zero.mutate(mutators.imposter.join({ gameId, sessionId })))
        .catch(() => showToast("Couldn't join game", "error"));
      return;
    }
    void zero.mutate(mutators.imposter.join({ gameId, sessionId }))
      .client.catch(() => showToast("Couldn't join game", "error"));
  };

  return {
    zero, navigate, gameId, game, me, isHost, inGame, isSpectator,
    sessionById, tally, visibleSecretWord, decryptedRoundWords,
    clue, setClue, voteTarget, setVoteTarget,
    typing, announceTyping,
    activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,

    submitClue: async (event: FormEvent) => {
      event.preventDefault();
      if (!clue.trim()) return;
      await optimistic(zero.mutate(mutators.imposter.submitClue({ gameId, sessionId, text: clue.trim() })));
      setClue("");
      playSoundSubmit();
    },

    submitVote: async () => {
      if (!voteTarget) return;
      await optimistic(zero.mutate(mutators.imposter.submitVote({ gameId, voterId: sessionId, targetId: voteTarget })));
      playVote();
    },

    joinGame,

    handleJoinClick: () => {
      if (inAnotherGame && activeGameType && activeGameId) {
        setJoiningFromOtherGame(true);
        void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
          .catch(() => showToast("Couldn't leave current game", "error"))
          .finally(() => {
            setJoiningFromOtherGame(false);
            void joinGame();
          });
        return;
      }
      void joinGame();
    },

    confirmLeaveAndJoin: () => {
      if (!activeGameType || !activeGameId) {
        setShowInSessionModal(false);
        void joinGame();
        return;
      }
      setJoiningFromOtherGame(true);
      void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
        .then(() => {
          setShowInSessionModal(false);
          void joinGame();
        })
        .catch(() => showToast("Couldn't leave current game", "error"))
        .finally(() => setJoiningFromOtherGame(false));
    },
  };
}
