import { signIn } from "@/auth";

const isDev = process.env.NODE_ENV !== "production";
const hasDevSecret = !!process.env.ADMIN_DEV_SECRET;

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(to bottom right, #232323, #181a1b)",
          border: "1px solid color-mix(in srgb, #7ecbff 20%, transparent)",
          borderRadius: "1rem",
          padding: "2.5rem",
          textAlign: "center",
          maxWidth: "380px",
          width: "100%",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
          Games Admin
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", marginBottom: "2rem" }}>
          Sign in with your authorized GitHub account to continue.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              background: "#fff",
              color: "#000",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "0.9375rem",
              fontWeight: 500,
              cursor: "pointer",
              width: "100%",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        </form>
        {isDev && hasDevSecret && (
          <>
            <div style={{ margin: "1.5rem 0 1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>DEV</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("dev-login", {
                  secret: process.env.ADMIN_DEV_SECRET!,
                  redirectTo: "/",
                });
              }}
            >
              <button
                type="submit"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1.5rem",
                  background: "color-mix(in srgb, #7ecbff 15%, transparent)",
                  color: "#7ecbff",
                  border: "1px solid color-mix(in srgb, #7ecbff 35%, transparent)",
                  borderRadius: "0.5rem",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                Dev Login (Local Only)
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
