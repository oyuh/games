"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gamepad2,
  LayoutDashboard,
  RadioTower,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
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
] as const;

function resolvePageMeta(pathname: string) {
  if (pathname.startsWith("/clients")) {
    return {
      eyebrow: "Client Monitoring",
      title: "Client Watch",
      description: "Search live sessions, inspect their current room, and apply moderation without context switching.",
    };
  }

  if (pathname.startsWith("/games")) {
    return {
      eyebrow: "Game Control",
      title: "Live Rooms",
      description: "Track active rooms by type, inspect raw state, and intervene from one surface.",
    };
  }

  if (pathname.startsWith("/bans") || pathname.startsWith("/names")) {
    return {
      eyebrow: "Moderation Desk",
      title: "Restrictions",
      description: "Manage bans, restricted names, and forced overrides with the same enforcement path the live site uses.",
    };
  }

  if (pathname.startsWith("/shikaku")) {
    return {
      eyebrow: "Records",
      title: "Shikaku Scores",
      description: "Edit persisted score data, filter suspicious runs, and clean leaderboard entries without touching the database.",
    };
  }

  return {
    eyebrow: "Live Operations",
    title: "Operations Overview",
    description: "Current health, game activity, moderation pressure, and site messaging in one admin surface.",
  };
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

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
        <aside className="hidden w-[250px] shrink-0 flex-col border-r border-white/8 bg-[#0d1624] lg:flex xl:w-[268px]">
          <div className="border-b border-white/8 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-[#101b2d] text-slate-100">
                <RadioTower className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Games.lawsonhart.me
                </div>
                <div className="mt-1 truncate text-lg font-semibold tracking-[-0.04em] text-white">
                  Admin Console
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 py-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
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
                      "group flex items-center gap-3 rounded-[18px] border px-3 py-3 transition-colors",
                      active
                        ? "border-[#38589a] bg-[#13223a] text-white"
                        : "border-transparent text-slate-300 hover:border-white/8 hover:bg-white/[0.03] hover:text-white"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-[14px] border",
                        active
                          ? "border-[#4567af] bg-[#1a2e4d] text-slate-50"
                          : "border-white/8 bg-[#101927] text-slate-400 group-hover:text-slate-100"
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium tracking-tight">{item.label}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-400 group-hover:text-slate-300">
                        {item.description}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-white/8 px-4 py-5">
            <div className="rounded-[20px] border border-white/8 bg-[#101927] px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Signed In
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-[14px] bg-[#17263c] text-sm font-semibold text-slate-100">
                  {getInitials(sessionLabel)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{sessionLabel}</div>
                  <div className="mt-0.5 text-xs text-slate-400">Authenticated admin session</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-white/8 bg-background/96 backdrop-blur-xl">
            <div className="flex flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-6">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  {page.eyebrow}
                </div>
                <div className="mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-white sm:text-[2.2rem]">
                  {page.title}
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  {page.description}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end lg:shrink-0">
                {actions ? (
                  <div className="flex flex-wrap gap-2 [&>*]:shrink-0 [&_form]:contents">
                    {actions}
                  </div>
                ) : null}

                <div className="flex items-center gap-3 rounded-[20px] border border-white/8 bg-[#101927] px-3.5 py-3">
                  <div className="flex size-10 items-center justify-center rounded-[14px] bg-[#17263c] text-sm font-semibold text-slate-100">
                    {getInitials(sessionLabel)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                      Admin
                    </div>
                    <div className="max-w-[180px] truncate text-sm font-medium text-white">
                      {sessionLabel}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/8 px-5 py-3 lg:hidden sm:px-8">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-[#38589a] bg-[#13223a] text-white"
                          : "border-white/8 bg-[#101927] text-slate-300"
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
            <div className="mb-6 rounded-[20px] border border-white/8 bg-[#0f1826] px-4 py-3 text-sm text-slate-300 sm:px-5">
              Live admin state updates continuously. Use the overview for fast triage, then drill into clients, rooms, moderation, or score records from the left rail.
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
