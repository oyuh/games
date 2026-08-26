const THEME_BOOTSTRAP = `
(() => {
  const storageKey = "games-admin-theme";
  let stored = null;

  try {
    stored = window.localStorage?.getItem(storageKey);
  } catch {}

  try {
    // The site is dark-first, so an admin who has never chosen falls to dark
    // unless their OS explicitly asks for light.
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const theme = stored === "dark" || stored === "light"
      ? stored
      : prefersLight
        ? "light"
        : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

export function ThemeBootstrapScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />;
}
