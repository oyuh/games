# Security Policy

## Reporting A Vulnerability

Please do not open a public issue for suspected vulnerabilities.

Use GitHub private vulnerability reporting if it is enabled for this repository. If it is not enabled, contact a maintainer privately and include:

- A short description of the issue.
- Steps to reproduce or a proof of concept.
- The affected route, package, workflow, or deployment service.
- Any logs or screenshots that help verify impact.

Maintainers will acknowledge valid reports as soon as practical, investigate the issue, and coordinate a fix before public disclosure when disclosure is appropriate.

## Supported Versions

Security fixes target the current default branch and the currently deployed production services. Older forks or self-hosted deployments should pull the latest changes and review deployment-specific secrets and configuration.

## Current Security Controls

This project currently uses:

- GitHub Actions CI for lint, typecheck, tests, and builds before changes are merged or deployed.
- Signed browser session cookies and signed Zero session proofs.
- Server-side checks that prevent one session from submitting multiplayer actions for another session.
- Rate limits on Zero mutation/query paths, presence, cleanup, maps, game-secret, and admin routes.
- CORS restrictions for trusted production domains and local development.
- Admin API bearer-secret protection, with the admin dashboard gated by GitHub OAuth or a local development credential.
- Private Bun WebSocket topics for targeted user actions.
- Server-held game secret material for hidden multiplayer game data.
- Server-side replay validation for ranked Shikaku and Pips score submissions.
- Health and build-info endpoints for deployment verification.
- Periodic cleanup of stale games, sessions, chat rows, and orphaned encryption keys.

## Maintainer Checklist

Before merging security-sensitive changes:

- Require the CI quality gate to pass.
- Review new environment variables and secret handling.
- Avoid logging tokens, cookies, proofs, IP details, or admin secrets.
- Prefer server-side validation for trust boundaries.
- Keep dependency, Zero cache, and deployment versions aligned.
- Update this file when the security model changes.
