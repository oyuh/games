"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Whether the sidebar is collapsed.
 *
 * The footer's contents are passed in from the dashboard layout, which is a
 * server component and cannot see the shell's client state. A context lets
 * each action size itself without the shell reaching in from outside with
 * descendant selectors, which is what the footer used to do.
 */
const SidebarCollapsed = React.createContext(false);

export function SidebarCollapsedProvider({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <SidebarCollapsed.Provider value={collapsed}>
      {children}
    </SidebarCollapsed.Provider>
  );
}

export function useSidebarCollapsed() {
  return React.useContext(SidebarCollapsed);
}

/**
 * One row in the sidebar footer.
 *
 * Deliberately not a Button: these needed identical geometry to the nav links
 * above them, and every attempt to get that by overriding Button's variants
 * from the parent produced a pile of `[&_[data-slot=button]]:` selectors
 * fighting the component's own classes.
 *
 * Collapsed, it becomes a square icon with a tooltip, matching the nav.
 */
export const SidebarAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    /** Tints the icon and the hover wash, for a destructive or accented row. */
    accent?: string;
  }
>(function SidebarAction(
  { icon: Icon, label, accent, className, ...props },
  ref,
) {
  const collapsed = useSidebarCollapsed();

  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={collapsed ? label : undefined}
      style={accent ? ({ "--row-accent": accent } as React.CSSProperties) : undefined}
      className={cn(
        "group/action relative flex h-9 items-center rounded-md text-sm font-medium",
        "text-muted-foreground transition-colors outline-none",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
        accent
          ? "hover:bg-[color-mix(in_srgb,var(--row-accent)_12%,transparent)] hover:text-[var(--row-accent)]"
          : "hover:bg-accent",
        collapsed ? "w-9 justify-center px-0" : "w-full justify-start gap-3 px-3",
        className,
      )}
      {...props}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          accent && "group-hover/action:text-[var(--row-accent)]",
        )}
      />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
});
