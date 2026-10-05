import { useState, type ReactNode } from "react";
import {
  FiArrowRight,
  FiCheck,
  FiChevronDown,
  FiCopy,
  FiGrid,
  FiList,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiSettings,
  FiTrash2,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import { Button, ButtonGroup, Loader, type ButtonSize, type ButtonVariant } from "../components/shared/Button";
import { Slider, Switch, SwitchRow } from "../components/shared/Switch";
import "../styles/game-shared.css";

/**
 * The shared components, every variant in every state, on one page. Same idea
 * as /dev/zip: settle the look here before anything on the site uses it.
 * The stage carries its own theme and accent so both can be flipped without
 * touching the site's settings.
 */

const VARIANTS: { variant: ButtonVariant; label: string; note: string }[] = [
  { variant: "primary", label: "Start game", note: "the one you are meant to press" },
  { variant: "secondary", label: "Invite", note: "the everyday button, and the default" },
  { variant: "outline", label: "Spectate", note: "a step down from secondary" },
  { variant: "ghost", label: "Settings", note: "no edge until you reach it" },
  { variant: "danger", label: "End game", note: "for what you cannot take back" },
  { variant: "danger-secondary", label: "Leave", note: "danger that does not shout" },
  { variant: "text", label: "Skip", note: "bare words, underline on hover" },
  { variant: "link", label: "How to play", note: "bare words in the accent" },
];

const SIZES: ButtonSize[] = ["xs", "sm", "md", "lg"];

const ACCENTS = ["site", "imposter", "password", "chain", "shade", "location", "shikaku", "pips", "zip"] as const;
type Accent = (typeof ACCENTS)[number];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="game-section">
      <h3 className="game-section-label">{title}</h3>
      {note && <p className="game-section-subtle">{note}</p>}
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>{children}</div>;
}

