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
  const [step, setStep] = useState<'welcome' | 'name' | 'info'>('welcome');
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
      <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto bg-card text-card-foreground border border-border shadow-2xl">
        {step === 'welcome' && (
          <div className="flex flex-col items-center space-y-8 py-4">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center border border-primary/30">
                <div className="text-4xl">🎮</div>
              </div>

              <DialogTitle className="text-4xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                Welcome!
              </DialogTitle>

              <p className="text-lg text-muted-foreground max-w-md">
                You've discovered <span className="font-semibold text-primary">Lawson's Games</span> — a collection of fun social games perfect for playing with friends!
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-xl">⚡</span>
                </div>
                <p className="text-sm text-muted-foreground font-medium">Quick Setup</p>
              </div>

              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-xl">👥</span>
                </div>
                <p className="text-sm text-muted-foreground font-medium">Play Together</p>
              </div>

              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-xl">🎯</span>
                </div>
                <p className="text-sm text-muted-foreground font-medium">Pure Fun</p>
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 w-full">
              <p className="text-sm text-center text-muted-foreground">
                <span className="font-medium text-primary">Why this exists:</span> I wanted to play those viral TikTok games with friends but couldn't find a good online version. So I built one!
              </p>
            </div>

            <Button
              onClick={() => setStep('name')}
              size="lg"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              Let's Get Started! 🚀
            </Button>

            <button
              onClick={() => setStep('info')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
            >
              More about this site
            </button>
          </div>
        )}

        {step === 'name' && (
          <div className="flex flex-col space-y-6 py-4">
            <div className="text-center space-y-2">
              <DialogTitle className="text-2xl font-bold text-foreground">
                What should we call you?
              </DialogTitle>
              <p className="text-muted-foreground">
                Choose a name that your friends will recognize!
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    autoFocus
                    placeholder="Your awesome name..."
                    className="text-center text-lg py-3 bg-background border-border focus:border-primary transition-colors"
                    disabled={submitting}
                    maxLength={20}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {name.length}/20
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                  <span className="w-1 h-1 bg-primary rounded-full"></span>
                  <span>This name will be visible to other players</span>
                  <span className="w-1 h-1 bg-primary rounded-full"></span>
                </div>
              </div>

              {error && (
                <div className="text-destructive bg-destructive/10 border border-destructive/30 px-4 py-3 rounded-lg text-center text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('welcome')}
                  className="flex-1"
                  disabled={submitting}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !name.trim()}
                  className="flex-2 bg-primary hover:bg-primary/90"
                >
                  {submitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Saving...
                    </div>
                  ) : (
                    "Start Playing! 🎉"
                  )}
                </Button>
              </div>
            </form>

            {/* Progress indicator */}
            <div className="flex justify-center">
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <div className="w-2 h-2 bg-muted rounded-full"></div>
              </div>
            </div>
          </div>
        )}

        {step === 'info' && (
          <div className="flex flex-col space-y-6 py-4">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center">
                About Lawson's Games
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
                <h3 className="font-semibold text-primary mb-3 flex items-center gap-2">
                  <span>🎯</span> Our Mission
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create the best online experience for social party games. No downloads, no accounts required, just pure fun with friends whether you're together or apart.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-lg p-4">
                  <h4 className="font-semibold text-foreground mb-2 text-sm">🚀 Quick Start</h4>
                  <p className="text-xs text-muted-foreground">
                    Games start in seconds, not minutes
                  </p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <h4 className="font-semibold text-foreground mb-2 text-sm">📱 Any Device</h4>
                  <p className="text-xs text-muted-foreground">
                    Phone, tablet, or computer — all work perfectly
                  </p>
                </div>
              </div>

              {session?.created_at && session?.expires_at && (
                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                  <h4 className="font-semibold text-foreground mb-3 text-sm">📊 Your Session</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started:</span>
                      <span className="text-foreground">{new Date(session.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expires:</span>
                      <span className="text-foreground">{new Date(session.expires_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  Found a bug? Have suggestions? Let me know!
                  <br />
                  This site is constantly improving based on player feedback.
                </p>
              </div>
            </div>

            <Button
              onClick={() => setStep('name')}
              className="w-full bg-primary hover:bg-primary/90"
            >
              Got it, let's play! 🎮
            </Button>

            {/* Progress indicator */}
            <div className="flex justify-center">
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <div className="w-2 h-2 bg-muted rounded-full"></div>
                <div className="w-2 h-2 bg-primary rounded-full"></div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
