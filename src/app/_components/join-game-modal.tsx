"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSessionInfo } from "./session-modal";

interface JoinResponse {
  id: string;
}

export function JoinGameModal() {
  const router = useRouter();
  const { session } = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joiningGame, setJoiningGame] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinGameType, setJoinGameType] = useState("imposter");

  // Listen for custom event from FloatingHeader
  useEffect(() => {
    const openModalListener = () => setOpen(true);
    document.addEventListener('open-join-game-modal', openModalListener);

    return () => {
      document.removeEventListener('open-join-game-modal', openModalListener);
    };
  }, []);

  // Function to handle joining by code
  async function handleJoinByCode() {
    if (!joinCode.trim()) return;
    if (!session?.entered_name || !session?.id) {
      setJoinError("You must enter your name before joining a game.");
      return;
    }

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
        // Close the modal before navigation
        setOpen(false);
        if (joinGameType === "imposter") {
          router.push(`/imposter/${data.id}/begin`);
        } else if (joinGameType === "password") {
          router.push(`/password/${data.id}/begin`);
        }
      } else if (joinRes?.status === 404) {
        setJoinError("Game not found with that code.");
      } else if (joinRes?.status === 401) {
        setJoinError("You must enter your name before joining a game.");
      } else {
        setJoinError("Failed to join game.");
      }
    } catch (_error) {
      setJoinError("Error joining game. Please try again.");
    } finally {
      setJoiningGame(false);
    }
  }

  async function handleJoinGameByLink() {
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-md flex flex-col items-center gap-6">
        <DialogHeader className="w-full">
          <DialogTitle className="text-3xl font-bold text-primary text-center uppercase tracking-wide">
            Join a Game
          </DialogTitle>
        </DialogHeader>

        <div className="w-full space-y-6">
          <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
            <div className="text-base font-bold text-primary border-b border-primary/30 pb-2 mb-3">
              Game Details
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="gameType" className="text-sm font-semibold text-primary">
                  Game Type
                </label>
                <select
                  id="gameType"
                  value={joinGameType}
                  onChange={e => setJoinGameType(e.target.value)}
                  className="bg-main text-main border border-secondary/30 rounded-md px-3 py-2 w-full"
                >
                  <option value="imposter">Imposter</option>
                  <option value="password">Password</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="joinCode" className="text-sm font-semibold text-primary">
                  Game Code
                </label>
                <Input
                  id="joinCode"
                  type="text"
                  placeholder="Enter game code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="bg-main text-main border border-secondary/30 rounded-md px-3 py-2 text-center text-lg"
                />
              </div>
            </div>
          </div>

          {joinError && (
            <div className="text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md text-center">
              {joinError}
            </div>
          )}

          <div className="flex flex-col gap-3 w-full">
            <Button
              type="button"
              onClick={handleJoinByCode}
              disabled={joiningGame || !joinCode.trim()}
              className="w-full"
            >
              {joiningGame ? "Joining..." : "Join Game"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleJoinGameByLink}
              className="w-full border border-secondary/30 text-secondary hover:bg-secondary/10"
            >
              Join by Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
