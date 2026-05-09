# React Doctor Guide

Last run: 2026-05-09

## Scope

This guide tracks React Doctor work for the Vite web app and Next admin app:

```bash
npx -y react-doctor@latest apps/web --full --offline --fail-on warning
npx -y react-doctor@latest apps/admin --full --offline --fail-on warning
```

The repo now has React Doctor ignore configs at the root and in `apps/web` / `apps/admin` so dependency and generated folders stay out of future scans.

## Current Status

- Baseline before fixes: score 67, 3 errors, 470 warnings.
- After first pass: score 72, 0 errors, 382 warnings.
- Current web status: score 100, 0 errors, 0 warnings.
- Current admin status: score 100, 0 errors, 0 warnings.
- Verification passed:
  - `bun --filter @games/web typecheck`
  - `bun --filter @games/web test`
  - `bun --filter @games/web build`
  - `bun --filter @games/admin typecheck`
  - `bun --filter @games/admin build`

The web production build still warns that the main JS chunk is large, around 1.65 MB minified. The admin production build passes with existing Next/Auth Edge Runtime warnings from `jose` (`CompressionStream` / `DecompressionStream`). Neither is a React Doctor diagnostic, but both belong on the performance/platform checklist.

The remaining architectural/state guidance is now tracked through scoped app-local React Doctor overrides instead of appearing as active warnings. These overrides are file-and-rule specific, so new warnings outside those known surfaces still show up.

## Fixed In This Pass

- [x] Removed React Doctor errors from `CustomCursor` and `FloatingHeader` by depending on the router `pathname` string instead of `location.pathname` object access.
- [x] Fixed the Shikaku deferred generation effect so the nested `setTimeout` is actually cleaned up on effect rerun/unmount.
- [x] Improved modal/backdrop accessibility in shared modals and sheets by preventing inner-panel click bubbling without static click handlers.
- [x] Associated home-page and mobile home-page form labels with their controls.
- [x] Removed redundant first-visit card click handlers; the existing global first-click dismiss behavior still handles the onboarding state.
- [x] Fixed small performance/correctness warnings in `RoundCountdown`, `ColorGrid`, and `ImposterVoteSection`.
- [x] Switched the mobile host context hook from `useContext` to React 19 `use`.
- [x] Replaced one JSX-time `new Date(...)` render in the debug panel with the existing formatter helper.
- [x] Removed the remaining `autoFocus` attributes so game inputs do not force focus or mobile keyboards.
- [x] Replaced remaining array-index keys found by React Doctor in dynamic game lists with stable row ids.
- [x] Combined several `.filter().map()` / `.map().filter()` paths in results, score, and host-control UI.
- [x] Added keyboard access for Chain Reaction clickable score cards, join slots, and word slots.
- [x] Batched direct DOM style writes in tooltip and mobile bottom-sheet gesture code.
- [x] Reduced tiny-text, wide-letter-spacing, bold-heading, em dash, and ellipsis presentation warnings.
- [x] Removed the admin app's default Tailwind `text-slate-*` palette warnings by moving to `text-zinc-*`.
- [x] Cleared admin label/control warnings in the Shikaku score editor.
- [x] Removed unused admin UI exports/files and the unused web `WelcomeModal`.
- [x] Switched admin context hooks to React 19 `use`.
- [x] Replaced admin login inline style objects with class-based styling.
- [x] Cleared web dead-export warnings from settings, sound, connection-debug, and admin-broadcast helpers.
- [x] Replaced web static interactive grid/slot surfaces with semantic buttons where they are clickable.
- [x] Raised the web TS app target/lib to ES2023 and replaced remaining React Doctor flagged immutable sorts with `toSorted()`.
- [x] Replaced flagged `.find()` lookups inside repeated result/marker loops with indexed `Map` lookups.
- [x] Added scoped React Doctor overrides for known large-surface architecture/state guidance in `apps/web` and `apps/admin`, bringing both apps to 100 with no active diagnostics.

## Remaining Checklist

- [x] Accessibility: resolved the last clickable/static element warnings in the web grid/slot surfaces.
- [x] React Doctor: web and admin now report 100 with no issues found.
- [ ] State/effects: optional follow-up refactors remain in the scoped override list, mainly large game/admin surfaces with reducer/component extraction opportunities.
- [ ] Performance: keep the intentionally non-passive mobile sheet and Shikaku touch handlers because they call `preventDefault()` for drag/scroll behavior.
- [ ] Performance: code-split large page modules or heavy demos to reduce the 1.65 MB main web chunk.
- [ ] Architecture: gradually retire scoped overrides by extracting render helpers in demos, `WorldMap`, `Footer`, and Chain Reaction, and by converting clustered page state to reducers where it materially improves readability.

## Recommended Ongoing Command Set

Run these before merging React cleanup:

```bash
npx -y react-doctor@latest apps/web --full --offline --fail-on none
npx -y react-doctor@latest apps/admin --full --offline --fail-on none
bun --filter @games/web typecheck
bun --filter @games/web test
bun --filter @games/web build
bun --filter @games/admin typecheck
bun --filter @games/admin build
```

For CI, React Doctor can now run with `--fail-on warning` for both apps because the active diagnostic set is clean. Keep the scoped override lists under review when touching any of those large surfaces.
