// Avatar color palette - vibrant colors for player differentiation
export const AVATAR_COLORS = [
  "#FF6B6B",  // Bright Red
  "#4ECDC4",  // Turquoise
  "#45B7D1",  // Sky Blue
  "#FFA07A",  // Light Salmon
  "#98D8C8",  // Mint
  "#F7DC6F",  // Golden Yellow
  "#BB8FCE",  // Lavender
  "#85C1E2",  // Powder Blue
  "#F8B88B",  // Peach
  "#52C4A6",  // Emerald
  "#FF85A1",  // Hot Pink
  "#A6CC9D",  // Sage Green
  "#FFB84D",  // Tangerine
  "#6C5CE7",  // Deep Purple
  "#00B894"   // Organic Green
];

function colorAt(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length] ?? AVATAR_COLORS[0] ?? "#4ECDC4";
}

/**
 * Get avatar color for a player based on their index in the players array
 * Cycles through the color palette to ensure distinct colors within a game
 */
export function getPlayerColor(playerIndex: number): string {
  return colorAt(playerIndex);
}

/**
 * Get a set of 5 colors for a boring-avatars component, offset by player index
 */
export function getAvatarColors(playerIndex: number): string[] {
  const start = (playerIndex * 3) % AVATAR_COLORS.length;
  const colors: string[] = [];
  for (let i = 0; i < 5; i++) {
    colors.push(colorAt(start + i));
  }
  return colors;
}
