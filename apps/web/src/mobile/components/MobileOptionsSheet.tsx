import { FiMoon, FiSun, FiPlay, FiVolume2, FiVolumeX } from "react-icons/fi";
import { useSettings, updateSettings } from "../../lib/settings";
import { BottomSheet } from "./BottomSheet";
import { mutators } from "@games/shared";
import { useZero } from "../../lib/zero";
import { nanoid } from "nanoid";
import { useNavigate } from "react-router-dom";
import { getOrCreateSessionId, getStoredName, addRecentGame } from "../../lib/session";
import { playPress } from "../../lib/sounds";

const isDev = import.meta.env.DEV;

export function MobileOptionsSheet({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const zero = useZero();
  const navigate = useNavigate();
  const sessionId = getOrCreateSessionId();
  const savedName = getStoredName() || "You";

  /* ── Demo game creators (dev only) ───────────────── */

  const go = (path: string) => { onClose(); navigate(path); };

  async function createDemoImposter(phase: "lobby" | "playing" | "voting" | "results") {
    const id = nanoid();
    const ts = Date.now();
    const fakePlayers = [
      { sessionId, name: savedName, connected: true, role: "player" as const },
      { sessionId: "demo-p2", name: "Alice", connected: true, role: "player" as const },
      { sessionId: "demo-p3", name: "Bob", connected: true, role: "player" as const },
      { sessionId: "demo-p4", name: "Charlie", connected: true, role: "imposter" as const },
      { sessionId: "demo-p5", name: "Diana", connected: false, role: "player" as const },
    ];
    const lobbyPlayers = fakePlayers.map(({ role: _r, ...p }) => p);
    const fakeClues = [
      { sessionId, text: "Fluffy", createdAt: ts - 30_000 },
      { sessionId: "demo-p2", text: "Barks", createdAt: ts - 25_000 },
      { sessionId: "demo-p3", text: "Loyal", createdAt: ts - 20_000 },
      { sessionId: "demo-p4", text: "Fast", createdAt: ts - 15_000 },
    ];
    const fakeVotes = [
      { voterId: sessionId, targetId: "demo-p4" },
      { voterId: "demo-p2", targetId: "demo-p4" },
      { voterId: "demo-p3", targetId: "demo-p4" },
      { voterId: "demo-p4", targetId: "demo-p2" },
    ];
    await zero.mutate(mutators.demo.seedImposter({
      id, hostId: sessionId, phase,
      secretWord: phase === "lobby" ? null : "Dog",
      players: phase === "lobby" ? lobbyPlayers : fakePlayers,
      clues: phase === "playing" || phase === "voting" || phase === "results" ? fakeClues : [],
      votes: phase === "results" ? fakeVotes : phase === "voting" ? fakeVotes.slice(0, 2) : [],
      currentRound: phase === "lobby" ? 1 : 2,
      phaseEndsAt: phase === "playing" || phase === "voting" ? ts + 60_000 : null,
    }));
    addRecentGame({ id, code: "DEMO", gameType: "imposter" });
    go(`/imposter/${id}`);
  }

  async function createDemoPassword(phase: "lobby" | "playing" | "results") {
    const id = nanoid();
    const ts = Date.now();
    const teams = [
      { name: "Team 1", members: [sessionId, "demo-p2"] },
      { name: "Team 2", members: ["demo-p3", "demo-p4"] },
    ];
    const scores: Record<string, number> = { "Team 1": phase === "results" ? 10 : 4, "Team 2": phase === "results" ? 7 : 3 };
    const rounds = phase !== "lobby" ? [
      { round: 1, teamIndex: 0, guesserId: "demo-p2", word: "Ocean", clues: [{ sessionId, text: "Waves" }], guess: "Ocean", correct: true },
      { round: 2, teamIndex: 1, guesserId: "demo-p4", word: "Fire", clues: [{ sessionId: "demo-p3", text: "Hot" }], guess: "Sun", correct: false },
      { round: 3, teamIndex: 0, guesserId: sessionId, word: "Guitar", clues: [{ sessionId: "demo-p2", text: "Strings" }], guess: "Guitar", correct: true },
    ] : [];
    const activeRounds = phase === "playing" ? [
      { teamIndex: 0, guesserId: "demo-p2", word: "Balloon" as string | null, clues: [] as Array<{ sessionId: string; text: string }>, guess: null as string | null },
      { teamIndex: 1, guesserId: "demo-p4", word: "Balloon" as string | null, clues: [] as Array<{ sessionId: string; text: string }>, guess: null as string | null },
    ] : [];
    await zero.mutate(mutators.demo.seedPassword({
      id, hostId: sessionId, phase, teams, scores, rounds,
      currentRound: phase === "lobby" ? 1 : 4, activeRounds, targetScore: 10,
      roundEndsAt: phase === "playing" ? ts + 45_000 : null,
    }));
    addRecentGame({ id, code: "DEMO", gameType: "password" });
    go(phase === "results" ? `/password/${id}/results` : phase === "playing" ? `/password/${id}` : `/password/${id}/begin`);
  }

  async function createDemoChainReaction(phase: "lobby" | "submitting" | "playing" | "finished") {
    const id = nanoid();
    const p1 = sessionId;
    const p2 = "demo-p2";
    const players = [
      { sessionId: p1, name: savedName, connected: true },
      { sessionId: p2, name: "Alice", connected: true },
    ];
    const lobbyPlayers = phase === "lobby" ? [players[0]!] : players;
    const p1Words = ["RAIN", "DROP", "KICK", "BACK", "FIRE"];
    const p2Words = ["SUN", "LIGHT", "HOUSE", "WORK", "OUT"];
    const makeSlots = (words: string[], progress: "none" | "partial" | "done") =>
      words.map((word, i) => {
        const isEdge = i === 0 || i === words.length - 1;
        if (progress === "none") return { word, revealed: isEdge, lettersShown: isEdge ? word.length : 0, solvedBy: null };
        if (progress === "partial") {
          const revealed = isEdge || i === 1;
          return { word, revealed, lettersShown: revealed ? word.length : (i === 2 ? 1 : 0), solvedBy: i === 1 ? p1 : null };
        }
        return { word, revealed: true, lettersShown: word.length, solvedBy: isEdge ? null : p1 };
      });
    let chain: Record<string, Array<{ word: string; revealed: boolean; lettersShown: number; solvedBy: string | null }>> = {};
    if (phase === "playing") {
      chain = { [p1]: makeSlots(p1Words, "partial"), [p2]: makeSlots(p2Words, "none") };
    } else if (phase === "finished") {
      chain = { [p1]: makeSlots(p1Words, "done"), [p2]: makeSlots(p2Words, "done") };
    }
    const roundHistory = phase === "finished" ? [
      { round: 1, chains: { [p1]: p1Words.map((word, i) => ({ word, solvedBy: i === 0 || i === p1Words.length - 1 ? null : p1, lettersShown: word.length })), [p2]: p2Words.map((word, i) => ({ word, solvedBy: i === 0 || i === p2Words.length - 1 ? null : p2, lettersShown: word.length })) }, scores: { [p1]: 2, [p2]: 1 } },
      { round: 2, chains: { [p1]: ["COLD", "SNAP", "CHAT", "ROOM", "KEY"].map((word, i) => ({ word, solvedBy: i === 0 || i === 4 ? null : p1, lettersShown: word.length })), [p2]: ["BLUE", "BELL", "TOWER", "BLOCK", "CHAIN"].map((word, i) => ({ word, solvedBy: i === 0 || i === 4 ? null : p2, lettersShown: word.length })) }, scores: { [p1]: 1, [p2]: 2 } },
    ] : [];
    const scores: Record<string, number> = phase === "lobby" ? {} : phase === "finished" ? { [p1]: 3, [p2]: 3 } : { [p1]: 1, [p2]: 0 };
    const submittedChains: Record<string, string[]> = phase === "submitting" ? { [p1]: p1Words } : {};
    await zero.mutate(mutators.demo.seedChainReaction({
      id, hostId: p1, phase, players: lobbyPlayers, chain, submittedChains, scores, roundHistory,
      settings: { chainLength: 5, rounds: phase === "finished" ? 2 : 3, currentRound: phase === "lobby" ? 1 : phase === "finished" ? 2 : 1, turnTimeSec: null, phaseEndsAt: null, chainMode: phase === "submitting" ? "custom" : "premade" },
    }));
    addRecentGame({ id, code: "DEMO", gameType: "chain_reaction" });
    go(`/chain-reaction/${id}`);
  }

  async function createDemoShadeSignal(phase: "lobby" | "clue1" | "guess1" | "reveal") {
    const id = nanoid();
    const players = [
      { sessionId, name: savedName, connected: true, totalScore: phase === "reveal" ? 8 : 0 },
      { sessionId: "demo-p2", name: "Alice", connected: true, totalScore: phase === "reveal" ? 5 : 0 },
      { sessionId: "demo-p3", name: "Bob", connected: true, totalScore: phase === "reveal" ? 3 : 0 },
      { sessionId: "demo-p4", name: "Charlie", connected: true, totalScore: phase === "reveal" ? 6 : 0 },
    ];
    const lobbyPlayers = phase === "lobby" ? players.slice(0, 2) : players;
    const leaderId = phase === "guess1" ? "demo-p2" : (phase === "lobby" ? null : sessionId);
    await zero.mutate(mutators.demo.seedShadeSignal({
      id, hostId: sessionId, phase, players: lobbyPlayers, leaderId,
      leaderOrder: lobbyPlayers.map((p) => p.sessionId),
      gridSeed: Math.floor(Math.random() * 100000),
      targetRow: phase === "lobby" ? null : 4, targetCol: phase === "lobby" ? null : 7,
      clue1: phase === "clue1" || phase === "guess1" || phase === "reveal" ? "Sunset" : null,
      clue2: phase === "reveal" ? "Warm glow" : null,
      guesses: phase === "reveal" ? [
        { sessionId: "demo-p2", round: 1, row: 5, col: 8 },
        { sessionId: "demo-p3", round: 1, row: 3, col: 6 },
        { sessionId: "demo-p4", round: 1, row: 4, col: 7 },
        { sessionId: "demo-p2", round: 2, row: 4, col: 8 },
        { sessionId: "demo-p3", round: 2, row: 4, col: 6 },
        { sessionId: "demo-p4", round: 2, row: 4, col: 7 },
      ] : [],
      currentRound: 1,
      phaseEndsAt: phase === "clue1" ? Date.now() + 45_000 : phase === "guess1" ? Date.now() + 30_000 : null,
    }));
    addRecentGame({ id, code: "DEMO", gameType: "shade_signal" });
    go(`/shade/${id}`);
  }

  async function createDemoLocationSignal(phase: "lobby" | "picking" | "clue1" | "guess1" | "reveal") {
    const id = nanoid();
    const players = [
      { sessionId, name: savedName, connected: true, totalScore: phase === "reveal" ? 2 : 0 },
      { sessionId: "demo-p2", name: "Alice", connected: true, totalScore: phase === "reveal" ? 5 : 0 },
      { sessionId: "demo-p3", name: "Bob", connected: true, totalScore: phase === "reveal" ? 3 : 0 },
      { sessionId: "demo-p4", name: "Charlie", connected: true, totalScore: phase === "reveal" ? 8 : 0 },
    ];
    const lobbyPlayers = phase === "lobby" ? players.slice(0, 2) : players;
    const leaderId = phase === "guess1" ? "demo-p2" : (phase === "lobby" ? null : sessionId);
    const targetLat = phase === "lobby" || phase === "picking" ? null : 41.9;
    const targetLng = phase === "lobby" || phase === "picking" ? null : 12.5;

    await zero.mutate(mutators.demo.seedLocationSignal({
      id,
      hostId: sessionId,
      phase,
      players: lobbyPlayers,
      leaderId,
      leaderOrder: lobbyPlayers.map((p) => p.sessionId),
      targetLat,
      targetLng,
      clue1: ["clue1", "guess1", "reveal"].includes(phase) ? "Ancient empire" : null,
      clue2: phase === "reveal" ? "Colosseum" : null,
      clue3: null,
      clue4: null,
      guesses: phase === "reveal" ? [
        { sessionId: "demo-p2", round: 1 as const, lat: 37.9, lng: 23.7 },
        { sessionId: "demo-p3", round: 1 as const, lat: 48.8, lng: 2.3 },
        { sessionId: "demo-p4", round: 1 as const, lat: 40.4, lng: -3.7 },
        { sessionId: "demo-p2", round: 2 as const, lat: 43.7, lng: 11.2 },
        { sessionId: "demo-p3", round: 2 as const, lat: 45.4, lng: 9.2 },
        { sessionId: "demo-p4", round: 2 as const, lat: 41.9, lng: 12.5 },
      ] : [],
      currentRound: 1,
      phaseEndsAt: phase === "clue1" ? Date.now() + 45_000 : phase === "guess1" ? Date.now() + 45_000 : phase === "reveal" ? Date.now() + 10_000 : null,
    }));

    addRecentGame({ id, code: "DEMO", gameType: "location_signal" });
    go(`/location/${id}`);
  }

  return (
    <BottomSheet title="Options" onClose={onClose}>
      <div className="m-options-group">
        <label className="m-options-label">Theme</label>
        <div className="m-options-row">
          <button
            className={`m-btn ${settings.theme === "dark" ? "m-btn-primary" : "m-btn-muted"}`}
            onClick={() => updateSettings({ theme: "dark" })}
          >
            <FiMoon size={14} /> Dark
          </button>
          <button
            className={`m-btn ${settings.theme === "light" ? "m-btn-primary" : "m-btn-muted"}`}
            onClick={() => updateSettings({ theme: "light" })}
          >
            <FiSun size={14} /> Light
          </button>
        </div>
      </div>

      <div className="m-options-group">
        <label className="m-options-label">Sound Effects</label>
        <div className="m-options-row">
          <button
            className={`m-btn ${!settings.soundEnabled ? "m-btn-primary" : "m-btn-muted"}`}
            onClick={() => updateSettings({ soundEnabled: false })}
          >
            <FiVolumeX size={14} /> Off
          </button>
          <button
            className={`m-btn ${settings.soundEnabled ? "m-btn-primary" : "m-btn-muted"}`}
            onClick={() => {
              updateSettings({ soundEnabled: true });
              setTimeout(() => playPress(), 50);
            }}
          >
            <FiVolume2 size={14} /> On
          </button>
        </div>
      </div>

      {isDev && (
        <div className="m-options-group">
          <label className="m-options-label"><FiPlay size={12} /> Dev: Demo Games</label>
          <div className="m-demo-grid">
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoImposter("lobby")}>Imp Lobby</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoImposter("playing")}>Imp Play</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoImposter("voting")}>Imp Vote</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoImposter("results")}>Imp Results</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoPassword("lobby")}>Pwd Lobby</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoPassword("playing")}>Pwd Play</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoPassword("results")}>Pwd Results</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoChainReaction("lobby")}>CR Lobby</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoChainReaction("submitting")}>CR Submit</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoChainReaction("playing")}>CR Play</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoChainReaction("finished")}>CR Finish</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoShadeSignal("lobby")}>SS Lobby</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoShadeSignal("clue1")}>SS Clue</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoShadeSignal("guess1")}>SS Guess</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoShadeSignal("reveal")}>SS Reveal</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoLocationSignal("lobby")}>LS Lobby</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoLocationSignal("picking")}>LS Pick</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoLocationSignal("clue1")}>LS Clue</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoLocationSignal("guess1")}>LS Guess</button>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => void createDemoLocationSignal("reveal")}>LS Reveal</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
