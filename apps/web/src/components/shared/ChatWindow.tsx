import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { FiMessageCircle, FiMinus, FiX, FiSend, FiMaximize2 } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { getOrCreateSessionId } from "../../lib/session";
import { useChatContext } from "../../lib/chat-context";

export interface ChatWindowProps {
  hostId: string;
  myName: string;
}

const MIN_W = 300;
const MIN_H = 250;
const DEFAULT_W = 360;
const DEFAULT_H = 420;

export function ChatWindow({ hostId, myName }: ChatWindowProps) {
  const zero = useZero();
  const sessionId = getOrCreateSessionId();
  const { open, toggle, gameType, gameId } = useChatContext();

  const [messages] = useQuery(
    gameType
      ? queries.chat.byGame({ gameType, gameId })
      : queries.chat.byGame({ gameType: "imposter", gameId: "__none__" })
  );

  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");

  // Position & size state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [initialized, setInitialized] = useState(false);

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // Initialize position on first open
  useEffect(() => {
    if (open && !initialized) {
      setPos({
        x: Math.max(16, window.innerWidth - DEFAULT_W - 24),
        y: Math.max(16, window.innerHeight - DEFAULT_H - 80),
      });
      setInitialized(true);
    }
  }, [open, initialized]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (chatBodyRef.current && open && !minimized) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages.length, open, minimized]);

  // Drag handlers
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - 100, dragRef.current.origX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.origY + dy)),
        });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [pos]
  );

  // Resize handlers
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };

      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dx = ev.clientX - resizeRef.current.startX;
        const dy = ev.clientY - resizeRef.current.startY;
        setSize({
          w: Math.max(MIN_W, resizeRef.current.origW + dx),
          h: Math.max(MIN_H, resizeRef.current.origH + dy),
        });
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [size]
  );

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
      })
    );
    setInput("");
  };

  if (!open) return null;

  return (
    <div
      className={`chat-window ${minimized ? "chat-window--minimized" : ""}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: minimized ? 220 : size.w,
        height: minimized ? "auto" : size.h,
      }}
    >
      {/* Title bar (draggable) */}
      <div className="chat-titlebar" onMouseDown={onDragStart}>
        <FiMessageCircle size={14} />
        <span className="chat-titlebar-text">Game Chat</span>
        <span className="chat-titlebar-count">{messages.length}</span>
        <div className="chat-titlebar-actions">
          <button onClick={() => setMinimized((m) => !m)} data-tooltip={minimized ? "Expand" : "Minimize"}>
            {minimized ? <FiMaximize2 size={13} /> : <FiMinus size={13} />}
          </button>
          <button onClick={toggle} data-tooltip="Close">
            <FiX size={13} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="chat-body" ref={chatBodyRef}>
            {messages.length === 0 && <p className="chat-empty">No messages yet. Say something!</p>}
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                senderName={msg.sender_name}
                text={msg.text}
                isHost={msg.sender_id === hostId}
                isMe={msg.sender_id === sessionId}
              />
            ))}
          </div>

          {/* Input */}
          <div className="chat-input-row">
            <input
              className="chat-input"
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
            />
            <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>
              <FiSend size={14} />
            </button>
          </div>

          {/* Resize handle */}
          <div className="chat-resize-handle" onMouseDown={onResizeStart} />
        </>
      )}
    </div>
  );
}

function ChatMessage({
  senderName,
  text,
  isHost,
  isMe,
}: {
  senderName: string;
  text: string;
  isHost: boolean;
  isMe: boolean;
}) {
  return (
    <div className={`chat-msg ${isMe ? "chat-msg--me" : ""}`}>
      <div className="chat-msg-header">
        <span className={`chat-msg-name ${isMe ? "chat-msg-name--me" : ""}`}>{senderName}</span>
        {isHost && (
          <span className="chat-badge chat-badge--host" data-tooltip="Game host" data-tooltip-variant="info">
            <PiCrownSimpleFill size={10} />
          </span>
        )}
        {isMe && <span className="chat-badge">You</span>}
      </div>
      <span className="chat-msg-text">{text}</span>
    </div>
  );
}
