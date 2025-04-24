"use client";

import { FaTwitter, FaInstagram, FaDiscord, FaGlobe } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { useSessionInfo } from "./_components/session-modal";

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

interface Game {
  key: string;
  name: string;
  description: string;
  available: boolean;
  fields: GameField[];
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
  },
];

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
        host_id: session.id, // Use the UUID from session
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
        <button
          type="button"
          className="btn-primary py-2 px-6 rounded-md text-lg font-semibold bg-primary text-main hover:bg-primary/90 transition shadow-lg"
          onClick={handleJoinGame}
        >
          Join Game
        </button>
      </div>
      <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {games.map((game) => (
          <form
            key={game.key}
            className="bg-card border border-secondary rounded-xl shadow-lg p-6 flex flex-col gap-4 items-center"
            onSubmit={game.key === "imposter" ? handleCreateImposterGame : (e) => e.preventDefault()}
          >
            <div className="w-full flex flex-col items-center gap-1">
              <h2 className="text-2xl font-bold text-primary mb-1 text-center uppercase tracking-wide">{game.name}</h2>
              <p className="text-secondary text-center text-base mb-2">{game.description}</p>
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
    </main>
  );
}
