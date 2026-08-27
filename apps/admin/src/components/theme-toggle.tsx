"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SidebarAction } from "@/components/admin/sidebar-action";

const STORAGE_KEY = "games-admin-theme";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  let stored: string | null | undefined;

  try {
    stored = window.localStorage?.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }

  if (stored === "dark" || stored === "light") {
    return stored;
  }

  // Dark-first, same as the site and the bootstrap script.
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle({
  className,
  /**
   * The sidebar footer wants a row matching its neighbours; the mobile header
   * wants a plain icon button. Same behaviour, two shapes, rather than one
   * shape bent into the other by the parent.
   */
  asSidebarAction = false,
}: {
  className?: string;
  asSidebarAction?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const preferredTheme = getPreferredTheme();
    setTheme(preferredTheme);
    applyTheme(preferredTheme);
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;

  const toggle = () => {
    setTheme(nextTheme);
    try {
      window.localStorage?.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Storage can be blocked in embedded browsers.
    }
    applyTheme(nextTheme);
  };

  if (asSidebarAction) {
    return (
      <SidebarAction
        icon={Icon}
        label={theme === "dark" ? "Light mode" : "Dark mode"}
        aria-pressed={theme === "dark"}
        onClick={toggle}
        {...(className ? { className } : {})}
      />
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${nextTheme} mode`}
      className={className}
      onClick={toggle}
    >
      <Icon className="size-4" />
    </Button>
  );
}
