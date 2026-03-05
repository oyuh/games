export function ImposterLobbyActions({
  canStart,
  onStart,
  onLeave
}: {
  canStart: boolean;
  onStart: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button className="btn btn-primary" disabled={!canStart} onClick={onStart}>
        Start round
      </button>
      <button className="btn btn-muted" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}
