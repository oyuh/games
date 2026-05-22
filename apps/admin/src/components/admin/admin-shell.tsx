"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Dice5,
  Gamepad2,
  LayoutDashboard,
  RadioTower,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    description: "Overview and live control",
    icon: LayoutDashboard,
  },
  {
    href: "/clients",
    label: "Clients",
    description: "Sessions and moderation",
    icon: Users,
  },
  {
    href: "/games",
    label: "Games",
    description: "Rooms and state inspection",
    icon: Gamepad2,
  },
  {
    href: "/bans",
    label: "Moderation",
    description: "Bans, names, overrides",
    icon: Shield,
  },
  {
    href: "/shikaku",
    label: "Shikaku",
    description: "Scores and cleanup",
    icon: Trophy,
  },
  {
    href: "/pips",
    label: "Pips",
    description: "Runs and leaderboard",
    icon: Dice5,
  },
] as const;

function resolvePageMeta(pathname: string) {
  if (pathname.startsWith("/clients")) {
    return {
      eyebrow: "Client Monitoring",
      title: "Client Watch",
      description:
        "Search live sessions, inspect their current room, and apply moderation without context switching.",
    };
  }

  if (pathname.startsWith("/games")) {
    return {
      eyebrow: "Game Control",
      title: "Live Rooms",
      description:
        "Track active rooms by type, inspect raw state, and intervene from one surface.",
    };
  }

  if (pathname.startsWith("/bans") || pathname.startsWith("/names")) {
    return {
      eyebrow: "Moderation Desk",
      title: "Restrictions",
      description:
        "Manage bans, restricted names, and forced overrides with the same enforcement path the live site uses.",
    };
  }

  if (pathname.startsWith("/shikaku")) {
    return {
      eyebrow: "Records",
      title: "Shikaku Scores",
      description:
        "Edit persisted score data, filter suspicious runs, and clean leaderboard entries without touching the database.",
    };
  }

  if (pathname.startsWith("/pips")) {
    return {
      eyebrow: "Records",
      title: "Pips Runs",
      description:
        "Inspect ranked run splits, edit leaderboard entries, and clean Pips score records from the admin console.",
    };
  }

  return {
    eyebrow: "Live Operations",
    title: "Operations Overview",
    description:
      "Current health, game activity, moderation pressure, and site messaging in one admin surface.",
  };
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "AD";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function AdminShell({
  children,
  sessionLabel,
  actions,
}: {
  children: React.ReactNode;
  sessionLabel: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const page = resolvePageMeta(pathname);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-[250px] shrink-0 flex-col border-r border-border bg-card lg:flex xl:w-[268px]">
          <div className="border-b border-border p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                <RadioTower className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Games.lawsonhart.me
                </div>
                <div className="mt-1 truncate text-lg font-semibold tracking-normal text-foreground">
                  Admin Console
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 py-6">
            <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
              Navigation
            </div>
            <nav className="mt-4 space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg border p-3 transition-colors",
                      active
                        ? "border-border bg-muted text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg border",
                        active
                          ? "border-border bg-background text-foreground"
                          : "border-border bg-card text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium tracking-normal">
                        {item.label}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground group-hover:text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-border px-4 py-5">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
                Signed In
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground">
                  {getInitials(sessionLabel)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {sessionLabel}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Authenticated admin session
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-border bg-background/96 ">
            <div className="flex flex-col gap-4 p-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-6">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
                  {page.eyebrow}
                </div>
                <div className="mt-2 text-[1.8rem] font-semibold tracking-normal text-foreground sm:text-[2.2rem]">
                  {page.title}
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {page.description}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end lg:shrink-0">
                {actions ? (
                  <div className="flex flex-wrap gap-2 [&>*]:shrink-0 [&_form]:contents">
                    {actions}
                  </div>
                ) : null}

                <ThemeToggle />

                <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground">
                    {getInitials(sessionLabel)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
                      Admin
                    </div>
                    <div className="max-w-[180px] truncate text-sm font-medium text-foreground">
                      {sessionLabel}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border px-5 py-3 lg:hidden sm:px-8">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
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
              </div>
            </div>
          </header>

          <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">
            <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground sm:px-5">
              Live admin state updates continuously. Use the overview for fast
              triage, then drill into clients, rooms, moderation, or score
              records from the left rail.
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
