"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSessionInfo } from "./session-modal";
import { FaUsers } from "react-icons/fa";

export function JoinGameModal() {
  const router = useRouter();
  const { session } = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joiningGame, setJoiningGame] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinGameType, setJoinGameType] = useState("imposter");
  const [showTooltip, setShowTooltip] = useState(false);

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
      let joinRes;
      if (joinGameType === "imposter") {
        joinRes = await fetch(`/api/imposter/join-by-code/${joinCode}`, { method: "POST" });
      } else if (joinGameType === "password") {
        joinRes = await fetch(`/api/password/join-by-code/${joinCode}`, { method: "POST" });
      }
      if (joinRes?.ok) {
        const data = await joinRes.json();
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
    } catch (error) {
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
    <div className="relative">
      <button
        className="bg-card text-primary border border-secondary rounded-full shadow-lg p-5 flex items-center justify-center hover:bg-secondary/20 transition"
        onClick={() => setOpen(true)}
        aria-label="Join Game"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{ width: 76, height: 76 }}
      >
        <FaUsers size={32} />
      </button>

      {showTooltip && (
        <div className="absolute left-[-140px] top-1/2 transform -translate-y-1/2 bg-card px-4 py-2 rounded-md text-sm whitespace-nowrap border border-secondary shadow-lg z-50 w-[120px] text-center">
          Join Game
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm w-full bg-card text-main border border-secondary shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-primary text-center">Join a Game</DialogTitle>
          </DialogHeader>

          <div className="w-full flex flex-col gap-4">
            <div className="flex flex-col gap-2 w-full">
              <label htmlFor="gameType" className="text-sm font-semibold text-primary">
                Game Type
              </label>
              <select
                id="gameType"
                value={joinGameType}
                onChange={e => setJoinGameType(e.target.value)}
                className="input bg-main text-main border border-secondary rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary font-semibold tracking-wide"
              >
                <option value="imposter">Imposter</option>
              </select>
            </div>

            <div className="flex flex-col gap-2 w-full">
              <label htmlFor="joinCode" className="text-sm font-semibold text-primary">
                Game Code
              </label>
              <Input
                id="joinCode"
                type="text"
                placeholder="Enter game code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="bg-main text-main border border-secondary rounded-md focus:ring-2 focus:ring-primary"
              />
            </div>

            {joinError && (
              <div className="text-destructive text-center text-sm">{joinError}</div>
            )}

            <Button
              type="button"
              onClick={handleJoinByCode}
              disabled={joiningGame || !joinCode.trim()}
              className="w-full bg-primary text-main hover:bg-primary/90 font-semibold py-2"
            >
              {joiningGame ? "Joining..." : "Join Game"}
            </Button>

            <div className="text-center">
              <span
                className="text-secondary hover:text-primary text-sm underline cursor-pointer"
                onClick={handleJoinGameByLink}
              >
                Or join by link
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
