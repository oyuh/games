import { Button } from "flowbite-react";

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
      <Button className="bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]" disabled={!canStart} onClick={onStart}>
        Start round
      </Button>
      <Button color="light" onClick={onLeave}>
        Leave
      </Button>
    </div>
  );
}
