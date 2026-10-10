// Social/crawler link previews. Cloudflare's _redirects can't match on
// User-Agent, so a Pages Function does it. Bots get server-rendered embed HTML
// (title, image, meta); real browsers fall through to the SPA.
//
// It also fronts the solo share pages for everyone: /share/<game> is the
// API's /api/<game>/puzzle, so share links stay on games.lawsonhart.me.
const BOT =
  /(bot|crawler|spider|preview|facebookexternalhit|Facebot|Twitterbot|Discordbot|Slackbot|LinkedInBot|WhatsApp|TelegramBot|SkypeUriPreview|vkShare|Embedly|redditbot|Pinterest|ia_archiver)/i;

const EMBED_ORIGIN = "https://api.games.lawsonhart.me";

// /share/zip, /share/zip.png, /share/zip.svg, /share/zip.svg/download
const SHARE = /^\/share\/(shikaku|pips|zip)((?:\.png|\.svg(?:\/download)?)?)$/;

export async function onRequest({ request, next }) {
  const ua = request.headers.get("user-agent") || "";
  const url = new URL(request.url);

  const share = url.pathname.match(SHARE);
  if (share) {
    const headers = new Headers(request.headers);
    // The API builds the page's links on this origin, and rate limits on the
    // first forwarded address.
    headers.set("x-share-origin", url.origin);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) headers.set("x-forwarded-for", ip);
    const target = `${EMBED_ORIGIN}/api/${share[1]}/puzzle${share[2]}${url.search}`;
    // Manual so ?play=1's redirect into the game reaches the browser.
    return fetch(target, { headers, redirect: "manual" });
  }

  // Assets are real files; never hand them to the embed renderer.
  if (BOT.test(ua) && !url.pathname.startsWith("/assets/")) {
    const target = `${EMBED_ORIGIN}/api/embed/html?path=${encodeURIComponent(url.pathname)}`;
    return fetch(target, { headers: request.headers });
  }

  return next();
}
