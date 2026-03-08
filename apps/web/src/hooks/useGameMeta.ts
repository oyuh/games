import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** SVG favicon data URIs matching each game's card icon */
const favicons = {
  home: "/favicon.ico",
  imposter: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#1d2430"/>
      <g transform="translate(4,4)">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="#7eb8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="12" r="3" fill="none" stroke="#7eb8ff" stroke-width="2"/>
      </g>
    </svg>`
  )}`,
  password: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#21272e"/>
      <g transform="translate(4,4)">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`
  )}`,
  chain: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#1a2e26"/>
      <g transform="translate(4,4)">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`
  )}`,
  shade: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#2a1a2e"/>
      <g transform="translate(4,4)">
        <circle cx="13.5" cy="6.5" r="2.5" fill="none" stroke="#f472b6" stroke-width="2"/>
        <circle cx="17.5" cy="10.5" r="2.5" fill="none" stroke="#f472b6" stroke-width="2"/>
        <circle cx="8.5" cy="7.5" r="2.5" fill="none" stroke="#f472b6" stroke-width="2"/>
        <circle cx="6.5" cy="12.5" r="2.5" fill="none" stroke="#f472b6" stroke-width="2"/>
        <path d="M12 22c5.523 0 8-4.477 8-10S17.523 2 12 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2.5 21.5l4.5-.838A9.955 9.955 0 0 0 12 22z" fill="none" stroke="#f472b6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`
  )}`,
} as const;

const titles: Record<string, string> = {
  home: "Games",
  imposter: "Imposter | Games",
  password: "Password | Games",
  chain: "Chain Reaction | Games",
  shade: "Shade Signal | Games",
};

function getGameFromPath(pathname: string): keyof typeof favicons {
  if (pathname.startsWith("/imposter")) return "imposter";
  if (pathname.startsWith("/password")) return "password";
  if (pathname.startsWith("/chain")) return "chain";
  if (pathname.startsWith("/shade")) return "shade";
  return "home";
}

export function useGameMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const game = getGameFromPath(pathname);

    // Update title
    document.title = titles[game] ?? "Games";

    // Update favicon
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = favicons[game];
  }, [pathname]);
}
