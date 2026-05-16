import { GAME_META, getGameSlugFromPath, renderGameFaviconSvg, svgToDataUri } from "@games/shared";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_NAME = "Games · Lawson Hart";

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
    const title = meta.pageTitle;

    document.title = title;
    setLink("icon", svgToDataUri(renderGameFaviconSvg(slug)));
    setLink("canonical", pageUrl);

    setMetaByName("theme-color", meta.themeColor);
    setMetaByProperty("og:type", "website");
    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", meta.description);
    setMetaByProperty("og:url", pageUrl);
    setMetaByProperty("og:site_name", SITE_NAME);

    setMetaByName("twitter:card", "summary");
    setMetaByName("twitter:title", title);
    setMetaByName("twitter:description", meta.description);
  }, [pathname]);
}
