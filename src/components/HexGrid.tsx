import type { FC } from "react";

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

export const HexGrid: FC<HexGridProps> = ({
  selectedCell,
  correctCell,
  incorrectCells = [],
  disabledCells = [],
  onCellClick,
  width = 600,
  height = 250,
  showCoordinates = true,
  className = "",
}) => {
  // Make cell size responsive to the overall SVG container size
  // Prioritize fitting all columns within the given width.
  const effectiveWidth = width;
  const effectiveHeight = height;

  // Calculate cell size to fit COLS within the effectiveWidth, allowing for labels
  const labelAllowanceFactor = showCoordinates ? 0.80 : 1.0; // Adjusted for potentially larger labels
  const cellSizeByWidth = (effectiveWidth * labelAllowanceFactor) / COLS;

  // Calculate cell size to fit ROWS within the effectiveHeight, allowing for labels
  const cellSizeByHeight = (effectiveHeight * labelAllowanceFactor) / ROWS;

  // Use the smaller of the two to ensure the grid fits in both dimensions
  const cellSize = Math.min(cellSizeByWidth, cellSizeByHeight);

  // Calculate offsets to center the grid within the SVG container
  const actualGridWidth = cellSize * COLS;
  const actualGridHeight = cellSize * ROWS;

  const xLabelOffset = showCoordinates ? cellSize * 0.8 : 0; // Increased space for labels
  const yLabelOffset = showCoordinates ? cellSize * 0.8 : 0; // Increased space for labels

  const totalContentWidth = actualGridWidth + (showCoordinates ? xLabelOffset : 0);
  const totalContentHeight = actualGridHeight + (showCoordinates ? yLabelOffset : 0);

  const xOffset = (effectiveWidth - totalContentWidth) / 2 + (showCoordinates ? xLabelOffset : 0);
  const yOffset = (effectiveHeight - totalContentHeight) / 2 + (showCoordinates ? yLabelOffset : 0);

  const baseFontSize = Math.max(7, Math.min(12, cellSize * 0.42)); // Increased base font size
  const selectedLabelColor = "#3366ff"; // Color for highlighted labels
  const defaultLabelColor = "#cccccc"; // Brighter default color for labels

  // Determine selected row and column from selectedCell prop
  let selectedRowLabel: string | null = null;
  let selectedColLabel: string | null = null;
  if (selectedCell && selectedCell.length > 1) {
    selectedRowLabel = selectedCell.charAt(0).toUpperCase();
    selectedColLabel = selectedCell.substring(1);
  }

  return (
    <svg
      width={effectiveWidth}
      height={effectiveHeight}
      viewBox={`0 0 ${effectiveWidth} ${effectiveHeight}`}
      className={`hexgrid-svg ${className}`}
      style={{ touchAction: "manipulation" }}
      role="img"
    >
      <title>Hexagonal Color Grid</title>
      {/* Column labels */}
      {showCoordinates && colLabels.map((col, colIdx) => (
        <text
          key={`col-${col}`}
          x={xOffset + colIdx * cellSize + cellSize / 2}
          y={yOffset - yLabelOffset / 2} // Adjusted for better centering above grid
          fontSize={baseFontSize}
          fontWeight={selectedColLabel === col ? "bold" : "normal"}
          textAnchor="middle"
          dominantBaseline="alphabetic"
          fill={selectedColLabel === col ? selectedLabelColor : defaultLabelColor}
        >
          {col}
        </text>
      ))}

      {/* Row labels */}
      {showCoordinates && rowLabels.map((row, rowIdx) => (
        <text
          key={`row-${row}`}
          x={xOffset - xLabelOffset / 2} // Adjusted for better centering left of grid
          y={yOffset + rowIdx * cellSize + cellSize / 2}
          fontSize={baseFontSize}
          fontWeight={selectedRowLabel === row ? "bold" : "normal"}
          textAnchor="end"
          dominantBaseline="middle"
          fill={selectedRowLabel === row ? selectedLabelColor : defaultLabelColor}
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

          return (
            <g key={cellId}>
              <rect
                x={xOffset + colIdx * cellSize}
                y={yOffset + rowIdx * cellSize}
                width={cellSize * 0.92}
                height={cellSize * 0.92}
                rx={cellSize * 0.15}
                ry={cellSize * 0.15}
                fill={color}
                stroke={
                  isSelected ? "#3366ff" :
                  isCorrect ? "#22cc66" :
                  isIncorrect ? "#ff3366" :
                  "rgba(0,0,0,0.2)"
                }
                strokeWidth={isSelected || isCorrect || isIncorrect ? Math.max(1, cellSize * 0.08) : Math.max(0.5, cellSize * 0.04)}
                opacity={isDisabled ? 0.3 : 1}
                onClick={() => !isDisabled && onCellClick?.(cellId, color)}
                onKeyPress={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !isDisabled) {
                    onCellClick?.(cellId, color);
                  }
                }}
                tabIndex={isDisabled ? -1 : 0}
                role="button"
                aria-label={`Color cell ${cellId}`}
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
