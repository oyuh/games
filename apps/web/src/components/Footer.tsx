import { FaGithub, FaTwitter } from "react-icons/fa";
import { SiDiscord } from "react-icons/si";
import { useConnectionDebug } from "../lib/connection-debug";

export function Footer() {
  const debug = useConnectionDebug();

  const lastUpdated = debug.apiCommitTimestamp
    ? new Date(debug.apiCommitTimestamp).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : debug.apiBuildTimestamp
      ? new Date(debug.apiBuildTimestamp).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <footer
      style={{
        background: "#121414",
        borderTop: "1px solid #23232a",
        padding: "1.25rem 2rem",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        {/* Left — logo + nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: "1rem",
              color: "var(--primary)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Games!
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <FooterLink href="https://github.com" icon={<FaGithub size={15} />} label="GitHub" />
            <FooterLink href="https://twitter.com" icon={<FaTwitter size={15} />} label="Twitter" />
            <FooterLink href="https://discord.com" icon={<SiDiscord size={15} />} label="Discord" />
          </div>
        </div>

        {/* Right — status + date */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--secondary)" }}>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background:
                debug.presenceState === "connected" ? "#4ade80" : "#f87171",
              boxShadow:
                debug.presenceState === "connected"
                  ? "0 0 6px #4ade80"
                  : "0 0 6px #f87171",
              flexShrink: 0,
            }}
          />
          {lastUpdated ? (
            <span>Last updated: {lastUpdated}</span>
          ) : (
            <span>API status {debug.apiMetaState === "ok" ? "live" : "—"}</span>
          )}
        </div>
      </div>

      {/* Bottom row — copyright */}
      <div
        style={{
          maxWidth: "72rem",
          margin: "0.75rem auto 0",
          fontSize: "0.75rem",
          color: "var(--secondary)",
          borderTop: "1px solid #1e1e1e",
          paddingTop: "0.75rem",
          textAlign: "center",
        }}
      >
        © {new Date().getFullYear()} Games. All rights reserved.
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        fontSize: "0.8rem",
        fontWeight: 500,
        color: "var(--secondary)",
        textDecoration: "none",
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.color = "var(--primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.color = "var(--secondary)";
      }}
    >
      {icon}
      {label}
    </a>
  );
}
