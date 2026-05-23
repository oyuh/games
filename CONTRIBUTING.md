# Contributing

Thanks for wanting to contribute. This repo is intentionally open for useful fixes, new games, docs, and self-hosting improvements, as long as contributions respect the license and the people working here.

## Ground Rules

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
- Keep pull requests focused. Small, reviewable changes are much easier to merge.
- Do not submit code you do not have the right to license to this project.
- By contributing, you agree that your contribution can be used under this repository's license.

## Local Setup

Install dependencies from the repository root:

```bash
bun install
```

Start the local stack:

```bash
# Windows
bun run local:up

# macOS
bun run local:up:mac

# Linux
bun run local:up:linux
```

Useful local URLs:

- Web app: `http://localhost:5173`
- API: `http://localhost:3001`
- Admin app: `http://localhost:3002`
- Zero cache: `http://localhost:4848`

## Before Opening A Pull Request

Run the same checks CI runs:

```bash
bun run lint
bun run typecheck
bun run test:ci
bun run build
```

If you touch game state, database schema, Zero mutators, admin tools, or deployment config, include notes in the PR about how you tested the change.

## Pull Request Checklist

- Explain what changed and why.
- Link related issues when available.
- Include screenshots or recordings for UI changes.
- Update docs when behavior, setup, security posture, or deployment steps change.
- Call out migrations, environment variables, or operational risks.

## New Game Checklist

New multiplayer games usually need updates in:

- `packages/shared/src/drizzle/schema.ts`
- `packages/shared/src/zero/schema.ts`
- `packages/shared/src/zero/queries.ts`
- `packages/shared/src/zero/mutators/`
- `packages/shared/src/types/game.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/`
- `apps/web/src/mobile/pages/`
- `docs/`

Solo games should include deterministic engine tests and server-side score validation if scores or leaderboards are involved.
