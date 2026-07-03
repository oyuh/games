# Security Policy

## Reporting A Vulnerability

Please don't open a public issue for a suspected vulnerability.

Use GitHub private vulnerability reporting if it's enabled for this repo. If it isn't, contact a maintainer privately and include:

- A short description of the issue.
- Steps to reproduce, or a proof of concept.
- The affected route, package, workflow, or deployment service.
- Any logs or screenshots that help verify the impact.

Maintainers will acknowledge valid reports as soon as practical, dig into the issue, and coordinate a fix before any public disclosure when disclosure makes sense.

## Supported Versions

Security fixes target the current default branch and the currently deployed production services. If you're running an older fork or a self-hosted deployment, pull the latest changes and double-check your deployment-specific secrets and configuration.

## Current Security Controls

What the project currently has in place:

- GitHub Actions CI for lint, typecheck, tests, and builds before anything merges or deploys.
- Signed browser session cookies and signed Zero session proofs.
- Server-side checks so one session can't submit multiplayer actions for another session.
- Rate limits on the Zero mutation/query paths, presence, cleanup, maps, game-secret, and admin routes.
- CORS restrictions scoped to the trusted production domains and local development.
- Bearer-secret protection on the admin API, with the admin dashboard gated by GitHub OAuth or a local dev credential.
- Private Bun WebSocket topics for targeted user actions.
- Server-held game secret material for hidden multiplayer game data.
- Server-side replay validation for ranked Shikaku and Pips score submissions.
- Health and build-info endpoints for deployment verification.
- Periodic cleanup of stale games, sessions, chat rows, and orphaned encryption keys.

## Maintainer Checklist

Before merging security-sensitive changes:

- Require the CI quality gate to pass.
- Review any new environment variables and how secrets are handled.
- Don't log tokens, cookies, proofs, IP details, or admin secrets.
- Keep validation for trust boundaries on the server side.
- Keep dependency, Zero cache, and deployment versions aligned.
- Update this file when the security model changes.
