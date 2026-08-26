import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The site's card look, defined once.
 *
 * Built from the same four pieces apps/web/src/styles/components.css uses: an
 * accent wash, a faint two-axis grid, a base fill, and a shadow. Tint one by
 * setting `accent` (or --card-accent in a style prop) and the border, the wash
 * and the fill all follow it, so a game-scoped card never needs a hand-picked
 * gradient of its own.
 *
 * Replaces the local `function Surface()` that was copy-pasted into eight files.
 */
const surfaceVariants = cva(
  "rounded-xl border bg-[var(--surface-bg)] shadow-[var(--surface-shadow)] [border-color:color-mix(in_srgb,var(--card-accent,var(--primary))_18%,transparent)]",
  {
    variants: {
      tone: {
        // A plain card: the neutral surface gradient, no accent wash.
        plain: "",
        // An accented card is a moodier version of a plain one, so the tint goes
        // over --surface-bottom and never lands lighter than a plain card.
        accent:
          "[--surface-bg:linear-gradient(160deg,color-mix(in_srgb,var(--card-accent,var(--primary))_10%,var(--surface-bottom))_0%,var(--surface-bottom)_100%)]",
        // A section inside a card or dialog, matching .panel on the site: quieter
        // than a card so nesting one in another still reads as nesting.
        panel:
          "rounded-lg border-[color-mix(in_srgb,var(--secondary)_30%,transparent)] bg-none bg-[color-mix(in_srgb,var(--secondary)_10%,transparent)] shadow-none",
        // Empty states and placeholders: no fill, just an outline.
        dashed:
          "border-dashed bg-none bg-transparent shadow-none [border-color:var(--border)]",
      },
      pad: {
        none: "p-0",
        sm: "p-4",
        md: "p-5",
        lg: "p-6",
      },
      interactive: {
        true: "transition-[border-color,box-shadow] hover:shadow-[var(--surface-shadow-hover)] hover:[border-color:color-mix(in_srgb,var(--card-accent,var(--primary))_35%,transparent)]",
        false: "",
      },
    },
    defaultVariants: {
      tone: "plain",
      pad: "md",
      interactive: false,
    },
  },
);

type SurfaceProps = React.ComponentPropsWithoutRef<"section"> &
  VariantProps<typeof surfaceVariants> & {
    /** Any CSS colour. Drives the border, the wash and the fill together. */
    accent?: string;
  };

function Surface({
  className,
  tone,
  pad,
  interactive,
  accent,
  style,
  ...props
}: SurfaceProps) {
  return (
    <section
      data-slot="surface"
      className={cn(surfaceVariants({ tone, pad, interactive }), className)}
      style={accent ? { ...style, "--card-accent": accent } as React.CSSProperties : style}
      {...props}
    />
  );
}

export { Surface, surfaceVariants };
