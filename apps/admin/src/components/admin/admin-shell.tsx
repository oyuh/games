"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Dice5,
  Gamepad2,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Each item carries the colour it wears elsewhere in the panel, so the sidebar
 * and a game's badges, cards and dialogs can never drift apart. Sections with no
 * game of their own borrow the panel accent or a status tone.
 */
const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    accent: "var(--primary)",
  },
  {
    href: "/clients",
    label: "Clients",
    icon: Users,
    accent: "var(--game-imposter)",
  },
  {
    href: "/games",
    label: "Games",
    icon: Gamepad2,
    accent: "var(--game-password)",
  },
  {
    href: "/bans",
    label: "Moderation",
    icon: Shield,
    accent: "var(--danger)",
  },
  {
    href: "/shikaku",
    label: "Shikaku",
    icon: Trophy,
    accent: "var(--game-shikaku)",
  },
  {
    href: "/pips",
    label: "Pips",
    icon: Dice5,
    accent: "var(--game-pips)",
  },
] as const;

const SIDEBAR_COLLAPSED_KEY = "games-admin-sidebar-collapsed";

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function AdminShell({
  children,
  actions,
}: {
  children: React.ReactNode;
  sessionLabel: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(
        window.localStorage?.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
      );
    } catch {
      setCollapsed(false);
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage?.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Storage can be blocked in embedded browsers.
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "hidden h-screen shrink-0 overflow-hidden border-r border-border bg-[var(--sidebar)] transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:flex-col",
            collapsed ? "w-[76px]" : "w-[248px]",
          )}
        >
          <div
            className={cn(
              "flex h-16 shrink-0 items-center border-b border-border px-4",
              collapsed ? "justify-center" : "justify-between",
            )}
          >
            {!collapsed ? (
              <div className="text-sm font-extrabold uppercase tracking-[0.18em] text-foreground">
                ADMIN
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleCollapsed}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
          </div>

          <nav className="flex-1 space-y-1.5 p-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);

              const link = (
                <Link
                  href={item.href}
                  style={{ "--nav-accent": item.accent } as React.CSSProperties}
                  className={cn(
                    "group relative flex h-11 items-center overflow-hidden rounded-md border text-sm font-medium transition-colors",
                    collapsed ? "justify-center px-0" : "gap-3 px-3",
                    // The rail is the active marker; the wash behind it is what
                    // makes the colour readable at a glance in a list of six.
                    "before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--nav-accent)] before:transition-opacity",
                    active
                      ? "border-[color-mix(in_srgb,var(--nav-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--nav-accent)_12%,transparent)] text-foreground before:opacity-100"
                      : "border-transparent text-muted-foreground before:opacity-0 hover:border-[color-mix(in_srgb,var(--nav-accent)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--nav-accent)_7%,transparent)] hover:text-foreground hover:before:opacity-40",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      active ? "text-[var(--nav-accent)]" : "group-hover:text-[var(--nav-accent)]",
                    )}
                  />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
              );

              // Collapsed, the icon is the only label there is, so it needs a
              // tooltip rather than the browser's own title= popup.
              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <React.Fragment key={item.href}>{link}</React.Fragment>
              );
            })}
          </nav>

          <div
            className={cn(
              "shrink-0 space-y-2 border-t border-border p-3",
              "[&_form]:contents [&_[data-slot=button]]:w-full",
              collapsed
                ? "[&_[data-slot=button]]:size-10 [&_[data-slot=button]]:min-w-0 [&_[data-slot=button]]:justify-start [&_[data-slot=button]]:overflow-hidden [&_[data-slot=button]]:px-3"
                : "[&_[data-slot=button]]:justify-start",
            )}
          >
            {actions}
            <ThemeToggle
              className={cn(
                "w-full",
                collapsed ? "size-10 overflow-hidden px-3" : "justify-start",
              )}
              showLabel={!collapsed}
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-background lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="text-sm font-semibold uppercase tracking-normal text-foreground">
                ADMIN
              </div>
              <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto [&_form]:contents">
                {actions}
                <ThemeToggle />
              </div>
            </div>
            <nav className="flex gap-2 overflow-x-auto border-t border-border px-4 py-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ "--nav-accent": item.accent } as React.CSSProperties}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                      active
                        ? "border-[color-mix(in_srgb,var(--nav-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--nav-accent)_14%,transparent)] text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", active && "text-[var(--nav-accent)]")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8 xl:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
