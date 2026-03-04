import { mutators, queries } from "@games/shared";
import { Button, Card, Label, TextInput } from "flowbite-react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { nanoid } from "nanoid";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addRecentGame, clearRecentGames, getRecentGames, getStoredName, setStoredName } from "../lib/session";

export function HomePage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const [name, setName] = useState(getStoredName());
  const [savedName, setSavedName] = useState(getStoredName());
  const [recentGames, setRecentGames] = useState(getRecentGames());
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"create-imposter" | "create-password" | "join" | null>(null);
  const [imposterMatches] = useQuery(queries.imposter.byCode({ code: joinCode || "______" }));
  const [passwordMatches] = useQuery(queries.password.byCode({ code: joinCode || "______" }));

  useEffect(() => {
    setName(savedName);
  }, [savedName]);

  const syncSessionProfile = async (nextName: string) => {
    await zero
      .mutate(
        mutators.sessions.upsert({
          id: sessionId,
          name: nextName || null
        })
      )
      .server;
  };

  useEffect(() => {
    void syncSessionProfile(savedName);
  }, [zero, sessionId, savedName]);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    setStoredName(trimmedName);
    setSavedName(trimmedName);
    if (trimmedName) {
      await zero.mutate(mutators.sessions.setName({ id: sessionId, name: trimmedName })).server;
      return;
    }
    await syncSessionProfile("");
  };

  const playAsGuest = async () => {
    setStoredName("");
    setSavedName("");
    setName("");
    await syncSessionProfile("");
  };

  const createImposter = async () => {
    setError(null);
    setPendingAction("create-imposter");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.imposter.create({ id, hostId: sessionId })).server;
      if (result.type === "error") {
        setError(result.error.message);
        return;
      }
      navigate(`/imposter/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createPassword = async () => {
    setError(null);
    setPendingAction("create-password");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.password.create({ id, hostId: sessionId })).server;
      if (result.type === "error") {
        setError(result.error.message);
        return;
      }
      navigate(`/password/${id}/begin`);
    } finally {
      setPendingAction(null);
    }
  };

  const joinAny = async () => {
    setError(null);
    setPendingAction("join");

    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError("Enter a join code first.");
      setPendingAction(null);
      return;
    }

    try {
      const imposterGame = imposterMatches[0];
      if (imposterGame) {
        const result = await zero
          .mutate(
            mutators.imposter.join({
              gameId: imposterGame.id,
              sessionId
            })
          )
          .server;
        if (result.type === "error") {
          setError(result.error.message);
          return;
        }
        addRecentGame({ id: imposterGame.id, code: imposterGame.code, gameType: "imposter" });
        setRecentGames(getRecentGames());
        navigate(`/imposter/${imposterGame.id}`);
        return;
      }

      const passwordGame = passwordMatches[0];
      if (passwordGame) {
        const result = await zero
          .mutate(
            mutators.password.join({
              gameId: passwordGame.id,
              sessionId
            })
          )
          .server;
        if (result.type === "error") {
          setError(result.error.message);
          return;
        }
        addRecentGame({ id: passwordGame.id, code: passwordGame.code, gameType: "password" });
        setRecentGames(getRecentGames());
        navigate(`/password/${passwordGame.id}/begin`);
        return;
      }

      setError("No game found for that code.");
    } finally {
      setPendingAction(null);
    }
  };

  const cardClass = "border border-slate-700/70 !bg-slate-900/75 text-slate-100 shadow-[0_0_40px_rgba(15,23,42,0.5)] backdrop-blur";
  const primaryButtonClass = "bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]";

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-[0_0_60px_rgba(31,150,255,0.08)] md:p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-sky-300">Game Hub</p>
        <h1 className="mt-2 text-3xl font-extrabold uppercase tracking-wider text-sky-300 md:text-4xl">Start a game</h1>
        <p className="mt-2 text-sm text-slate-400">Create a room, share the code, and play instantly.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={cardClass}>
          <h2 className="text-xl font-bold uppercase tracking-wide text-sky-300">Start playing</h2>
          <p className="text-sm text-slate-400">No sign-up. Play as guest or save a name on this device.</p>
          <form className="mt-3 space-y-3" onSubmit={saveName}>
            <div>
              <Label htmlFor="name" value="Display name (optional)" className="text-slate-300" />
              <TextInput
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={30}
                placeholder="Player"
                className="[&_input]:border-slate-700 [&_input]:bg-slate-800 [&_input]:text-slate-100 [&_input]:placeholder:text-slate-500"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className={primaryButtonClass}>
                Save name
              </Button>
              <Button type="button" color="light" onClick={() => void playAsGuest()} disabled={pendingAction !== null}>
                Play as guest
              </Button>
            </div>
          </form>
          <p className="text-xs text-slate-400">
            Your profile is cached locally with your unique player ID and preferred name.
            {savedName ? ` Saved as: ${savedName}.` : " Currently using guest profile."}
          </p>
        </Card>

        <Card className={cardClass}>
          <h2 className="text-xl font-bold uppercase tracking-wide text-sky-300">Create game</h2>
          <div className="mt-3 flex flex-col gap-2">
            <Button className={primaryButtonClass} onClick={createImposter} isProcessing={pendingAction === "create-imposter"} disabled={pendingAction !== null}>
              Create Imposter
            </Button>
            <Button color="light" onClick={createPassword} isProcessing={pendingAction === "create-password"} disabled={pendingAction !== null}>
              Create Password
            </Button>
          </div>
        </Card>
      </div>

      <Card className={cardClass}>
        <h2 className="text-xl font-bold uppercase tracking-wide text-sky-300">Join game</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <TextInput
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="Enter join code"
            className="[&_input]:border-slate-700 [&_input]:bg-slate-800 [&_input]:text-slate-100 [&_input]:placeholder:text-slate-500"
          />
          <Button className={primaryButtonClass} onClick={joinAny} isProcessing={pendingAction === "join"} disabled={pendingAction !== null}>
            Join
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      </Card>

      <Card className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold uppercase tracking-wide text-sky-300">Recent games</h2>
          <Button
            color="light"
            size="xs"
            onClick={() => {
              clearRecentGames();
              setRecentGames([]);
            }}
            disabled={!recentGames.length}
          >
            Clear
          </Button>
        </div>
        {recentGames.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recentGames.map((game) => (
              <div key={`${game.gameType}-${game.id}`} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">{game.gameType}</p>
                  <p className="text-lg font-bold tracking-widest text-sky-300">{game.code}</p>
                </div>
                <Button
                  as={Link}
                  to={game.gameType === "imposter" ? `/imposter/${game.id}` : `/password/${game.id}/begin`}
                  className={primaryButtonClass}
                >
                  Rejoin
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">No recent games yet. Create or join one to pin it here.</p>
        )}
      </Card>
    </div>
  );
}
