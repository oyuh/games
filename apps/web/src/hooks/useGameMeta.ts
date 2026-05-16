import { GAME_META, getGameSlugFromPath, renderGameFaviconSvg, svgToDataUri } from "@games/shared";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "https://api.games.lawsonhart.me" : "http://localhost:3001");
const SITE_NAME = "Games · Lawson Hart";

function publicApiBase() {
  try {
    return new URL(API_BASE, window.location.origin).toString().replace(/\/$/, "");
  } catch {
    return "https://api.games.lawsonhart.me";
  }
}

function setMetaByName(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setMetaByProperty(property: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setLink(rel: string, href: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

export function useGameMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const slug = getGameSlugFromPath(pathname);
    const meta = GAME_META[slug];
    const pageUrl = new URL(pathname, window.location.origin).toString();
    const imageUrl = `${publicApiBase()}/api/embed/card.png?path=${encodeURIComponent(pathname)}`;
    const title = meta.pageTitle;

    document.title = title;
    setLink("icon", svgToDataUri(renderGameFaviconSvg(slug)));
    setLink("canonical", pageUrl);

    setMetaByName("theme-color", meta.themeColor);
    setMetaByProperty("og:type", "website");
    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", meta.description);
    setMetaByProperty("og:image", imageUrl);
    setMetaByProperty("og:image:alt", `${meta.title} icon and game card`);
    setMetaByProperty("og:url", pageUrl);
    setMetaByProperty("og:site_name", SITE_NAME);

    setMetaByName("twitter:card", "summary_large_image");
    setMetaByName("twitter:title", title);
    setMetaByName("twitter:description", meta.description);
    setMetaByName("twitter:image", imageUrl);
    setMetaByName("twitter:image:alt", `${meta.title} icon and game card`);
  }, [pathname]);
}
