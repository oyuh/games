# Security policy

## Reporting a vulnerability

Please don't open a public issue for a suspected vulnerability.

Use GitHub private vulnerability reporting if this repo has it turned on. If not, contact a maintainer privately and include:

- A short description of the issue.
- Steps to reproduce, or a proof of concept.
- The affected route, package, workflow, or deployment service.
- Any logs or screenshots that show the impact.

Maintainers will acknowledge valid reports as soon as they can, investigate, and coordinate a fix before any public disclosure.

## Supported versions

Security fixes target the default branch and the production services. If you run an older fork or a self-hosted copy, pull the latest changes and recheck your secrets and deployment config.

## Current security controls

- GitHub Actions CI runs lint, typecheck, unit tests, e2e tests, and builds before anything merges or deploys.
- Signed browser session cookies and signed Zero session proofs.
- Server-side checks so one session can't submit multiplayer actions for another.
- `demo.*` and `dev.*` mutators rejected in production.
- Rate limits on the Zero mutation and query paths, session sync, cleanup, maps, game-secret, score, and admin routes.
- CORS limited to the production domains and local development.
- A bearer secret on the admin API, with the admin dashboard behind GitHub OAuth or a local dev credential.
- Private WebSocket topics for targeted user actions.
- Server-held keys for hidden multiplayer game data.
- Server-side replay validation for ranked Shikaku and Pips scores.
- Health and build-info endpoints for checking deployments.
- Scheduled cleanup of stale games, sessions, chat rows, and orphaned encryption keys.

## Maintainer checklist

Before merging a security-sensitive change:

- Require the CI quality gate to pass.
- Review new environment variables and how secrets are handled.
- Don't log tokens, cookies, proofs, IP details, or admin secrets.
- Keep trust-boundary validation on the server.
- Keep dependency, Zero cache, and deployment versions aligned.
- Update this file when the security model changes.
