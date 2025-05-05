import React from "react";

// 12 rows (A-L), 24 columns (1-24)
const ROWS = 12;
const COLS = 24;
const rowLabels = Array.from({ length: ROWS }, (_, i) => String.fromCharCode(65 + i));
const colLabels = Array.from({ length: COLS }, (_, i) => (i + 1).toString());

// Improved color function: wide hue range, high saturation, distinct lightness
function getCellColor(row: number, col: number): string {
  // Hue: 0-300 across columns (rainbow, skips red wrap)
  const hue = (col / (COLS - 1)) * 300;
  // Lightness: 80% (top) to 45% (bottom)
  const lightness = 80 - (row / (ROWS - 1)) * 35;
  // High saturation for vibrancy
  return `hsl(${hue}, 85%, ${lightness}%)`;
}

export interface HexGridProps {
  selectedCell?: string;
  correctCell?: string;
  incorrectCells?: string[];
  disabledCells?: string[];
  onCellClick?: (cell: string, color: string) => void;
  width?: number;
  height?: number;
  showCoordinates?: boolean;
  className?: string;
}

export const HexGrid: React.FC<HexGridProps> = ({
  selectedCell,
  correctCell,
  incorrectCells = [],
  disabledCells = [],
  onCellClick,
  width = 400,
  height = 300,
  showCoordinates = true,
  className = "",
}) => {
  // Calculate the cell size based on available width and height
  // Leave space for labels (10% of width/height)
  const cellWidth = (width * 0.9) / COLS;
  const cellHeight = (height * 0.9) / ROWS;
  const cellSize = Math.min(cellWidth, cellHeight);

  // Calculate offsets to center the grid
  const xOffset = showCoordinates ? cellSize * 0.8 : 0;
  const yOffset = showCoordinates ? cellSize * 0.8 : 0;
  const fontSize = Math.max(8, Math.min(10, cellSize * 0.4));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`hexgrid-svg ${className}`}
      style={{ touchAction: "manipulation" }}
    >
      {/* Column labels */}
      {showCoordinates && colLabels.map((col, colIdx) => (
        <text
          key={`col-${col}`}
          x={xOffset + colIdx * cellSize + cellSize / 2}
          y={yOffset / 2}
          fontSize={fontSize}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#888888"
        >
          {col}
        </text>
      ))}

      {/* Row labels */}
      {showCoordinates && rowLabels.map((row, rowIdx) => (
        <text
          key={`row-${row}`}
          x={xOffset / 2}
          y={yOffset + rowIdx * cellSize + cellSize / 2}
          fontSize={fontSize}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#888888"
        >
          {row}
        </text>
      ))}

      {/* Color cells */}
      {rowLabels.map((row, rowIdx) => (
        colLabels.map((col, colIdx) => {
          const cellId = `${row}${col}`;
          const color = getCellColor(rowIdx, colIdx);
          const isSelected = selectedCell === cellId;
          const isCorrect = correctCell === cellId;
          const isIncorrect = incorrectCells.includes(cellId);
          const isDisabled = disabledCells.includes(cellId);

          // Output rectangle with proper color and border
          return (
            <g key={cellId}>
              <rect
                x={xOffset + colIdx * cellSize}
                y={yOffset + rowIdx * cellSize}
                width={cellSize * 0.9}
                height={cellSize * 0.9}
                rx={cellSize * 0.2}
                ry={cellSize * 0.2}
                fill={color}
                stroke={
                  isSelected ? "#3366ff" :
                  isCorrect ? "#22cc66" :
                  isIncorrect ? "#ff3366" :
                  "rgba(0,0,0,0.2)"
                }
                strokeWidth={isSelected || isCorrect || isIncorrect ? 2 : 1}
                opacity={isDisabled ? 0.3 : 1}
                onClick={() => !isDisabled && onCellClick?.(cellId, color)}
                style={{ cursor: isDisabled ? "not-allowed" : "pointer" }}
              />
            </g>
          );
        })
      ))}
    </svg>
  );
};

export default HexGrid;
