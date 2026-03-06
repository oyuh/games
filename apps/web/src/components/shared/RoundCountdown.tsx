import { useEffect, useMemo, useState } from "react";

export function RoundCountdown({
  endsAt,
  label
}: {
  endsAt: number | null | undefined;
  label: string;
}) {
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = useMemo(() => {
    if (!endsAt) {
      return null;
    }
    return Math.max(0, Math.floor((endsAt - nowTs) / 1000));
  }, [endsAt, nowTs]);

  if (remaining === null) {
    return null;
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const expired = remaining <= 0;
  const urgent = remaining <= 10 && !expired;

  return (
    <span className={`${expired ? "badge badge-danger" : urgent ? "badge badge-danger countdown-flash" : "badge badge-warn"}`}>
      {label}: {mm}:{ss}
    </span>
  );
}
