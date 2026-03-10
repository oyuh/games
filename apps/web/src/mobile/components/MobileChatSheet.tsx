import { useState, useEffect, useRef } from "react";
import { nanoid } from "nanoid";
import { FiSend } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { getOrCreateSessionId } from "../../lib/session";
import { useChatContext } from "../../lib/chat-context";
import { BottomSheet } from "./BottomSheet";

export function MobileChatSheet({ onClose }: { onClose: () => void }) {
  const zero = useZero();
  const sessionId = getOrCreateSessionId();
  const { gameType, gameId, isImposter, multipleImposters } = useChatContext();
  const showChannels = isImposter && multipleImposters;
  const [channel, setChannel] = useState<"all" | "imposter">("all");
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const [messages] = useQuery(
    gameType
      ? queries.chat.byGame({ gameType, gameId })
      : queries.chat.byGame({ gameType: "imposter", gameId: "__none__" })
  );

  const filteredMessages = showChannels
    ? messages.filter((m) => (m.channel ?? "all") === channel)
    : messages;

  // Get my session name
  const [sessions] = useQuery(queries.sessions.byId({ id: sessionId }));
  const myName = sessions[0]?.name ?? sessionId.slice(0, 6);

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
  }, [filteredMessages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !gameType) return;
    void zero.mutate(
      mutators.chat.send({
        id: nanoid(),
        gameType,
        gameId,
        senderId: sessionId,
        senderName: myName,
        text,
        ...(showChannels ? { channel } : {}),
      })
    );
    setInput("");
  };

  return (
    <BottomSheet title={showChannels && channel === "imposter" ? "Imposter Chat" : "Chat"} onClose={onClose}>
      {/* Channel tabs */}
      {showChannels && (
        <div className="m-chat-channel-tabs">
          <button className={`m-chat-channel-tab${channel === "all" ? " m-chat-channel-tab--active" : ""}`} onClick={() => setChannel("all")}>All</button>
          <button className={`m-chat-channel-tab${channel === "imposter" ? " m-chat-channel-tab--active" : ""}`} onClick={() => setChannel("imposter")}>Imposter</button>
        </div>
      )}

      <div className="m-chat-body" ref={bodyRef}>
        {filteredMessages.length === 0 && (
          <p className="m-chat-empty">No messages yet — say something!</p>
        )}
        {filteredMessages.map((msg, i) => {
          const prev = filteredMessages[i - 1];
          const sameSender = prev?.sender_id === msg.sender_id;
          const isMe = msg.sender_id === sessionId;
          const isHost = msg.sender_id === hostId;
          const displayName = msg.sender_name || msg.sender_id.slice(0, 6);
          return (
            <div
              key={msg.id}
              className={`m-chat-msg${isMe ? " m-chat-msg--me" : ""}${sameSender ? " m-chat-msg--grouped" : ""}`}
            >
              {!sameSender && (
                <div className="m-chat-msg-header">
                  <span className={`m-chat-msg-name${isMe ? " m-chat-msg-name--me" : ""}`}>{displayName}</span>
                  {isHost && (
                    <span className="m-chat-badge m-chat-badge--host">
                      <PiCrownSimpleFill size={8} /> Host
                    </span>
                  )}
                  {isMe && <span className="m-chat-badge">You</span>}
                </div>
              )}
              <span className="m-chat-msg-text">{msg.text}</span>
            </div>
          );
        })}
      </div>
      <div className="m-chat-input-row">
        <input
          className="m-input"
          style={{ flex: 1 }}
          placeholder="Type a message..."
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button className="m-btn m-btn-primary" style={{ padding: "0.5rem 0.75rem", minHeight: 0 }} onClick={handleSend} disabled={!input.trim()}>
          <FiSend size={14} />
        </button>
      </div>
    </BottomSheet>
  );
}
