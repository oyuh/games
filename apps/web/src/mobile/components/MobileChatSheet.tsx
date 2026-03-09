import { useState, useEffect, useRef } from "react";
import { nanoid } from "nanoid";
import { FiSend } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { getOrCreateSessionId } from "../../lib/session";
import { useChatContext } from "../../lib/chat-context";
import { BottomSheet } from "./BottomSheet";

export function MobileChatSheet({ onClose }: { onClose: () => void }) {
  const zero = useZero();
  const sessionId = getOrCreateSessionId();
  const { gameType, gameId } = useChatContext();
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const [messages] = useQuery(
    gameType
      ? queries.chat.byGame({ gameType, gameId })
      : queries.chat.byGame({ gameType: "imposter", gameId: "__none__" })
  );

  // Fetch host ID
  const [imposterGames] = useQuery(gameType === "imposter" ? queries.imposter.byId({ id: gameId }) : queries.imposter.byId({ id: "__none__" }));
  const [passwordGames] = useQuery(gameType === "password" ? queries.password.byId({ id: gameId }) : queries.password.byId({ id: "__none__" }));
  const [chainGames] = useQuery(gameType === "chain_reaction" ? queries.chainReaction.byId({ id: gameId }) : queries.chainReaction.byId({ id: "__none__" }));
  const [shadeGames] = useQuery(gameType === "shade_signal" ? queries.shadeSignal.byId({ id: gameId }) : queries.shadeSignal.byId({ id: "__none__" }));

  const hostId = imposterGames[0]?.host_id ?? passwordGames[0]?.host_id ?? chainGames[0]?.host_id ?? shadeGames[0]?.host_id ?? "";

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !gameType) return;
    void zero.mutate(
      mutators.chat.send({
        id: nanoid(),
        gameType,
        gameId,
        senderId: sessionId,
        senderName: "",
        text,
      })
    );
    setInput("");
  };

  return (
    <BottomSheet title="Chat" onClose={onClose}>
      <div className="m-chat-body" ref={bodyRef}>
        {messages.length === 0 && (
          <p className="m-chat-empty">No messages yet</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`m-chat-msg${msg.sender_id === sessionId ? " m-chat-msg--me" : ""}`}
          >
            <div className="m-chat-msg-header">
              <span className="m-chat-msg-name">{msg.sender_name}</span>
              {msg.sender_id === hostId && (
                <PiCrownSimpleFill size={10} style={{ color: "var(--yellow)" }} />
              )}
              {msg.sender_id === sessionId && (
                <span className="m-badge" style={{ fontSize: "0.6rem", padding: "1px 4px" }}>You</span>
              )}
            </div>
            <span className="m-chat-msg-text">{msg.text}</span>
          </div>
        ))}
      </div>
      <div className="m-chat-input-row">
        <input
          className="m-input flex-1"
          placeholder="Type a message..."
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          autoFocus
        />
        <button className="m-btn m-btn-primary" onClick={handleSend} disabled={!input.trim()} style={{ padding: "0.6rem" }}>
          <FiSend size={16} />
        </button>
      </div>
    </BottomSheet>
  );
}
