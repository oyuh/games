import { mutators, queries } from "@games/shared";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { playHint } from "../lib/sounds";
import { useChainReactionLiveTyping } from "./useChainReactionLiveTyping";
import { useGameSounds, playSoundSubmit, playSoundCorrect, playSoundWrong } from "./useGameSounds";

/** Declared in both page files before this; they import it from here now. */
export type ChainSlot = { word: string; revealed: boolean; lettersShown: number; solvedBy?: string | null };
export type ChainViewTarget = "self" | "opponent";

/**
 * The non-visual half of a chain reaction duel: queries, live typing, sounds,
 * the leave-on-unmount guard, round resets, and the guess / hint / give-up /
 * submit handlers.
 *
 * Desktop and mobile each had their own copy. Each view keeps its markup, plus
 * desktop's slot flash animation and mobile's countdown.
 *
 * @param onGuessResult fires after a guess is scored locally, so a view can
 *   run its own feedback animation. Desktop uses it for the slot flash.
 */
export function useChainReactionGame(
  sessionId: string,
  onGuessResult?: (index: number, isCorrect: boolean) => void,
) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";

  const [games] = useQuery(queries.chainReaction.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "chain_reaction", gameId }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const [submissionWords, setSubmissionWords] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [viewingTarget, setViewingTarget] = useState<ChainViewTarget>("self");
  const [giveUpConfirm, setGiveUpConfirm] = useState<number | null>(null);
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const submissionFirstInputRef = useRef<HTMLInputElement>(null);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);
  const isSpectator = useMemo(() => game?.spectators?.some((s) => s.sessionId === sessionId) ?? false, [game, sessionId]);
  const mySession = mySessionRows[0];
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "chain_reaction" || activeGameId !== gameId));

  const { liveBySession, publishDraft, clearDraft } = useChainReactionLiveTyping({
    enabled: Boolean(game?.phase === "playing" && inGame),
    gameId,
    sessionId,
    round: game?.settings.currentRound ?? null,
  });

  useGameSounds({
    phase: game?.phase,
    sessionId,
    isMyTurn: Boolean(game?.phase === "playing" && inGame),
  });

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  const isSpectatorRef = useRef(isSpectator);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;
  isSpectatorRef.current = isSpectator;

  useEffect(() => {
    if (isSpectator) showToast("You are a spectator", "info");
  }, [isSpectator]);

  // Unmount cleanup
  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.chainReaction.leaveSpectator({ gameId, sessionId }));
      } else if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.chainReaction.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = getDisplayName(s.name, s.id);
      return acc;
    }, {});
  }, [sessions]);

  const playerName = (id: string) => sessionById[id] ?? getDisplayName(null, id);
  const opponent = useMemo(() => game?.players.find((p) => p.sessionId !== sessionId), [game, sessionId]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "chain_reaction" });
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

  useEffect(() => {
    if (!game?.announcement) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    // Skip if same text & ts within 3s (optimistic vs server duplicate)
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement]);

  // Reset between rounds
  useEffect(() => {
    setEditingIndex(null);
    setGuess("");
    setHasSubmitted(false);
    setViewingTarget("self");
    setGiveUpConfirm(null);
    clearDraft();
  }, [clearDraft, game?.settings.currentRound, sessionId]);

  useEffect(() => {
    if (game?.phase === "submitting" && !hasSubmitted) {
      setSubmissionWords(Array.from({ length: game.settings.chainLength }, () => ""));
    }
  }, [game?.phase, game?.settings.chainLength, hasSubmitted]);

  useEffect(() => {
    if (game?.phase === "submitting" && game.submitted_chains[sessionId]) {
      setHasSubmitted(true);
    }
  }, [game?.phase, game?.submitted_chains, sessionId]);

  // Auto-focus the inline input, caret after the locked hint prefix (don't select it;
  // selecting would let the first keystroke try to overwrite the locked letters)
  useEffect(() => {
    if (editingIndex !== null) {
      const input = inlineInputRef.current;
      if (input) {
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    }
  }, [editingIndex]);

  useEffect(() => {
    if (game?.phase !== "submitting" || hasSubmitted || submissionWords.length === 0) return;
    const input = submissionFirstInputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [game?.phase, hasSubmitted, submissionWords.length]);

  useEffect(() => {
    if (editingIndex === null) {
      clearDraft();
      return;
    }
    publishDraft(editingIndex, guess);
  }, [clearDraft, editingIndex, guess, publishDraft]);

  // No such game: don't strand the player on an empty screen.
  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  const myChain: ChainSlot[] = game?.chain[sessionId] ?? [];
  const opponentId = opponent?.sessionId;
  const oppChain: ChainSlot[] = opponentId ? (game?.chain[opponentId] ?? []) : [];
  const isViewingMine = viewingTarget === "self" || !opponentId;
  const viewingId = isViewingMine ? sessionId : (opponentId ?? sessionId);
  const viewingChain = isViewingMine ? myChain : oppChain;
  const myDone = myChain.length > 0 && myChain.every((s) => s.revealed);

  const joinGame = async () => {
    await ensureName(zero, sessionId);
    void zero.mutate(mutators.chainReaction.join({ gameId, sessionId })).client.catch(() => showToast("Couldn't join", "error"));
  };

  return {
    zero, navigate, gameId, game, me, isHost, inGame, isSpectator, opponent, opponentId,
    sessionById, playerName, liveBySession,
    editingIndex, setEditingIndex, guess, setGuess,
    submissionWords, setSubmissionWords, hasSubmitted,
    viewingTarget, setViewingTarget, giveUpConfirm, setGiveUpConfirm,
    inlineInputRef, submissionFirstInputRef,
    activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,

    myChain, oppChain, isViewingMine, viewingId, viewingChain, myDone,
    oppDone: oppChain.length > 0 && oppChain.every((s) => s.revealed),
    viewingLiveDraft: !isViewingMine && opponentId ? liveBySession[opponentId] ?? null : null,
    submittedChainEntries: (game?.submitted_chains[sessionId] ?? []).map((word, index) => ({
      id: `submitted-chain-word-${index}`, word, index,
    })),
    myScore: game?.scores[sessionId] ?? 0,
    opponentScore: opponentId ? (game?.scores[opponentId] ?? 0) : 0,
    myName: playerName(sessionId),
    oppName: opponentId ? playerName(opponentId) : "???",
    myProgress: myChain.length > 0 ? myChain.filter((s) => s.revealed).length - 2 : 0,
    myTotal: myChain.length > 0 ? myChain.length - 2 : 0,
    oppProgress: oppChain.length > 0 ? oppChain.filter((s) => s.revealed).length - 2 : 0,
    oppTotal: oppChain.length > 0 ? oppChain.length - 2 : 0,

    handleSlotClick: (i: number) => {
      if (!isViewingMine || myDone) return;
      const slot = myChain[i];
      if (!slot || slot.revealed) return;
      setEditingIndex(i);
      // Prefill with revealed hint letters
      setGuess(slot.lettersShown > 0 ? slot.word.slice(0, slot.lettersShown) : "");
    },

    handleInlineGuess: async () => {
      if (editingIndex === null || !guess.trim()) return;
      const idx = editingIndex;
      const currentGuess = guess.trim();
      const slot = myChain[idx];
      clearDraft();
      setGuess("");
      setEditingIndex(null);

      const isCorrect = Boolean(slot && currentGuess.toLowerCase().trim() === slot.word.toLowerCase().trim());
      if (isCorrect) playSoundCorrect(); else playSoundWrong();
      onGuessResult?.(idx, isCorrect);

      try {
        await optimistic(zero.mutate(mutators.chainReaction.guess({ gameId, sessionId, wordIndex: idx, guess: currentGuess })));
      } catch {
        // Mutation error - stay out of editing
      }
    },

    handleHint: async (i: number) => {
      // Exit editing so the updated partial word is visible immediately
      if (editingIndex === i) {
        clearDraft();
        setEditingIndex(null);
        setGuess("");
      }
      try {
        await optimistic(zero.mutate(mutators.chainReaction.revealLetter({ gameId, sessionId, wordIndex: i })));
        playHint();
      } catch {
        // All revealable letters already shown
      }
    },

    handleGiveUp: async (i: number) => {
      if (giveUpConfirm !== i) {
        setGiveUpConfirm(i);
        return;
      }
      setGiveUpConfirm(null);
      if (editingIndex === i) {
        clearDraft();
        setEditingIndex(null);
        setGuess("");
      }
      try {
        await optimistic(zero.mutate(mutators.chainReaction.giveUp({ gameId, sessionId, wordIndex: i })));
      } catch {
        // Already revealed
      }
    },

    submitChain: async (event: FormEvent) => {
      event.preventDefault();
      if (submissionWords.some((w) => !w.trim())) return;
      try {
        await optimistic(zero.mutate(mutators.chainReaction.submitChain({
          gameId, sessionId, words: submissionWords.map((w) => w.trim()),
        })));
        setHasSubmitted(true);
        playSoundSubmit();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Submit failed", "error");
      }
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
