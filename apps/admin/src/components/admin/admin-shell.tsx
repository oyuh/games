"use client";

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
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/clients",
    label: "Clients",
    icon: Users,
  },
  {
    href: "/games",
    label: "Games",
    icon: Gamepad2,
  },
  {
    href: "/bans",
    label: "Moderation",
    icon: Shield,
  },
  {
    href: "/shikaku",
    label: "Shikaku",
    icon: Trophy,
  },
  {
    href: "/pips",
    label: "Pips",
    icon: Dice5,
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
            "hidden h-screen shrink-0 overflow-hidden border-r border-border bg-card transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:flex-col",
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
              <div className="text-sm font-semibold uppercase tracking-normal text-foreground">
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

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group flex h-11 items-center rounded-md border text-sm font-medium transition-colors",
                    collapsed ? "justify-center px-0" : "gap-3 px-3",
                    active
                      ? "border-border bg-muted text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
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
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                      active
                        ? "border-border bg-muted text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
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
