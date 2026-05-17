import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function MobileGameNotFound({
  theme,
  title = "Game not found",
  subtitle = "Redirecting home…",
  autoRedirect = true,
}: {
  theme: string;
  title?: string;
  subtitle?: string;
  autoRedirect?: boolean;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!autoRedirect) {
      return;
    }
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [autoRedirect, navigate]);

  return (
    <div className="m-page" data-game-theme={theme}>
      <div className="m-empty">
        <p>{title}</p>
        <p style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: "0.5rem" }}>{subtitle}</p>
        <button className="m-btn m-btn-primary" style={{ marginTop: "0.75rem" }} onClick={() => navigate("/")}>Go Home</button>
      </div>
    </div>
  );
}
