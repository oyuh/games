"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSessionInfo } from "./session-modal";

interface JoinResponse {
  id: string;
}

// Cookie helper functions
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() ?? null;
  return null;
}

function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
}

export function JoinGameModal() {
  const router = useRouter();
  const { session } = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joiningGame, setJoiningGame] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinGameType, setJoinGameType] = useState("imposter");
  const [step, setStep] = useState<'welcome' | 'details' | 'connecting'>('welcome');
  const [hasJoinedBefore, setHasJoinedBefore] = useState(false);

  // Check if user has joined a game before
  useEffect(() => {
    const hasJoined = getCookie('hasJoinedGame') === 'true';
    setHasJoinedBefore(hasJoined);
  }, []);

  // Listen for custom event from FloatingHeader
  useEffect(() => {
    const openModalListener = () => {
      setOpen(true);
      // Skip welcome screen if user has joined before
      setStep(hasJoinedBefore ? 'details' : 'welcome');
      setJoinCode("");
      setJoinError("");
    };
    document.addEventListener('open-join-game-modal', openModalListener);

    return () => {
      document.removeEventListener('open-join-game-modal', openModalListener);
    };
  }, [hasJoinedBefore]);

  // Function to handle joining by code
  async function handleJoinByCode() {
    if (!joinCode.trim()) return;
    if (!session?.entered_name || !session?.id) {
      setJoinError("You must enter your name before joining a game.");
      return;
    }

    setStep('connecting');
    setJoiningGame(true);
    setJoinError("");

    try {
      let joinRes: Response | undefined;
      if (joinGameType === "imposter") {
        joinRes = await fetch(`/api/imposter/join-by-code/${joinCode}`, { method: "POST" });
      } else if (joinGameType === "password") {
        joinRes = await fetch(`/api/password/join-by-code/${joinCode}`, { method: "POST" });
      }
      if (joinRes?.ok) {
        const data = await joinRes.json() as JoinResponse;

        // Mark that user has joined a game before
        setCookie('hasJoinedGame', 'true');
        setHasJoinedBefore(true);

        // Close the modal before navigation
        setOpen(false);
        if (joinGameType === "imposter") {
          router.push(`/imposter/${data.id}/begin`);
        } else if (joinGameType === "password") {
          router.push(`/password/${data.id}/begin`);
        }
      } else if (joinRes?.status === 404) {
        setJoinError("Game not found with that code.");
        setStep('details');
      } else if (joinRes?.status === 401) {
        setJoinError("You must enter your name before joining a game.");
        setStep('details');
      } else {
        setJoinError("Failed to join game.");
        setStep('details');
      }
    } catch {
      setJoinError("Error joining game. Please try again.");
      setStep('details');
    } finally {
      setJoiningGame(false);
    }
  }

  const gameTypeInfo = {
    imposter: {
      emoji: "🕵️",
      name: "Imposter",
      description: "Find the imposter among your group!",
      color: "from-red-500 to-orange-500"
    },
    password: {
      emoji: "🔤",
      name: "Password",
      description: "Guess the secret word with clues!",
      color: "from-blue-500 to-purple-500"
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto bg-card text-card-foreground border border-border shadow-2xl">
        {step === 'welcome' && (
          <div className="flex flex-col items-center space-y-8 py-4">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center border border-primary/30">
                <div className="text-4xl">🎯</div>
              </div>

              <DialogTitle className="text-4xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                Join the Fun!
              </DialogTitle>

              <p className="text-lg text-muted-foreground max-w-md">
                Got a game code from a friend? Perfect! Let&apos;s get you connected to their game.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                  <span className="text-xl">⚡</span>
                </div>
                <p className="text-sm text-muted-foreground font-medium">Instant Join</p>
              </div>

              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                  <span className="text-xl">🎮</span>
                </div>
                <p className="text-sm text-muted-foreground font-medium">Jump Right In</p>
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 w-full">
              <p className="text-sm text-center text-muted-foreground">
                <span className="font-medium text-primary">How it works:</span> Enter the game code your friend shared, and you&apos;ll be instantly connected to their game session.
              </p>
            </div>

            <Button
              onClick={() => setStep('details')}
              size="lg"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              I Have a Code! 🚀
            </Button>

            <button
              onClick={() => setOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Never mind, go back
            </button>
          </div>
        )}

        {step === 'details' && (
          <div className="flex flex-col space-y-6 py-4">
            <div className="text-center space-y-2">
              <DialogTitle className="text-2xl font-bold text-foreground">
                Game Details
              </DialogTitle>
              <p className="text-muted-foreground">
                Tell us what game you&apos;re joining!
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground">
                    What type of game? 🎮
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(gameTypeInfo).map(([type, info]) => (
                      <button
                        key={type}
                        onClick={() => setJoinGameType(type)}
                        className={`p-4 rounded-lg border transition-all ${
                          joinGameType === type
                            ? 'border-primary bg-primary/10 shadow-md'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        <div className="text-center space-y-2">
                          <div className="text-2xl">{info.emoji}</div>
                          <div className="font-semibold text-sm">{info.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {info.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground">
                    Enter Game Code 🔢
                  </label>
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="ABC123"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="text-center text-xl font-mono py-4 bg-background border-border focus:border-primary transition-colors tracking-wider"
                      maxLength={6}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {joinCode.length}/6
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                    <span className="w-1 h-1 bg-primary rounded-full"></span>
                    <span>Usually 4-6 characters from your friend</span>
                    <span className="w-1 h-1 bg-primary rounded-full"></span>
                  </div>
                </div>
              </div>

              {joinError && (
                <div className="text-destructive bg-destructive/10 border border-destructive/30 px-4 py-3 rounded-lg text-center text-sm">
                  {joinError}
                </div>
              )}

              <div className="flex gap-3">
                {!hasJoinedBefore && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep('welcome')}
                    className="flex-1"
                  >
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleJoinByCode}
                  disabled={!joinCode.trim()}
                  className={`bg-primary hover:bg-primary/90 ${!hasJoinedBefore ? 'flex-2' : 'w-full'}`}
                >
                  Join Game! 🎯
                </Button>
              </div>

              {/* Help link for returning users */}
              {hasJoinedBefore && (
                <div className="text-center">
                  <button
                    onClick={() => setStep('welcome')}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
                  >
                    Need help? View introduction
                  </button>
                </div>
              )}
            </div>

            {/* Progress indicator */}
            <div className="flex justify-center">
              <div className="flex gap-2">
                {!hasJoinedBefore ? (
                  <>
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  </>
                ) : (
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'connecting' && (
          <div className="flex flex-col items-center space-y-8 py-8">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center border border-primary/30">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
              </div>

              <DialogTitle className="text-2xl font-bold text-foreground">
                Joining Game...
              </DialogTitle>

              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Connecting to <span className="font-mono bg-muted px-2 py-1 rounded">{joinCode}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Game type: <span className="font-semibold text-primary">
                    {gameTypeInfo[joinGameType as keyof typeof gameTypeInfo].name}
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 w-full">
              <p className="text-sm text-center text-muted-foreground">
                <span className="font-medium text-primary">Almost there!</span> We&apos;re connecting you to the game session...
              </p>
            </div>

            {/* Animated dots */}
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
