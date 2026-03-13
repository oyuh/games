import Avatar from "boring-avatars";
import { getAvatarColors } from "../../lib/avatar";

interface BorringAvatarProps {
  seed: string;
  size?: number;
  playerIndex?: number;
  colors?: string[];
  className?: string;
}

export function BorringAvatar({
  seed,
  size,
  playerIndex = 0,
  colors,
  className = ""
}: BorringAvatarProps) {
  const avatarColors = colors ?? getAvatarColors(playerIndex);

  return (
    <span
      className={`boring-avatar ${className}`}
      style={{
        display: "inline-flex",
        flexShrink: 0,
        width: size ? `${size}px` : "100%",
        height: size ? `${size}px` : "100%",
      }}
    >
      <Avatar
        size="100%"
        name={seed}
        variant="beam"
        colors={avatarColors}
        square={false}
      />
    </span>
  );
}
