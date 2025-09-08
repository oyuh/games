import { cn } from "~/lib/utils";

interface ProgressProps {
  value: number; // 0 to 1 (e.g., 0.75 for 75%)
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "success" | "warning" | "danger";
  showPercentage?: boolean;
  animated?: boolean;
}

export function Progress({
  value,
  className,
  size = "md",
  variant = "default",
  showPercentage = false,
  animated = false
}: ProgressProps) {
  const percentage = Math.min(Math.max(value * 100, 0), 100);

  const sizeClasses = {
    sm: "h-2",
    md: "h-3",
    lg: "h-4"
  };

  const variantClasses = {
    default: "bg-gradient-to-r from-primary/60 to-primary/80",
    success: "bg-gradient-to-r from-primary/70 to-primary",
    warning: "bg-gradient-to-r from-primary/40 to-primary/70",
    danger: "bg-gradient-to-r from-primary/20 to-primary/50"
  };

  return (
    <div className={cn("w-full", className)}>
      {showPercentage && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-secondary/70">Development</span>
          <span className="text-xs font-medium text-secondary/70">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={cn(
        "w-full bg-secondary/20 rounded-full overflow-hidden border border-secondary/30",
        sizeClasses[size]
      )}>
        <div
          className={cn(
            "h-full transition-all duration-500 ease-out rounded-full relative",
            variantClasses[variant],
            animated && "animate-pulse"
          )}
          style={{ width: `${percentage}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
