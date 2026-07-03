## What does this PR do?

<!-- Quick description of the change -->

## Game affected

- [ ] Imposter
- [ ] Password
- [ ] Chain Reaction
- [ ] Shade Signal
- [ ] Location Signal
- [ ] Shikaku
- [ ] Pips
- [ ] New game (name: _____________)
- [ ] Platform / shared
- [ ] None (infra, docs, etc.)

## Type of change

- [ ] New game
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Docs / config
- [ ] Other:

## Checklist

- [ ] TypeScript compiles (`bun typecheck`)
- [ ] Tested locally in the browser
- [ ] Schema changes pushed (if applicable)
- [ ] No new console errors or warnings
- [ ] Docs updated (if adding a new game)
- [ ] Mobile UI tested (if touching `apps/web/src/mobile/`)
- [ ] Desktop UI unaffected (if touching shared components)

## New game checklist (if applicable)

- [ ] Schema added to `packages/shared/src/drizzle/schema.ts`
- [ ] Zero schema added to `packages/shared/src/zero/schema.ts`
- [ ] Queries added to `packages/shared/src/zero/queries.ts`
- [ ] Mutators added under `packages/shared/src/zero/mutators/`
- [ ] Game types added to `packages/shared/src/types/game.ts`
- [ ] Page component(s) created in `apps/web/src/pages/`
- [ ] Route(s) added to `apps/web/src/App.tsx`
- [ ] Info modal section added for the new route
- [ ] Welcome modal game card added
- [ ] Home page game card added
- [ ] Mobile home page game card added
- [ ] Mobile game page created in `apps/web/src/mobile/pages/`
- [ ] Game doc added to `docs/`

## Screenshots / recordings

<!-- If there are UI changes, drop in screenshots or a screen recording -->

## Additional notes

<!-- Anything reviewers should know -->
