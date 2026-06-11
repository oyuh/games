import { useState } from "react";

const inputClass =
  "block w-full rounded-lg border border-zinc-700 bg-zinc-800 p-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50";
const buttonBaseClass =
  "rounded-lg px-4 py-2 text-center text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/50";
const lightButtonClass =
  "rounded-lg border border-zinc-600 bg-zinc-100 px-4 py-2 text-center text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-sky-400/50";

function PreviewCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-700/70 bg-zinc-900/75 p-4 text-zinc-100 shadow-[0_0_40px_rgba(15,23,42,0.5)] backdrop-blur md:p-6">
      {children}
    </div>
  );
}

export function HomePageStylePreview() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const primaryButtonClass = `${buttonBaseClass} bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]`;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-[0_0_60px_rgba(31,150,255,0.08)] md:p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-sky-300">Game Hub</p>
        <h1 className="mt-2 text-3xl font-semibold uppercase tracking-wider text-sky-300 md:text-4xl">Start a game</h1>
        <p className="mt-2 text-sm text-zinc-400">Create a room, share the code, and play instantly.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
      <PreviewCard>
        <h2 className="text-xl font-semibold uppercase tracking-wide text-sky-300">Start playing</h2>
        <p className="text-sm text-zinc-400">No sign-up. Play as guest or save a name on this device.</p>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-300">Display name (optional)</label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={30}
              placeholder="Player"
              className={inputClass}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClass}>Save name</button>
            <button type="button" className={lightButtonClass}>Play as guest</button>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-2">Style preview mode (no Zero/DB).</p>
      </PreviewCard>

      <PreviewCard>
        <h2 className="text-xl font-semibold uppercase tracking-wide text-sky-300">Create game</h2>
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" className={primaryButtonClass}>Create Imposter</button>
          <button type="button" className={lightButtonClass}>Create Password</button>
        </div>
      </PreviewCard>
      </div>

      <PreviewCard>
        <h2 className="text-xl font-semibold uppercase tracking-wide text-sky-300">Join game</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="Enter join code"
            className={inputClass}
          />
          <button type="button" className={primaryButtonClass}>Join</button>
        </div>
      </PreviewCard>

      <PreviewCard>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold uppercase tracking-wide text-sky-300">Recent games</h2>
          <button type="button" className={`${lightButtonClass} px-2 py-1 text-xs`}>Clear</button>
        </div>
        <p className="mt-3 text-sm text-zinc-400">No recent games yet. Create or join one to pin it here.</p>
      </PreviewCard>
    </div>
  );
}
