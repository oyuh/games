# React Doctor Guide

Last run: 2026-05-08

## Scope

This guide tracks React Doctor work for the Vite web app:

```bash
npx -y react-doctor@latest apps/web --full --offline --fail-on none
```

The repo now has React Doctor ignore configs at the root and in `apps/web` / `apps/admin` so dependency and generated folders stay out of future scans.

## Current Status

- Baseline before fixes: score 67, 3 errors, 470 warnings.
- After first pass: score 72, 0 errors, 382 warnings.
- Current web status: score 82, 0 errors, 162 warnings.
- Admin app spot-check: score 88, 0 errors, 366 warnings.
- Verification passed:
  - `bun --filter @games/web typecheck`
  - `bun --filter @games/web test`
  - `bun --filter @games/web build`

The production build still warns that the main JS chunk is large, around 1.65 MB minified. That is not a correctness failure, but it belongs on the performance checklist.

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

## Remaining Checklist

- [ ] Accessibility: resolve the last 3 clickable/static element warnings. These are mostly conditional-role false positives in grid/slot surfaces; safest fix is extracting semantic child components rather than forcing misleading roles.
- [ ] State/effects: refactor large game pages gradually. React Doctor still flags cascading `setState`, effect chains, `no-derived-state-effect`, `no-effect-event-handler`, and `prefer-useReducer` across Shikaku, Chain Reaction, Password, Location Signal, and mobile pages.
- [ ] State/effects: evaluate `rerender-state-only-in-handlers` warnings carefully. Some are real ref candidates, while others are false positives where the state is read for conditional rendering.
- [ ] Performance: keep the intentionally non-passive mobile sheet `touchmove` handler because it calls `preventDefault()` to stop background scrolling during drag.
- [ ] Performance: consider raising the TS/browser target before replacing `[...array].sort()` with `toSorted()`. The current shared TS target is ES2022.
- [ ] Performance: code-split large page modules or heavy demos to reduce the 1.65 MB main web chunk.
- [ ] Dead code: confirm whether `WelcomeModal` and the unused sound/admin exports are intentionally kept for future use. Delete or document them if not.
- [ ] Admin app: scan `apps/admin` separately after adding an app-local ignore config for `node_modules`, `.next`, and `.turbo`.
- [ ] Admin app: score is already "Great"; handle its remaining warnings as normal cleanup rather than urgent repair.

## Recommended Ongoing Command Set

Run these before merging React cleanup:

```bash
npx -y react-doctor@latest apps/web --full --offline --fail-on none
npx -y react-doctor@latest apps/admin --full --offline --fail-on none
bun --filter @games/web typecheck
bun --filter @games/web test
bun --filter @games/web build
```

For CI, consider adding a non-blocking React Doctor report first. Once the remaining checklist is lower, switch to `--fail-on error` so hard correctness issues block merges without forcing every style warning to be fixed immediately.
