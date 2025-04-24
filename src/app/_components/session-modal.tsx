"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
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
        const data = await check.json();
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
      <DialogContent className="max-w-sm w-full flex flex-col items-center justify-center gap-0 bg-card text-main border border-secondary shadow-xl">
        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center justify-center space-y-4">
          <DialogHeader className="w-full flex flex-col items-center">
            <DialogTitle className="text-center w-full text-primary drop-shadow-lg">Enter your name to start</DialogTitle>
          </DialogHeader>
          <Input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
            placeholder="Your name"
            className="text-lg text-center bg-main text-main border border-secondary placeholder:text-secondary"
            disabled={submitting}
          />
          {session?.created_at && session?.expires_at && (
            <div className="w-full text-center text-xs text-secondary bg-main/80 rounded-lg p-2 mb-2 border border-secondary">
              <div>Session created: <span className="font-semibold">{new Date(session.created_at).toLocaleString()}</span></div>
              <div>Session expires: <span className="font-semibold">{new Date(session.expires_at).toLocaleString()}</span></div>
            </div>
          )}
          {error && <div className="text-destructive text-sm font-medium text-center w-full">{error}</div>}
          <DialogFooter className="w-full flex flex-col items-center">
            <Button type="submit" disabled={submitting || !name} className="w-full bg-primary text-main hover:bg-primary/90">
              {submitting ? "Saving..." : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
