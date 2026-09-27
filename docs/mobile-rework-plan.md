# Mobile rework plan (temp)

Goal: every screen under 768px should feel like loife. The game logic stays put. We rewrite the `Mobile*` render layer and `mobile/mobile.css`.

Reference: `../loife` (github.com/oyuh/loife), mainly `src/components/app-shell.tsx`, `src/components/ui/drawer.tsx`, `src/components/swipe-row.tsx`, `src/styles.css`, and the phone shots in `docs/screenshots/`.

## What loife does that we copy

1. **Page head.** Big left-aligned title, one line of state under it (colored only when it matters, like "2 overdue"), and at most one primary button top right. No centered micro-labels with icons.
2. **Section labels.** Uppercase, muted, left-aligned, with a count or one control on the right ("THIS WEEK ‹ Aug 30 – Sep 5 ›"). No rules, no icons.
3. **Flat surfaces.** Card on background, 1px translucent border (`oklch(1 0 0 / 10%)`), one radius, no shadow, no blur, no gradient, no texture. Only the current or selected thing gets a lighter fill.
4. **Rows, not cards.** Lists are rows: leading control (checkbox, avatar, color bar), title, one muted meta line, one trailing control. On touch, swipe left for actions. Everywhere else, a three-dot menu.
5. **Bottom tab bar.** Four equal tabs. The active one is a filled pill with full-contrast text, the rest muted. `bg-card/95` with a top border. One `--bottom-inset` token clears the home indicator, and `main` pads by the same token.
6. **Detail sheets.** Vaul drawer with a handle, left-aligned title and meta line, a full-width primary button with a secondary button beside it, labeled fields below, and the destructive action last as plain red text.
7. **One primary button per screen.** Everything else is outlined or plain text.
8. **Pinned composer.** The "Log what happened" bar sits above the tab bar. That's the model for clue, guess, and chat input in games.
9. **Horizontal strips** for small multiples (the week strip) instead of wrapping grids.
10. **Touch basics.** 44px targets, nothing that only works on hover, native inputs, no drawn scrollbars, reduced-motion turns animation off.

## Where we are now

- 16 files: about 5,300 lines of TSX plus a 3,930-line `mobile.css`.
- Slop in `mobile.css`: 10 `backdrop-filter` blurs, 16 `box-shadow`s, 11 `@keyframes`, 5 gradients.
- The grid texture on every card comes from `styles/components.css:102` (`--surface-grid` repeating gradients), so mobile inherits it from desktop.
- Home: tinted gradient game cards that expand in place, a chip row on every card, centered icon labels ("JOIN GAME", "DISPLAY"), all-caps "CLICK TO PLAY" buttons.
- Bug found in passing: opening the Info sheet leaves both Home and Info marked active in the tab bar.
- Structure: each multiplayer game is a desktop page plus a `Mobile*Page` fork. Both read the same hooks (`useImposterGame` and friends), so the fork is render code only. `BottomSheet` already uses vaul.

## Decisions (answered 2026-09-26)

1. **Keep the `Mobile*` forks.** But each mobile piece should stay close to the desktop component it forks: same parts, same house style (the solo menu look), just laid out for a phone.
2. **Keep our colors.** loife gives the structure, not the palette or font.
3. **Tabs stay Home, Info, Options** (plus Actions in a game). Change them per game only where a game needs it, like a solo toolbar.
4. **No mobile e2e project.** The desktop suite is enough.
5. **Plain CSS**, no Tailwind or shadcn.

## Phases

Each phase is one PR.

**1. Shell and home.** Turn off the grid texture, blur, and shadows under 768px. The shared mobile pieces (page head, section label, row) get built here as home needs them, not ahead of time. Tab bar active-state fix. Home becomes a "Games" head with the join field inline. Create-game becomes a list of rows, each opening a create sheet instead of expanding a tinted card. Solo games and recent games become rows, and recent games get swipe to remove.

**2. Sheets.** Info, Options, Leaderboard, Host controls, and Chat move to the new sheet layout.

**3. Games, one PR each, by traffic.** Imposter, Password (begin, game, results), Chain Reaction, Shade Signal, Location Signal. Each one gets a lobby with player rows and one Start button, a round screen with the pinned composer, and a results screen with rows and one Play again.

**4. Solo.** Pips and Shikaku already use the house style. Only check that they fit the tab bar, the inset, and the page head.

**5. Cleanup.** Delete orphaned rules from `mobile.css` (target: under 1,500 lines) and any animation left over.

## Checks on every PR

- Before and after screenshots at 390x844 and 375x667 in the PR description.
- That game's e2e spec passes.
- 4.5:1 contrast in both themes.
- No new `box-shadow`, `backdrop-filter`, gradient, or `@keyframes` in mobile CSS.

## Out of scope

Desktop layouts, game logic and mutators, and the Pips and Shikaku boards themselves.
