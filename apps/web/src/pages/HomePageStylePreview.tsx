import { Button, Card, Label, TextInput } from "flowbite-react";
import { useState } from "react";

export function HomePageStylePreview() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const cardClass = "border border-zinc-700/70 !bg-zinc-900/75 text-zinc-100 shadow-[0_0_40px_rgba(15,23,42,0.5)] backdrop-blur";
  const primaryButtonClass = "bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]";

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-[0_0_60px_rgba(31,150,255,0.08)] md:p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-sky-300">Game Hub</p>
        <h1 className="mt-2 text-3xl font-semibold uppercase tracking-wider text-sky-300 md:text-4xl">Start a game</h1>
        <p className="mt-2 text-sm text-zinc-400">Create a room, share the code, and play instantly.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
      <Card className={cardClass}>
        <h2 className="text-xl font-semibold uppercase tracking-wide text-sky-300">Start playing</h2>
        <p className="text-sm text-zinc-400">No sign-up. Play as guest or save a name on this device.</p>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="name" value="Display name (optional)" className="text-zinc-300" />
            <TextInput
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={30}
              placeholder="Player"
              color="gray"
              theme={{
                field: {
                  input: {
                    base: "block w-full border disabled:cursor-not-allowed disabled:opacity-50",
                    colors: {
                      gray: "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-sky-400 focus:ring-sky-400"
                    }
                  }
                }
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className={primaryButtonClass}>Save name</Button>
            <Button color="light">Play as guest</Button>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-2">Style preview mode (no Zero/DB).</p>
      </Card>

      <Card className={cardClass}>
        <h2 className="text-xl font-semibold uppercase tracking-wide text-sky-300">Create game</h2>
        <div className="mt-3 flex flex-col gap-2">
          <Button className={primaryButtonClass}>Create Imposter</Button>
          <Button color="light">Create Password</Button>
        </div>
      </Card>
      </div>

      <Card className={cardClass}>
        <h2 className="text-xl font-semibold uppercase tracking-wide text-sky-300">Join game</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <TextInput
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="Enter join code"
            color="gray"
            theme={{
              field: {
                input: {
                  base: "block w-full border disabled:cursor-not-allowed disabled:opacity-50",
                  colors: {
                    gray: "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-sky-400 focus:ring-sky-400"
                  }
                }
              }
            }}
          />
          <Button className={primaryButtonClass}>Join</Button>
        </div>
      </Card>

      <Card className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold uppercase tracking-wide text-sky-300">Recent games</h2>
          <Button color="light" size="xs">Clear</Button>
        </div>
        <p className="mt-3 text-sm text-zinc-400">No recent games yet. Create or join one to pin it here.</p>
      </Card>
    </div>
  );
}
