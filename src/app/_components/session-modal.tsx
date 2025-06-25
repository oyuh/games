"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export function useSessionInfo() {
  const [session, setSession] = useState<{ id?: string, entered_name?: string, created_at?: string, expires_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSession() {
      const res = await fetch("/api/session/entered-name", { method: "GET" });
      if (res.ok) {
        const sessionData = (await res.json()) as { id?: string, entered_name?: string, created_at?: string, expires_at?: string };
        setSession(sessionData);
      }
      setLoading(false);
    }
    void fetchSession();
  }, []);

  return { session, loading };
}

export function SessionNameModal({ onNameSet }: { onNameSet: () => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { session } = useSessionInfo();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/session/entered-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const check = await fetch("/api/session/entered-name", { method: "GET" });
      if (check.ok) {
        const data = (await check.json()) as { entered_name?: string };
        if (data && data.entered_name === name) {
          onNameSet();
          window.location.reload(); // Refresh page so name sticks
        } else {
          setError("Name was not saved. Please try again.");
        }
      } else {
        setError("Could not verify name. Please try again.");
      }
    } else {
      setError("Failed to set name");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open>
      <DialogContent className="max-w-xs sm:max-w-md w-full max-h-[90vh] overflow-y-auto bg-card text-main border border-secondary shadow-xl">
        <DialogHeader className="w-full">
          <DialogTitle className="text-3xl font-bold text-primary text-center uppercase tracking-wide">
            Enter A Name
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
            <div className="text-base font-bold text-primary border-b border-primary/30 pb-2 mb-3">Player Info</div>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="player-name" className="text-sm font-semibold text-primary">
                  A name
                </label>
                <Input
                  id="player-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoFocus
                  placeholder="Enter your name to play"
                  className="bg-main text-main border border-secondary/30 rounded-md px-3 py-2 text-center text-lg"
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          {/* About section inside session modal */}
          <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30 mt-4">
            <div className="text-3xl font-extrabold text-center bg-gradient-to-r from-[#7ecbff] via-[#3a6ea7] to-[#7ecbff] bg-[400%_auto] bg-clip-text uppercase tracking-widest mb-2 drop-shadow-lg pt-0">
              About This Site
            </div>
            <div className="space-y-6 mt-2">
              <div className="flex flex-col items-center">
                <span className="inline-block text-lg sm:text-xl font-semibold text-primary mb-2 animate-gradient bg-gradient-to-r from-[#7ecbff] via-[#3a6ea7] to-[#7ecbff] bg-[400%_auto] bg-clip-text text-transparent">
                  Play with Friends!
                </span>
                <p className="text-main text-center text-base sm:text-lg leading-relaxed max-w-md">
                  Welcome to <span className="font-bold text-primary">Lawson&apos;s Games</span> — a modern collection of social board type games to play with friends, online or in person. Enjoy quick setup, beautiful design.
                </p>
                <p className="text-main text-center text-base sm:text-lg leading-relaxed max-w-md">
                  I made this because I wanted to play games from TikTok with friends but couldn&apos;t find a good solution for them.
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-secondary text-center text-xs">This website may have bugs, please report them accordingly.</span>
              </div>
            </div>
          </div>

          {session?.created_at && session?.expires_at && (
            <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
              <div className="text-base font-bold text-primary border-b border-primary/30 pb-2 mb-3">Session Info</div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-secondary">Created</span>
                  <span className="text-main">{new Date(session.created_at).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Expires</span>
                  <span className="text-main">{new Date(session.expires_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md text-center">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || !name}
            className="w-full"
          >
            {submitting ? "Saving..." : "Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
