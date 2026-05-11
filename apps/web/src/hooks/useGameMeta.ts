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
        <path d="M18.37 2.63a2.12 2.12 0 0 1 3 3l-9.49 9.49-4.24.71.7-4.24z" fill="none" stroke="#f472b6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 16c-3 3-4 5-4 6 0 .55.45 1 1 1 1 0 3-1 6-4" fill="none" stroke="#f472b6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`
  )}`,
  location: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#2a1e0e"/>
      <g transform="translate(4,4)">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="10" r="3" fill="none" stroke="#f59e0b" stroke-width="2"/>
      </g>
    </svg>`
  )}`,
  shikaku: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#11251c"/>
      <g transform="translate(6,6)" fill="none" stroke="#34d399" stroke-width="2" stroke-linejoin="round">
        <rect x="0" y="0" width="20" height="20" rx="2"/>
        <path d="M0 7h20M0 13h20M7 0v20M13 0v20"/>
        <circle cx="4" cy="4" r="1" fill="#34d399" stroke="none"/>
        <circle cx="16" cy="10" r="1" fill="#34d399" stroke="none"/>
      </g>
    </svg>`
  )}`,
  pips: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#2f2118"/>
      <g transform="translate(5,9) rotate(-8 11 7)">
        <rect x="0" y="0" width="22" height="14" rx="3" fill="#f6f1e8" stroke="#fb923c" stroke-width="2"/>
        <path d="M11 1.5v11" stroke="#d6cab8" stroke-width="1.5"/>
        <circle cx="5" cy="4" r="1.4" fill="#242424"/>
        <circle cx="7" cy="10" r="1.4" fill="#242424"/>
        <circle cx="15.5" cy="4" r="1.4" fill="#242424"/>
        <circle cx="18.5" cy="7" r="1.4" fill="#242424"/>
        <circle cx="15.5" cy="10" r="1.4" fill="#242424"/>
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
  location: "Location Signal | Games",
  shikaku: "Shikaku | Games",
  pips: "Pips | Games",
};

function getGameFromPath(pathname: string): keyof typeof favicons {
  if (pathname.startsWith("/imposter")) return "imposter";
  if (pathname.startsWith("/password")) return "password";
  if (pathname.startsWith("/chain")) return "chain";
  if (pathname.startsWith("/shade")) return "shade";
  if (pathname.startsWith("/location")) return "location";
  if (pathname.startsWith("/shikaku")) return "shikaku";
  if (pathname.startsWith("/pips")) return "pips";
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
