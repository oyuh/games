import { GAME_ICON_SVGS, GAME_META, type GameSlug } from "@games/shared";
import type { CSSProperties } from "react";

type GameIconProps = {
  game: GameSlug;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  color?: string;
  title?: string;
};

const HOME_ICON_SRC = "/icon-192.png";

export function GameIcon({ game, size = 18, className, style, color, title }: GameIconProps) {
  if (game === "home") {
    return (
      <img
        className={className}
        src={HOME_ICON_SRC}
        width={size}
        height={size}
        style={{ display: "block", objectFit: "contain", ...style }}
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        alt={title ?? ""}
      />
    );
  }

  const meta = GAME_META[game];
  const icon = GAME_ICON_SVGS[meta.icon];

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={icon.viewBox}
      color={color ?? "currentColor"}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: icon.markup }}
    />
  );
}
