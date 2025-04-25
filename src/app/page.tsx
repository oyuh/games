"use client";

import { FaTwitter, FaInstagram, FaDiscord, FaGlobe, FaInfoCircle } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { useSessionInfo } from "./_components/session-modal";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";

const categoryOptions = [
  "Animals",
  "Movies",
  "Food",
  "Sports",
  "Places",
  "Celebrities",
  "Brands",
  "Custom..."
];

interface GameField {
  label: string;
  name: string;
  type: string;
  options?: string[];
  required: boolean;
  min?: number;
  max?: number;
  defaultValue?: number;
  placeholder?: string;
}

interface GameInfo {
  howToPlay: string[];
  minPlayers: number;
  maxPlayers: number;
  estimatedTime: string;
  difficulty: string;
}

interface Game {
  key: string;
  name: string;
  description: string;
  available: boolean;
  fields: GameField[];
  info?: GameInfo;
}

const games: Game[] = [
  {
    key: "imposter",
    name: "Imposter",
    description: "Blend in or find the imposter!",
    available: true,
    fields: [
      { label: "Category", name: "category", type: "select", options: categoryOptions, required: true },
      { label: "Max Players", name: "maxPlayers", type: "number", min: 3, max: 20, required: true, defaultValue: 8 },
      { label: "Number of Imposters", name: "numImposters", type: "number", min: 1, max: 5, required: true, defaultValue: 1 },
    ],
    info: {
      howToPlay: [
        "All players except the imposter receive the same word from the chosen category.",
        "The imposter receives a similar but different word.",
        "Players take turns describing their word without saying it directly.",
        "After everyone has spoken, players vote on who they think is the imposter.",
        "The imposter wins if they aren't identified or if they can guess the real word."
      ],
      minPlayers: 3,
      maxPlayers: 20,
      estimatedTime: "15-30 minutes",
      difficulty: "Easy to learn"
    }
  },
  {
    key: "password",
    name: "Password",
    description: "Give clues, guess the word, beat the other team!",
    available: false,
    fields: [
      { label: "Max Players", name: "maxPlayers", type: "number", min: 4, max: 20, required: true },
      { label: "Points to Win", name: "pointsToWin", type: "number", min: 1, max: 20, required: true, defaultValue: 5 },
    ],
    info: {
      howToPlay: [
        "Players split into two teams.",
        "One player gives one-word clues to help their team guess a set of words.",
        "Teams take turns, trying to guess all their words first.",
        "Be careful not to give clues for the opposing team's words!"
      ],
      minPlayers: 4,
      maxPlayers: 20,
      estimatedTime: "20-40 minutes",
      difficulty: "Medium"
    }
  },
  {
    key: "hangman",
    name: "Hangman",
    description: "Classic word guessing game.",
    available: false,
    fields: [
      { label: "Category or Word List", name: "category", type: "select", options: categoryOptions, required: true },
      { label: "Max Incorrect Guesses", name: "maxIncorrect", type: "number", min: 3, max: 10, required: true, defaultValue: 6 },
    ],
    info: {
      howToPlay: [
        "A random word is selected from the chosen category.",
        "Players guess one letter at a time.",
        "Correct guesses reveal where that letter appears in the word.",
        "Incorrect guesses count against the maximum allowed.",
        "Players win by guessing the word before reaching the maximum incorrect guesses."
      ],
      minPlayers: 1,
      maxPlayers: 10,
      estimatedTime: "5-15 minutes",
      difficulty: "Easy"
    }
  },
  {
    key: "wavelength",
    name: "Wavelength",
    description: "Guess the position on the scale!",
    available: false,
    fields: [
      { label: "Max Players", name: "maxPlayers", type: "number", min: 4, max: 20, required: true },
      { label: "Points to Win", name: "pointsToWin", type: "number", min: 1, max: 20, required: true, defaultValue: 10 },
    ],
    info: {
      howToPlay: [
        "Players split into teams.",
        "A secret target is placed on a spectrum between two opposites (e.g., Hot—Cold).",
        "The clue-giver sees the target and gives a clue to help their team guess its position.",
        "Teams score points based on how close their guess is to the target.",
        "First team to reach the target points wins."
      ],
      minPlayers: 4,
      maxPlayers: 20,
      estimatedTime: "30-45 minutes",
      difficulty: "Medium"
    }
  },
  {
    key: "hues-and-cues",
    name: "Hues and Cues",
    description: "Guess the color from clues!",
    available: false,
    fields: [
      { label: "Max Players", name: "maxPlayers", type: "number", min: 3, max: 20, required: true },
      { label: "Rounds", name: "rounds", type: "number", min: 1, max: 20, required: true, defaultValue: 5 },
    ],
    info: {
      howToPlay: [
        "One player selects a color from the grid and gives a one-word clue.",
        "Other players place their markers where they think the color is located.",
        "The clue-giver gives a second clue, and players can adjust their guesses.",
        "Points are awarded based on proximity to the target color.",
        "Players take turns being the clue-giver."
      ],
      minPlayers: 3,
      maxPlayers: 20,
      estimatedTime: "30 minutes",
      difficulty: "Easy to Medium"
    }
  },
];