/** A labeled grid: one row per variant, one column per whatever is being compared. */
function Grid({ columns, rows }: { columns: string[]; rows: { label: string; cells: ReactNode[] }[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: "0.75rem 0.6rem", margin: "-0.6rem 0" }}>
        <thead>
          <tr>
            <th />
            {columns.map((c, i) => (
              <th key={i} className="game-section-subtle" style={{ textAlign: "left", fontWeight: 600 }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th className="game-section-subtle" style={{ textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{row.label}</th>
              {row.cells.map((cell, i) => <td key={i}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Presses for real: loads for a moment, then lands. */
/** Kumo's switch in the site's colors, every state, and the slider built from it. */
function Switches() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [row, setRow] = useState(false);
  const [volume, setVolume] = useState(40);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", maxWidth: "22rem" }}>
      <Row>
        <Switch label="On" checked={a} onChange={setA} />
        <Switch label="Off" checked={b} onChange={setB} />
        <Switch label="Small on" size="sm" checked={a} onChange={setA} />
        <Switch label="Small off" size="sm" checked={b} onChange={setB} />
        <Switch label="Unavailable on" checked disabled onChange={() => {}} />
        <Switch label="Unavailable off" checked={false} disabled onChange={() => {}} />
      </Row>
      <SwitchRow label="Custom placement" checked={row} onChange={setRow} />
      <Slider aria-label="Volume" value={volume} onChange={setVolume} />
      <Slider aria-label="Low" value={8} onChange={() => {}} />
      <Slider aria-label="Unavailable" value={60} disabled onChange={() => {}} />
    </div>
  );
}

function LiveLoading({ variant, icon, label }: { variant: ButtonVariant; icon?: ReactNode; label: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant={variant}
      icon={icon}
      loading={loading}
      onClick={() => {
        setLoading(true);
        setTimeout(() => setLoading(false), 1800);
      }}
    >
      {label}
    </Button>
  );
}

const GAMES: { theme: Exclude<Accent, "site">; name: string }[] = [
  { theme: "imposter", name: "Imposter" },
  { theme: "password", name: "Password" },
  { theme: "chain", name: "Chain Reaction" },
  { theme: "shade", name: "Shade Signal" },
  { theme: "location", name: "Location Signal" },
  { theme: "shikaku", name: "Shikaku" },
  { theme: "pips", name: "Pips" },
  { theme: "zip", name: "Zip" },
];

/**
 * One game's buttons the way its lobby would hold them: a .game-page box with
 * the game's accent and background, so the sizes and colors are the real ones.
 */
function GameSample({ theme, name }: { theme: string; name: string }) {
  const [ready, setReady] = useState(false);
  return (
    <div
      className="game-page"
      data-game-theme={theme}
      style={{
        gap: "0.9rem",
        margin: 0,
        padding: "1.1rem 1.2rem",
        background: "var(--game-bg)",
        border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
        borderRadius: "var(--radius-xl)",
      }}
    >
      <h4 className="game-section-label" style={{ color: "var(--primary)" }}>{name}</h4>
      <Row>
        <Button variant="primary" icon={<FiPlay />}>Start game</Button>
        <Button icon={<FiUserPlus />}>Invite</Button>
        <Button variant="ghost" shape="square" aria-label="Settings" icon={<FiSettings />} />
      </Row>
      <Row>
        <Button variant="outline" icon={<FiCheck />} aria-pressed={ready} onClick={() => setReady((r) => !r)}>
          {ready ? "Ready" : "Not ready"}
        </Button>
        <LiveLoading variant="primary" icon={<FiCheck />} label="Lock in" />
        <Button variant="danger-secondary" size="sm">Leave</Button>
        <Button variant="link" size="sm">Rules</Button>
      </Row>
      <Row>
        <Button variant="primary" disabled>Waiting for host</Button>
        <Button variant="secondary" loading>Joining</Button>
      </Row>
    </div>
  );
}

export function SharedKitPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [accent, setAccent] = useState<Accent>("site");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [round, setRound] = useState("3");

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto", maxWidth: "60rem" }}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Shared</h1>
          <p className="game-section-subtle">The shared buttons, every variant in every state.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <ButtonGroup label="Theme">
            {(["dark", "light"] as const).map((t) => (
              <Button key={t} size="sm" aria-pressed={theme === t} onClick={() => setTheme(t)}>
                {t === "dark" ? "Dark" : "Light"}
              </Button>
            ))}
          </ButtonGroup>
          <select
            className="input"
            aria-label="Accent"
            value={accent}
            onChange={(e) => setAccent(e.target.value as Accent)}
            style={{ width: "auto", padding: "0.35rem 0.6rem" }}
          >
            {ACCENTS.map((a) => <option key={a} value={a}>{a === "site" ? "Site accent" : a}</option>)}
          </select>
        </div>
      </header>

      {/* Theme goes on the outer box and the accent on the inner one, the same
          nesting as the real site, so a game accent wins over the light theme's. */}
      <div data-theme={theme} style={{ borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
        <div
          data-game-theme={accent === "site" ? undefined : accent}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2.25rem",
            padding: "1.75rem 1.5rem",
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
          }}
        >
          <Section title="Across the games" note="each one in its game's accent and background, at game page size. ready toggles, lock in loads">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 20rem), 1fr))", gap: "1rem" }}>
              {GAMES.map((g) => <GameSample key={g.theme} {...g} />)}
            </div>
          </Section>

          <Section title="Switch and slider" note="kumo's switch: a squircle with a ring, the thumb a full-height block that slides its own width. the slider is the same switch stretched, filling to the thumb. both follow the accent picker above">
            <Switches />
          </Section>

          <Section title="Variants" note="hover and press each one. secondary is what you get when you pass nothing">
            <Grid
              columns={["", ""]}
              rows={VARIANTS.map(({ variant, label, note }) => ({
                label: variant,
                cells: [
                  <Button variant={variant}>{label}</Button>,
                  <span className="game-section-subtle">{note}</span>,
                ],
              }))}
            />
          </Section>

          <Section title="Sizes" note="xs and sm get a 44px hit area on touchscreens. lg is 44px on its own">
            <Grid
              columns={SIZES}
              rows={VARIANTS.map(({ variant, label }) => ({
                label: variant,
                cells: SIZES.map((size) => <Button variant={variant} size={size}>{label}</Button>),
              }))}
            />
          </Section>

          <Section title="States" note="unavailable loses its depth before it fades, so it reads as out of reach. loading keeps the button's look and width">
            <Grid
              columns={["rest", "toggled on", "loading", "loading, with icon", "unavailable"]}
              rows={VARIANTS.map(({ variant, label }) => ({
                label: variant,
                cells: [
                  <Button variant={variant}>{label}</Button>,
                  ["secondary", "outline", "ghost"].includes(variant)
                    ? <Button variant={variant} aria-pressed>{label}</Button>
                    : <span className="game-section-subtle">n/a</span>,
                  <Button variant={variant} loading>{label}</Button>,
                  <Button variant={variant} icon={<FiPlay />} loading>{label}</Button>,
                  <Button variant={variant} disabled>{label}</Button>,
                ],
              }))}
            />
          </Section>

          <Section title="The loader" note="three bars rising in turn. sized in em, so it matches the text next to it. with reduced motion on it only pulses">
            <Row>
              <span style={{ fontSize: "0.8rem" }}><Loader /></span>
              <span style={{ fontSize: "1rem" }}><Loader /></span>
              <span style={{ fontSize: "1.5rem", color: "var(--primary)" }}><Loader /></span>
              <span style={{ fontSize: "2.25rem", color: "var(--muted-foreground)" }}><Loader /></span>
            </Row>
          </Section>

          <Section title="Loading for real" note="press one. it loads for under two seconds and comes back">
            <Row>
              <LiveLoading variant="primary" label="Create lobby" />
              <LiveLoading variant="primary" icon={<FiPlay />} label="Start game" />
              <LiveLoading variant="secondary" icon={<FiRefreshCw />} label="New board" />
              <LiveLoading variant="outline" label="Save" />
              <LiveLoading variant="danger" icon={<FiTrash2 />} label="Delete" />
              <LiveLoading variant="link" label="Resend code" />
            </Row>
          </Section>

          <Section title="With icons" note="leading icon, trailing icon, or both">
            <Row>
              <Button variant="primary" icon={<FiPlus />}>New game</Button>
              <Button icon={<FiCopy />}>Copy code</Button>
              <Button variant="outline" trailing={<FiChevronDown />}>Round 3</Button>
              <Button variant="ghost" icon={<FiSettings />}>Settings</Button>
              <Button variant="danger" icon={<FiTrash2 />}>Delete</Button>
              <Button variant="link" trailing={<FiArrowRight />}>Leaderboard</Button>
            </Row>
          </Section>

          <Section title="Icon only" note="square and circle. each one needs an aria-label">
            <Grid
              columns={SIZES}
              rows={(["primary", "secondary", "outline", "ghost", "danger"] as const).flatMap((variant) =>
                (["square", "circle"] as const).map((shape) => ({
                  label: `${variant} ${shape}`,
                  cells: SIZES.map((size) => (
                    <Button
                      variant={variant}
                      size={size}
                      shape={shape}
                      aria-label={variant === "danger" ? "Remove" : "Settings"}
                      icon={variant === "danger" ? <FiX /> : <FiSettings />}
                    />
                  )),
                }))
              )}
            />
          </Section>

          <Section title="Groups" note="buttons joined into one control. the picked one gets aria-pressed">
            <Row>
              <ButtonGroup label="View">
                <Button aria-pressed={view === "grid"} icon={<FiGrid />} onClick={() => setView("grid")}>Grid</Button>
                <Button aria-pressed={view === "list"} icon={<FiList />} onClick={() => setView("list")}>List</Button>
              </ButtonGroup>
              <ButtonGroup label="Rounds">
                {["1", "3", "5", "7"].map((r) => (
                  <Button key={r} variant="outline" aria-pressed={round === r} onClick={() => setRound(r)}>{r}</Button>
                ))}
              </ButtonGroup>
              <ButtonGroup label="Copy">
                <Button icon={<FiCopy />}>Copy link</Button>
                <Button shape="square" aria-label="More copy options" icon={<FiChevronDown />} />
              </ButtonGroup>
            </Row>
          </Section>

          <Section title="In a pair" note="how they sit together in a modal footer or a card">
            <Row>
              <Button variant="text">Cancel</Button>
              <Button variant="primary" icon={<FiCheck />}>Confirm</Button>
            </Row>
            <Row>
              <Button variant="outline">Keep playing</Button>
              <Button variant="danger">End game</Button>
            </Row>
          </Section>

          <Section title="Full width">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "22rem" }}>
              <Button variant="primary" size="lg" full>Join game</Button>
              <Button size="lg" full>Play solo</Button>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
