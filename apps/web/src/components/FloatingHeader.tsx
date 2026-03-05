import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export function FloatingHeader() {
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (event.clientY < 80) {
        if (hideTimer.current !== null) {
          clearTimeout(hideTimer.current);
          hideTimer.current = null;
        }
        setVisible(true);
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const handleMouseLeave = () => {
    hideTimer.current = setTimeout(() => setVisible(false), 150);
  };

  const handleMouseEnter = () => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setVisible(true);
  };

  return (
    <header
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        top: "0.5rem",
        zIndex: 50,
        transition: "opacity 0.2s, transform 0.2s",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.45rem 0.75rem",
          background: "rgba(24,26,27,0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1.5px solid #23232a",
          borderRadius: "9999px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          whiteSpace: "nowrap",
        }}
      >
        {/* Logo / home */}
        <Link
          to="/"
          style={{
            fontWeight: 700,
            fontSize: "0.9rem",
            color: "var(--primary)",
            textDecoration: "none",
            paddingRight: "0.5rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Games!
        </Link>

        <div style={{ width: "1px", height: "1.25rem", background: "var(--border)" }} />

        <NavBtn to="/">Home</NavBtn>
      </nav>
    </header>
  );
}

function NavBtn({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.35rem 0.75rem",
        borderRadius: "9999px",
        fontSize: "0.8rem",
        fontWeight: 600,
        background: "color-mix(in srgb, var(--primary) 15%, transparent)",
        border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
        color: "var(--primary)",
        textDecoration: "none",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background =
          "color-mix(in srgb, var(--primary) 25%, transparent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background =
          "color-mix(in srgb, var(--primary) 15%, transparent)";
      }}
    >
      {children}
    </Link>
  );
}
