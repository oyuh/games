import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:ring-destructive/20 [a]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a]:hover:bg-accent [a]:hover:text-foreground",
        ghost: "hover:bg-accent hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",

        /* Status pills, matching .badge-* in apps/web/src/styles/components.css.
           Each is a wash of its own tone rather than a flat fill, so they read
           as states on a surface instead of solid buttons. The tones come from
           --ok / --warn / --danger, which are themed in globals.css. */
        success:
          "border-[color-mix(in_srgb,var(--ok)_30%,transparent)] bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]",
        warn: "border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] text-[var(--warn)]",
        danger:
          "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)]",
        muted:
          "border-[color-mix(in_srgb,var(--muted-foreground)_25%,transparent)] bg-[color-mix(in_srgb,var(--muted-foreground)_15%,transparent)] text-muted-foreground",

        /* Takes its colour from --badge-accent, so one variant covers all seven
           games instead of seven near-identical variants. Pass the colour with
           the `accent` prop. */
        accent:
          "border-[color-mix(in_srgb,var(--badge-accent,var(--primary))_30%,transparent)] bg-[color-mix(in_srgb,var(--badge-accent,var(--primary))_18%,transparent)] text-[var(--badge-accent,var(--primary))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  accent,
  style,
  ...props
}: React.ComponentPropsWithoutRef<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** Any CSS colour. Only read by the `accent` variant. */
    accent?: string;
  }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      style={
        accent ? ({ ...style, "--badge-accent": accent } as React.CSSProperties) : style
      }
      {...props}
    />
  );
}

export { Badge };
