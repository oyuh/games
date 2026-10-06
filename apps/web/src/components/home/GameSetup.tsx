import {
  IMPOSTER_CLUE_VISIBILITY_OPTIONS,
  chainCategories,
  chainCategoryLabels,
  imposterCategories,
  imposterCategoryLabels,
  passwordCategories,
  passwordCategoryLabels,
} from "@games/shared";
import { FiBookOpen } from "react-icons/fi";
import type { useHomePage } from "../../hooks/useHomePage";
import type { HomeRouteGame } from "../../lib/home-route-highlight";
import { Select } from "../shared/Select";
import { Segmented, type SoloSetupOption } from "../shared/SoloGameMenu";

export type HomeState = ReturnType<typeof useHomePage>;

export function formatClueVisibility(value: number) {
  if (value <= 0) return "No hints";
  if (value >= 1) return "Full clues";
  return `${Math.round(value * 100)}% shown`;
}

/* ── Create-game settings, in the single-player menu's language ──
   The same segmented pickers Pips and Shikaku use, in the card's own
   accent. Anything with a handful of choices is a picker; Category has
   two dozen, so it stays a select dressed as one of the same controls.
   Desktop cards and the mobile create sheet both render these, so a
   setting added here shows up on both. */

/** Builds a picker's segments. `title` is the hover and screen-reader name,
 *  `label` the couple of characters that have to fit in a 320px card. */
function pickerOptions<T extends string | number>(
  values: readonly T[],
  title: (value: T) => string,
  label: (value: T) => string = String,
): SoloSetupOption[] {
  return values.map((value) => ({
    value: String(value),
    label: label(value),
    title: title(value),
    accent: "var(--card-accent)",
  }));
}

function CardPicker({ label, hint, value, options, onChange }: {
  label: string;
  /** The tooltip that used to hang off the select's label. */
  hint: string;
  value: string | number;
  options: SoloSetupOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="hc-setup-field">
      <span className="hc-config-label" data-tooltip={hint} data-tooltip-variant="info">{label}</span>
      <Segmented row={{ label, value: String(value), options, onChange }} />
    </div>
  );
}

function CardCategory({ id, hint, value, categories, labels, onChange }: {
  id: string;
  hint: string;
  value: string;
  categories: readonly string[];
  labels: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="hc-setup-field">
      <label htmlFor={id} className="hc-config-label" data-tooltip={hint} data-tooltip-variant="info">Category</label>
      <Select
        id={id}
        label="Category"
        value={value}
        onChange={onChange}
        icon={<FiBookOpen size={14} aria-hidden="true" />}
        options={categories.map((key) => ({ value: key, label: labels[key] ?? key }))}
      />
    </div>
  );
}

