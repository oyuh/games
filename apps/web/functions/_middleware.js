// Social/crawler link previews. Cloudflare's _redirects can't match on
// User-Agent, so a Pages Function does it. Bots get server-rendered embed HTML
// (title, image, meta); real browsers fall through to the SPA.
const BOT =
  /(bot|crawler|spider|preview|facebookexternalhit|Facebot|Twitterbot|Discordbot|Slackbot|LinkedInBot|WhatsApp|TelegramBot|SkypeUriPreview|vkShare|Embedly|redditbot|Pinterest|ia_archiver)/i;

const EMBED_ORIGIN = "https://api.games.lawsonhart.me";

export async function onRequest({ request, next }) {
  const ua = request.headers.get("user-agent") || "";
  const url = new URL(request.url);

  // Assets are real files; never hand them to the embed renderer.
  if (BOT.test(ua) && !url.pathname.startsWith("/assets/")) {
    const target = `${EMBED_ORIGIN}/api/embed/html?path=${encodeURIComponent(url.pathname)}`;
    return fetch(target, { headers: request.headers });
  }

  return next();
}
