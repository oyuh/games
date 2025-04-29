"use client";
import { FaUser, FaUsers, FaCog } from "react-icons/fa";
import { useState, useRef, useEffect } from "react";

export const FloatingHeader = () => {
  // Open modals via custom events
  const openProfile = () => document.dispatchEvent(new CustomEvent("open-session-profile-editor-modal"));
  const openJoin = () => document.dispatchEvent(new CustomEvent("open-join-game-modal"));
  const openSettings = () => document.dispatchEvent(new CustomEvent("open-settings-modal"));

  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 60) {
        setOpen(true);
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
      } else if (!headerRef.current?.contains(e.target as Node)) {
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        hideTimeout.current = setTimeout(() => setOpen(false), 150);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      ref={headerRef}
      className={`floating-header-bar transition-all duration-150 ease-in-out ${open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-90 -translate-y-8 pointer-events-auto"} ${!mounted ? "invisible" : ""}`}
      onMouseLeave={() => setOpen(false)}
      onMouseEnter={() => setOpen(true)}
    >
      {open ? (
        <>
          <button
            className="flex items-center justify-between gap-2 py-2 px-3 rounded-md text-sm font-semibold bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition"
            onClick={openProfile}
            type="button"
          >
            <FaUser className="text-primary w-5 h-5" />
            <span>Profile</span>
          </button>
          <button
            className="flex items-center justify-between gap-2 py-2 px-3 rounded-md text-sm font-semibold bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition"
            onClick={openJoin}
            type="button"
          >
            <FaUsers className="text-primary w-5 h-5" />
            <span>Join Game</span>
          </button>
          <button
            className="flex items-center justify-between gap-2 py-2 px-3 rounded-md text-sm font-semibold bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition"
            onClick={openSettings}
            type="button"
          >
            <FaCog className="text-primary w-5 h-5" />
            <span>Settings</span>
          </button>
        </>
      ) : (
        <button
          className="floating-header-tab flex items-center justify-center px-3 py-1.5 rounded-b-md bg-primary/30 text-primary border-x border-b border-primary/30 text-sm font-semibold select-none shadow-sm hover:bg-primary/40 transition"
          style={{
            margin: "0 auto",
            position: "absolute",
            left: "50%",
            top: "1.2rem",
            transform: "translateX(-50%)",
            minHeight: "1rem",
            minWidth: "2rem",
            zIndex: 51
          }}
          onClick={() => setOpen(true)}
          tabIndex={0}
        >
          Options
        </button>
      )}
      <style jsx>{`
        .floating-header-bar {
          position: fixed;
          left: 50%;
          top: 0.5rem;
          transform: translateX(-50%);
          z-index: 50;
          display: flex;
          gap: 1rem;
          padding: 1rem 1.5rem;
          background: rgba(24, 24, 27, 0.85);
          border: 1.5px solid #23232a;
          border-radius: 0.5rem;
          box-shadow: 0 2px 16px 0 #0002;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .floating-header-tab {
          box-shadow: 0 1px 4px 0 #0001;
        }
        @media (min-width: 640px) {
          .floating-header-bar {
            display: flex;
          }
        }
      `}</style>
    </div>
  );
};
