import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function MobileGameNotFound({ theme }: { theme: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="m-page" data-game-theme={theme}>
      <div className="m-empty">
        <p>Game not found</p>
        <p style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: "0.5rem" }}>Redirecting home…</p>
        <button className="m-btn m-btn-primary" style={{ marginTop: "0.75rem" }} onClick={() => navigate("/")}>Go Home</button>
      </div>
    </div>
  );
}