// Add the GameInfoDialog component
function GameInfoDialog({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  if (!game.info) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card text-main border border-secondary max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-primary">{game.name}</DialogTitle>
          <DialogDescription className="text-secondary">{game.description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="font-bold text-primary mb-2">How to Play:</h3>
            <ul className="list-disc pl-5 space-y-1 text-main">
              {game.info.howToPlay.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4 text-main">
            <div>
              <h3 className="font-bold text-primary">Players:</h3>
              <p>{game.info.minPlayers}-{game.info.maxPlayers} players</p>
            </div>
            <div>
              <h3 className="font-bold text-primary">Time:</h3>
              <p>{game.info.estimatedTime}</p>
            </div>
            <div>
              <h3 className="font-bold text-primary">Difficulty:</h3>
              <p>{game.info.difficulty}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface NumberInputProps {
  id: string;
  name: string;
  min: number;
  max: number;
  defaultValue?: number;
  disabled?: boolean;
}

function NumberInput({ id, name, min, max, defaultValue, disabled }: NumberInputProps) {
  return (
    <div className="flex items-center gap-2 justify-center w-full">
      <button type="button" className="px-2 py-1 rounded bg-secondary text-main" onClick={e => {
        e.preventDefault();
        const input = document.getElementById(id) as HTMLInputElement;
        if (input && !disabled) input.stepDown();
      }} disabled={disabled}>-</button>
      <input
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="input w-16 text-center bg-main text-main border border-secondary rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
        disabled={disabled}
      />
      <button type="button" className="px-2 py-1 rounded bg-secondary text-main" onClick={e => {
        e.preventDefault();
        const input = document.getElementById(id) as HTMLInputElement;
        if (input && !disabled) input.stepUp();
      }} disabled={disabled}>+</button>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { session } = useSessionInfo();
  const [currentGameInfo, setCurrentGameInfo] = useState<Game | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joiningGame, setJoiningGame] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Function to handle joining by code
  async function handleJoinByCode() {
    if (!joinCode.trim()) return;
    if (!session?.entered_name || !session?.id) {
      alert("You must enter your name before joining a game.");
      return;
    }

    setJoiningGame(true);
    setJoinError("");

    try {
      // Only call the join-by-code endpoint
      const joinRes = await fetch(`/api/imposter/join-by-code/${joinCode}`, { method: "POST" });
      if (joinRes.ok) {
        const data = await joinRes.json();
        router.push(`/imposter/${data.id}/begin`);
      } else if (joinRes.status === 404) {
        setJoinError("Game not found with that code.");
      } else if (joinRes.status === 401) {
        setJoinError("You must enter your name before joining a game.");
      } else {
        setJoinError("Failed to join game.");
      }
    } catch (error) {
      setJoinError("Error joining game. Please try again.");
    } finally {
      setJoiningGame(false);
    }
  }

  async function handleCreateImposterGame(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session?.entered_name || !session?.id) {
      alert("You must enter your name before creating a game.");
      return;
    }
    const form = e.currentTarget;
    const formData = new FormData(form);
    const category = formData.get("category");
    const maxPlayers = formData.get("maxPlayers");
    const numImposters = formData.get("numImposters");
    const res = await fetch("/api/imposter/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host_id: session.id,
        category,
        maxPlayers,
        numImposters,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.game?.id) {
        router.push(`/imposter/${data.game.id}/begin`);
      }
    } else {
      alert("Failed to create game. Please try again.");
    }
  }

  async function handleJoinGame() {
    const link = window.prompt("Paste the join game link:");
    if (!link) return;
    try {
      // Only allow links that start with the current origin or a valid relative path
      const url = new URL(link, window.location.origin);
      if (!url.pathname.startsWith("/")) {
        alert("Invalid link. Please paste a valid join link.");
        return;
      }
      const confirmJoin = window.confirm(`Join game at: ${url.pathname}?`);
      if (confirmJoin) {
        router.push(url.pathname + url.search + url.hash);
      }
    } catch {
      alert("Invalid link. Please paste a valid join link.");
    }
  }

  return (
    <main className="min-h-screen bg-main text-main font-sans flex flex-col items-center justify-center px-4 py-8">
      <h1 className="text-4xl font-bold mb-6 text-primary text-center">Start a Game</h1>
      <div className="w-full flex justify-center mb-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-4 items-center">
            <input
              type="text"
              placeholder="Enter game code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="input bg-main text-main border border-secondary rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              className="btn-primary py-2 px-6 rounded-md text-lg font-semibold bg-primary text-main hover:bg-primary/90 transition shadow-lg"
              onClick={handleJoinByCode}
              disabled={joiningGame || !joinCode.trim()}
            >
              {joiningGame ? "Joining..." : "Join Game"}
            </button>
          </div>
          {joinError && <div className="text-destructive text-center">{joinError}</div>}
          <span
            className="text-secondary hover:text-primary text-sm underline mt-2 cursor-pointer"
            onClick={handleJoinGame}
          >
            Or join by link
          </span>
        </div>
      </div>
      <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {games.map((game) => (
          <form
            key={game.key}
            className="bg-card border border-secondary rounded-xl shadow-lg p-6 flex flex-col gap-4 items-center relative"
            onSubmit={game.key === "imposter" ? handleCreateImposterGame : (e) => e.preventDefault()}
          >
            <div className="w-full flex flex-col items-center gap-1">
              <h2 className="text-2xl font-bold text-primary mb-1 text-center uppercase tracking-wide">{game.name}</h2>
              <p className="text-secondary text-center text-base mb-2">{game.description}</p>
              {game.info && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="font-semibold text-main bg-secondary hover:bg-secondary/90 mt-1 mb-2"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentGameInfo(game);
                  }}
                >
                  Learn More
                </Button>
              )}
            </div>
            <div className="w-full flex flex-col gap-3">
              {game.fields.map((field) => (
                <div key={field.name} className="flex flex-col gap-1">
                  <label htmlFor={`${game.key}-${field.name}`} className="text-sm font-bold text-primary tracking-wide uppercase">
                    {field.label}
                  </label>
                  {field.type === "select" ? (
                    <select
                      id={`${game.key}-${field.name}`}
                      name={field.name}
                      required={field.required}
                      className="input bg-main text-main border border-secondary rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary font-semibold uppercase tracking-wide"
                      disabled={!game.available}
                    >
                      <option value="" disabled selected className="text-secondary">Select a category</option>
                      {field.options?.map((opt: string) => (
                        <option key={opt} value={opt} className="text-main bg-card font-semibold uppercase tracking-wide">{opt}</option>
                      ))}
                    </select>
                  ) : field.type === "number" ? (
                    <NumberInput
                      id={`${game.key}-${field.name}`}
                      name={field.name}
                      min={field.min!}
                      max={field.max!}
                      defaultValue={field.defaultValue}
                      disabled={!game.available}
                    />
                  ) : (
                    <input
                      id={`${game.key}-${field.name}`}
                      name={field.name}
                      type={field.type}
                      min={field.min}
                      max={field.max}
                      required={field.required}
                      placeholder={field.placeholder}
                      defaultValue={field.defaultValue}
                      className="input bg-main text-main border border-secondary rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary font-semibold uppercase tracking-wide"
                      disabled={!game.available}
                    />
                  )}
                </div>
              ))}
            </div>
            {game.available ? (
              <button
                type="submit"
                className="btn-primary w-full mt-2 py-2 rounded-md text-lg font-semibold bg-primary text-main hover:bg-primary/90 transition"
              >
                Create {game.name} Game
              </button>
            ) : (
              <button
                type="button"
                className="w-full mt-2 py-2 rounded-md text-lg font-semibold bg-destructive text-main cursor-not-allowed opacity-80"
                disabled
              >
                Coming Soon
              </button>
            )}
          </form>
        ))}

        {/* Links/Social Card - No changes needed here */}
        <div className="bg-card border border-secondary rounded-xl shadow-lg p-6 flex flex-col gap-4 items-center">
          <h2 className="text-2xl font-bold text-primary mb-1 text-center">And More...</h2>
          <p className="text-secondary text-center text-base mb-4">More games coming soon!</p>
          <div className="flex flex-col gap-3 w-full">
            <a href="https://twitter.com/sumboutlaw" target="_blank" rel="noopener noreferrer"
              className="btn-primary w-full flex items-center justify-center gap-2 py-2 rounded-md text-lg font-semibold bg-primary text-main hover:bg-primary/90 transition">
              <FaTwitter className="text-main w-5 h-5" />
              Twitter: @sumboutlaw
            </a>
            <a href="https://instagram.com/lawsonwth" target="_blank" rel="noopener noreferrer"
              className="btn-primary w-full flex items-center justify-center gap-2 py-2 rounded-md text-lg font-semibold bg-secondary text-main hover:bg-secondary/90 transition">
              <FaInstagram className="text-main w-5 h-5" />
              Instagram: @lawsonwth
            </a>
            <a href="https://discord.gg/yourdiscordlink" target="_blank" rel="noopener noreferrer"
              className="btn-primary w-full flex items-center justify-center gap-2 py-2 rounded-md text-lg font-semibold bg-[#5865F2] text-main hover:bg-[#4752c4] transition">
              <FaDiscord className="text-main w-5 h-5" />
              Discord: wthlaw
            </a>
            <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer"
              className="btn-primary w-full flex items-center justify-center gap-2 py-2 rounded-md text-lg font-semibold bg-secondary text-main hover:bg-secondary/90 transition">
              <FaGlobe className="text-main w-5 h-5" />
              Website: lawsonhart.me
            </a>
          </div>
          <p className="text-secondary text-center text-base mt-4">Stay tuned for updates!</p>
        </div>
      </div>

      {/* Game Info Dialog */}
      {currentGameInfo && (
        <GameInfoDialog
          game={currentGameInfo}
          open={!!currentGameInfo}
          onClose={() => setCurrentGameInfo(null)}
        />
      )}
    </main>
  );
}
