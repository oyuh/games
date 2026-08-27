# Contributing

Thanks for wanting to pitch in. This repo is intentionally open to useful fixes, new games, docs, and self-hosting improvements, as long as contributions respect the license and the people working here.

## Ground Rules

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
- Keep pull requests focused. Small, reviewable changes get merged; sprawling ones sit.
- Don't submit code you don't have the right to license to this project.
- By contributing, you agree your contribution can be used under this repo's license.

## Local Setup

Install dependencies from the repo root:

```bash
bun install
```

Start the local stack (same command on macOS, Linux and Windows):

```bash
bun run local:up
```

It starts your container engine if it is not running, brings up Postgres and
zero-cache, pushes the schema, and runs the three dev servers. While it is up:

```bash
bun run local status            # what is running
bun run local restart admin     # restart one service
bun run local logs api -f       # follow one log
bun run local:down              # stop everything
```

`bun run local doctor` checks your machine if any of that fails.

Useful local URLs:

- Web app: `http://localhost:5173`
- API: `http://localhost:3001`
- Admin app: `http://localhost:3002`
- Zero cache: `http://localhost:4848`

## Before Opening A Pull Request

Run the same checks CI runs, so you're not surprised by a red X:

```bash
bun run lint
bun run typecheck
bun run test:ci
bun run build
```

If you touch game state, database schema, Zero mutators, admin tools, or deployment config, say in the PR how you tested it.

## Pull Request Checklist

- Explain what changed and why.
- Link related issues when there are any.
- Include screenshots or recordings for UI changes.
- Update the docs when behavior, setup, security posture, or deployment steps change.
- Call out migrations, new environment variables, or anything operationally risky.

## New Game Checklist

New multiplayer games usually mean touching all of these:

- `packages/shared/src/drizzle/schema.ts`
- `packages/shared/src/zero/schema.ts`
- `packages/shared/src/zero/queries.ts`
- `packages/shared/src/zero/mutators/`
- `packages/shared/src/types/game.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/`
- `apps/web/src/mobile/pages/`
- `docs/`

Solo games should come with deterministic engine tests, plus server-side score validation if scores or leaderboards are involved.