export function GameSetup({ game, home }: { game: HomeRouteGame; home: HomeState }) {
  if (game === "imposter") {
    return (
      <div className="hc-setup">
        <CardCategory
          id="home-imposter-category"
          hint="The theme for the word list. Everyone gets a word from this category - except the imposter."
          value={home.imposterCategory}
          categories={imposterCategories as string[]}
          labels={imposterCategoryLabels}
          onChange={home.setImposterCategory}
        />
        <CardPicker
          label="Imposters"
          hint="How many players are secretly the imposter each round. More imposters = harder for the group."
          value={home.imposterImposters}
          onChange={(v) => home.setImposterImposters(Number(v))}
          options={pickerOptions([1, 2, 3], (n) => `${n} imposter${n === 1 ? "" : "s"}`)}
        />
        <CardPicker
          label="Rounds"
          hint="How many rounds to play. Each round, a new imposter is chosen and everyone votes."
          value={home.imposterRounds}
          onChange={(v) => home.setImposterRounds(Number(v))}
          options={pickerOptions([1, 2, 3, 5, 7, 10], (n) => `${n} round${n === 1 ? "" : "s"}`)}
        />
        <CardPicker
          label="Hint visibility"
          hint="How much of submitted clues the imposter can peek at before sending their clue."
          value={home.imposterClueVisibility}
          onChange={(v) => home.setImposterClueVisibility(Number(v))}
          options={pickerOptions(
            IMPOSTER_CLUE_VISIBILITY_OPTIONS,
            formatClueVisibility,
            (v) => (v <= 0 ? "None" : v >= 1 ? "All" : `${Math.round(v * 100)}%`),
          )}
        />
      </div>
    );
  }

  if (game === "password") {
    return (
      <div className="hc-setup">
        <CardCategory
          id="home-password-category"
          hint="The theme for the word list. Words will be drawn from this category."
          value={home.passwordCategory}
          categories={passwordCategories as string[]}
          labels={passwordCategoryLabels}
          onChange={home.setPasswordCategory}
        />
        <CardPicker
          label="Teams"
          hint="Split players into this many teams. Teams take turns giving and guessing clues."
          value={home.passwordTeams}
          onChange={(v) => home.setPasswordTeams(Number(v))}
          options={pickerOptions([2, 3, 4, 5, 6], (n) => `${n} teams`)}
        />
        <CardPicker
          label="Target score"
          hint="The score a team needs to win. Higher = longer game."
          value={home.passwordTargetScore}
          onChange={(v) => home.setPasswordTargetScore(Number(v))}
          options={pickerOptions([3, 5, 7, 10, 15, 20], (n) => `First to ${n} points`)}
        />
      </div>
    );
  }

  if (game === "chain") {
    return (
      <div className="hc-setup">
        <CardCategory
          id="home-chain-category"
          hint="The theme for the word chains. Chains will be drawn from this category."
          value={home.chainCategory}
          categories={chainCategories as string[]}
          labels={chainCategoryLabels}
          onChange={home.setChainCategory}
        />
        <CardPicker
          label="Length"
          hint="How many words in the chain. Each word links to the next - longer chains are harder!"
          value={home.chainLength}
          onChange={(v) => home.setChainLength(Number(v))}
          options={pickerOptions([5, 6, 7, 8, 9, 10], (n) => `${n} words`)}
        />
        <CardPicker
          label="Rounds"
          hint="How many chains to play. Each round is a fresh chain for both players."
          value={home.chainRounds}
          onChange={(v) => home.setChainRounds(Number(v))}
          options={pickerOptions([1, 2, 3, 5, 7], (n) => `${n} round${n === 1 ? "" : "s"}`)}
        />
        <CardPicker
          label="Mode"
          hint="Random uses pre-made chains. Custom lets both players write their own chain for the other to solve."
          value={home.chainMode}
          onChange={(v) => home.setChainMode(v as "premade" | "custom")}
          options={pickerOptions(
            ["premade", "custom"] as const,
            (mode) => (mode === "premade" ? "Random, from a premade chain" : "Custom, write your own chain"),
            (mode) => (mode === "premade" ? "Random" : "Custom"),
          )}
        />
      </div>
    );
  }

  if (game === "shade") {
    return (
      <div className="hc-setup">
        <CardPicker
          label="Game Length"
          hint="Each player takes a turn as Leader. This controls how many turns each person gets, so more = longer game."
          value={home.shadeRoundsPerPlayer}
          onChange={(v) => home.setShadeRoundsPerPlayer(Number(v))}
          options={pickerOptions(
            [1, 2, 3],
            (n) => `${n} turn${n === 1 ? "" : "s"} as Leader each`,
            (n) => (n === 1 ? "Quick" : n === 2 ? "Standard" : "Long"),
          )}
        />
        <CardPicker
          label="Clue Rules"
          hint={'Controls what the Leader can say in their clue. "No Colors" bans words like red, blue, green, etc.'}
          value={home.shadeHardMode ? "yes" : "no"}
          onChange={(v) => home.setShadeHardMode(v === "yes")}
          options={pickerOptions(
            ["no", "yes"] as const,
            (v) => (v === "no" ? "Any clue goes" : "Color names are banned"),
            (v) => (v === "no" ? "Normal" : "No Colors"),
          )}
        />
        <CardPicker
          label="Leader Color"
          hint="Whether the Leader gets to choose the color everyone is hunting for, or is handed a random one."
          value={home.shadeLeaderPick ? "yes" : "no"}
          onChange={(v) => home.setShadeLeaderPick(v === "yes")}
          options={pickerOptions(
            ["no", "yes"] as const,
            (v) => (v === "no" ? "The game picks the color" : "The Leader picks their own color"),
            (v) => (v === "no" ? "Random" : "Leader picks"),
          )}
        />
      </div>
    );
  }

  return (
    <div className="hc-setup">
      <CardPicker
        label="Clue Pairs"
        hint="How many clue + guess pairs per round. More pairs means the leader gives more hints and guessers refine their answer."
        value={home.locCluePairs}
        onChange={(v) => home.setLocCluePairs(Number(v))}
        options={pickerOptions([1, 2, 3, 4], (n) => `${n} clue and guess pair${n === 1 ? "" : "s"}`)}
      />
      <CardPicker
        label="Rounds/Player"
        hint="How many rounds each player leads. More rounds means a longer session."
        value={home.locRoundsPerPlayer}
        onChange={(v) => home.setLocRoundsPerPlayer(Number(v))}
        options={pickerOptions([1, 2, 3], (n) => `${n} round${n === 1 ? "" : "s"} each`)}
      />
    </div>
  );
}
