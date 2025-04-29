"use client";

import { FaTwitter, FaInstagram, FaDiscord, FaGlobe, FaInfoCircle } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { useSessionInfo } from "./_components/session-modal";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { imposterCategories } from "~/data/categoryList";
import Image from "next/image";

// Use display names from the imposterCategories object
const categoryOptions = Object.values(imposterCategories).map(category => category.displayName);

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
  useTeams?: boolean;
  minTeams?: number;
  maxTeams?: number;
  playersPerTeam?: string;
}

interface Game {
  key: string;
  name: string;
  description: string;
  available: boolean;
  color: string;
  fields: GameField[];
  info?: GameInfo;
  useTeams?: boolean;
}

const games: Game[] = [
  {
    key: "imposter",
    name: "Imposter",
    description: "Blend in or find the imposter!",
    available: true,
    color: "blue",
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
    description: "Give clues, guess the word, beat the other teams!",
    available: true,
    color: "blue",
    useTeams: true,
    fields: [
      { label: "Number of Teams", name: "numTeams", type: "number", min: 2, max: 10, required: true, defaultValue: 2 },
      { label: "Points to Win", name: "pointsToWin", type: "number", min: 1, max: 20, required: true, defaultValue: 5 },
    ],
    info: {
      howToPlay: [
        "Players split into teams of 2.",
        "One player gives one-word clues to help their teamate guess a phrase.",
      ],
      minPlayers: 4,
      maxPlayers: 20,
      useTeams: true,
      minTeams: 2,
      maxTeams: 10,
      playersPerTeam: "2",
      estimatedTime: "20-40 minutes",
      difficulty: "Medium"
    }
  },
  {
    key: "hangman",
    name: "Hangman",
    description: "Classic word guessing game.",
    available: false,
    color: "blue",
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
    color: "blue",
    useTeams: true,
    fields: [
      { label: "Number of Teams", name: "numTeams", type: "number", min: 2, max: 8, required: true, defaultValue: 2 },
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
      useTeams: true,
      minTeams: 2,
      maxTeams: 8,
      playersPerTeam: "2+",
      estimatedTime: "30-45 minutes",
      difficulty: "Medium"
    }
  },
  {
    key: "hues-and-cues",
    name: "Hues and Cues",
    description: "Guess the color from clues!",
    available: false,
    color: "blue",
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
      <DialogContent className="bg-card text-main border border-secondary/30 rounded-xl shadow-lg max-w-lg mx-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">
            {game.name}
          </DialogTitle>
          <DialogDescription className="text-main text-base">{game.description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-6">
          <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
            <h3 className="font-bold text-lg text-primary mb-3">How to Play:</h3>
            <ul className="list-disc pl-5 space-y-2 text-main">
              {game.info.howToPlay.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
              <h3 className="font-bold text-primary mb-2">Players:</h3>
              <p className="text-main">{game.info.minPlayers}-{game.info.maxPlayers} players</p>
            </div>
            {game.info.useTeams && (
              <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
                <h3 className="font-bold text-primary mb-2">Teams:</h3>
                <p className="text-main">{game.info.minTeams}-{game.info.maxTeams} teams</p>
                <p className="text-main">{game.info.playersPerTeam} players per team</p>
              </div>
            )}
            <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
              <h3 className="font-bold text-primary mb-2">Time:</h3>
              <p className="text-main">{game.info.estimatedTime}</p>
            </div>
            <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
              <h3 className="font-bold text-primary mb-2">Difficulty:</h3>
              <p className="text-main">{game.info.difficulty}</p>
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
    <input
      id={id}
      name={name}
      type="number"
      min={min}
      max={max}
      defaultValue={defaultValue}
      className="bg-main text-main border border-secondary/30 rounded-md px-3 py-2 w-full text-center text-lg"
      disabled={disabled}
    />
  );
}

export default function HomePage() {
  const router = useRouter();
  const { session } = useSessionInfo();
  const [currentGameInfo, setCurrentGameInfo] = useState<Game | null>(null);

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

  async function handleCreatePasswordGame(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session?.entered_name || !session?.id) {
      alert("You must enter your name before creating a game.");
      return;
    }
    const form = e.currentTarget;
    const formData = new FormData(form);
    const teams = formData.get("numTeams");
    const pointsToWin = formData.get("pointsToWin");
    const res = await fetch("/api/password/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostId: session.id,
        teams,
        pointsToWin,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.game?.id) {
        router.push(`/password/${data.game.id}/begin`);
      }
    } else {
      alert("Failed to create game. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-main text-main font-sans flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background logo - top left */}
      <div className="absolute top-[20px] left-[20px] opacity-[0.05] transform scale-[2.5] rotate-[-15deg] z-0 pointer-events-none select-none">
        <Image
          src="/favicon.png"
          alt=""
          width={200}
          height={200}
          className="filter brightness-90 blur-[6px]"
          priority
        />
      </div>

      {/* Background logo - bottom right */}
      <div className="absolute bottom-[20px] right-[20px] opacity-[0.05] transform scale-[2.2] rotate-[10deg] z-0 pointer-events-none select-none">
        <Image
          src="/favicon.png"
          alt=""
          width={160}
          height={160}
          className="filter brightness-90 blur-[6px]"
          priority
        />
      </div>

      <div className="w-full max-w-5xl relative z-10">
        <h1 className="text-4xl sm:text-5xl font-extrabold animate-gradient bg-gradient-to-r from-[#7ecbff] via-[#3a6ea7] to-[#7ecbff] bg-[400%_auto] bg-clip-text text-transparent text-center uppercase tracking-widest mb-10 drop-shadow-lg">
          Start A Game
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game) => (
            <form
              key={game.key}
              className="bg-card bg-gradient-to-br from-[#232323] to-[#181a1b] border border-primary/20 rounded-2xl shadow-xl p-6 flex flex-col gap-4 items-center transition-transform duration-150 hover:scale-[1.025] hover:shadow-2xl focus-within:scale-[1.025] focus-within:shadow-2xl min-h-[420px]"
              onSubmit={
                game.key === "imposter"
                  ? handleCreateImposterGame
                  : game.key === "password"
                  ? handleCreatePasswordGame
                  : (e) => e.preventDefault()
              }
            >
              <div className="w-full flex flex-col items-center gap-1">
                <h2 className="text-2xl font-bold animate-gradient bg-gradient-to-r from-[#7ecbff] via-[#3a6ea7] to-[#7ecbff] bg-[400%_auto] bg-clip-text text-transparent text-center uppercase tracking-wide mb-1">{game.name}</h2>
                <p className="text-secondary font-medium text-center text-base mb-2">{game.description}</p>
                {game.info && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border border-primary/30 text-primary hover:bg-primary/10 transition w-32 h-10 mb-1"
                    onClick={() => setCurrentGameInfo(game)}
                  >
                    Learn More
                  </Button>
                )}
              </div>

              <div className="w-full bg-secondary/10 rounded-xl p-4 border border-secondary/30 mt-1">
                <h3 className="text-base font-bold text-primary border-b border-primary/20 pb-2 mb-3">Game Options</h3>
                <div className="space-y-4">
                  {game.fields.map((field) => (
                    <div key={field.name} className="flex flex-col gap-1">
                      <label htmlFor={`${game.key}-${field.name}`} className="text-sm font-semibold text-primary">
                        {field.label}
                      </label>
                      {field.type === "select" ? (
                        <select
                          id={`${game.key}-${field.name}`}
                          name={field.name}
                          required={field.required}
                          defaultValue=""
                          className="bg-main text-main border border-secondary/30 rounded-md px-3 py-2 w-full"
                          disabled={!game.available}
                        >
                          <option value="" disabled className="text-secondary">Select a category</option>
                          {field.options?.map((opt: string) => (
                            <option key={opt} value={opt} className="text-main bg-card">{opt}</option>
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
                          className="bg-main text-main border border-secondary/30 rounded-md px-3 py-2 w-full"
                          disabled={!game.available}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {game.available ? (
                <Button
                  type="submit"
                  className="w-full mt-3 text-base font-semibold py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition"
                >
                  Create {game.name} Game
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full mt-3 opacity-80 text-base font-semibold py-2 rounded-lg"
                  variant="secondary"
                  disabled
                >
                  Coming Soon
                </Button>
              )}
            </form>
          ))}

          {/* Links/Social Card */}
          <div className="bg-card bg-gradient-to-br from-[#232323] to-[#181a1b] border border-primary/20 rounded-2xl shadow-xl p-6 flex flex-col gap-4 items-center min-h-[420px]">
            <h2 className="text-2xl font-bold animate-gradient bg-gradient-to-r from-[#7ecbff] via-[#3a6ea7] to-[#7ecbff] bg-[400%_auto] bg-clip-text text-transparent text-center uppercase tracking-wide mb-1">And More...</h2>
            <p className="text-secondary font-medium text-center text-base mb-2">More games coming soon!</p>

            <div className="w-full bg-secondary/10 rounded-xl p-4 border border-secondary/30 mt-1">
              <h3 className="text-base font-bold text-primary border-b border-primary/20 pb-2 mb-3">Connect</h3>
              <div className="flex flex-col gap-3 w-full">
                <a href="https://twitter.com/sumboutlaw" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-md text-sm font-semibold bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition">
                  <div className="flex items-center gap-2">
                    <FaTwitter className="text-primary w-5 h-5" />
                    <span>Twitter</span>
                  </div>
                  <span className="text-secondary">@sumboutlaw</span>
                </a>
                <a href="https://instagram.com/lawsonwtf" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-md text-sm font-semibold bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition">
                  <div className="flex items-center gap-2">
                    <FaInstagram className="text-primary w-5 h-5" />
                    <span>Instagram</span>
                  </div>
                  <span className="text-secondary">@lawsonwtf</span>
                </a>
                <a href="https://discordapp.com/users/527167786200465418" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-md text-sm font-semibold bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition">
                  <div className="flex items-center gap-2">
                    <FaDiscord className="text-primary w-5 h-5" />
                    <span>Discord</span>
                  </div>
                  <span className="text-secondary">wthlaw</span>
                </a>
                <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-md text-sm font-semibold bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition">
                  <div className="flex items-center gap-2">
                    <FaGlobe className="text-primary w-5 h-5" />
                    <span>Website</span>
                  </div>
                  <span className="text-secondary">lawsonhart.me</span>
                </a>
              </div>
            </div>

            <p className="text-main text-center text-base mt-4">Stay tuned for updates!</p>
          </div>
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
