# Contributing

Thanks for wanting to pitch in. Fixes, new games, docs, and self-hosting improvements are all welcome, as long as they respect the license and the people working here.

## Ground rules

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security issues through [SECURITY.md](SECURITY.md), not a public issue.
- Keep pull requests focused. Small, reviewable changes get merged. Sprawling ones sit.
- Only submit code you have the right to license to this project.
- By contributing, you agree your contribution can be used under this repo's license.

## Local setup

Install dependencies from the repo root:

```bash
bun install
```

Start the local stack (same command on macOS, Linux, and Windows):

```bash
bun run local:up
```

It starts your container engine if it isn't running, brings up Postgres and zero-cache, pushes the schema, and runs the three dev servers. While it's up:

```bash
bun run local status            # what is running
bun run local restart admin     # restart one service
bun run local logs api -f       # follow one log
bun run local:down              # stop everything
```

If any of that fails, `bun run local doctor` checks your machine.

Local URLs:

- Web app: `http://localhost:5173`
- API: `http://localhost:3001`
- Admin app: `http://localhost:3002`
- Zero cache: `http://localhost:4848`

## Before opening a pull request

Run the checks CI runs, so a red X doesn't surprise you:

```bash
bun run lint
bun run typecheck
bun run test:ci
bun run build
```

CI also runs the Playwright suite. If you touched gameplay, run it locally with `bun run test:e2e`.

If you touch game state, the database schema, Zero mutators, admin tools, or deployment config, say in the PR how you tested it.

## Pull request checklist

- Explain what changed and why.
- Link related issues.
- Add screenshots or recordings for UI changes.
- Update the docs when behavior, setup, security, or deployment steps change.
- Call out schema changes, new environment variables, or anything risky to deploy.

## New game checklist

A new multiplayer game usually touches all of these:

- `packages/shared/src/drizzle/schema.ts`
- `packages/shared/src/zero/schema.ts`
- `packages/shared/src/zero/queries.ts`
- `packages/shared/src/zero/mutators/`
- `packages/shared/src/types/game.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/`
- `apps/web/src/mobile/pages/`
- `e2e/`
- `docs/`

Solo games need deterministic engine tests, plus server-side score validation if they have a leaderboard.
