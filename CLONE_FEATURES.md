# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- [ ] P1 Feature: Add a dedicated room settings drawer (lock, invite, role controls in one place) to reduce panel clutter.
- [ ] P1 Feature: Add limited-duration invite links with server-side validation for private room sharing.
- [ ] P1 Security: Add optional lightweight auth guard for production deployments.
- [ ] P1 Quality: Add API/integration tests for socket moderation flows (`room:lock`, `room:kick`, `role:set`).
- [ ] P2 DX: Add an automated smoke workflow that boots the built server and curls `/health` in CI.

## Implemented
- [x] (2026-02-08) P1 Feature: Grouped stroke action undo/redo using stroke `batchId` metadata. Evidence: `src/App.tsx`, `server/stroke-history.mjs`, `server/validation.mjs`.
- [x] (2026-02-08) P1 Quality: Added grouped history and stroke batch sanitization tests. Evidence: `tests/stroke-history.test.ts`, `tests/server-validation.test.ts`.
- [x] (2026-02-08) P0 Reliability: Fixed production startup crash on Express 5 wildcard fallback route. Evidence: `server/index.mjs`.
- [x] (2026-02-08) P2 CI: Hardened checkout depth to improve gitleaks stability. Evidence: `.github/workflows/ci.yml`.
- [x] (2026-02-08) P1 Verification: Full gate + runtime smoke completed. Evidence: `npm run check`; `npm run start`; `curl http://localhost:4000/health`; `curl http://localhost:4000/api/rooms`.
- [x] (2026-02-08) P1 Docs: Synced behavior and memory docs. Evidence: `CHANGELOG.md`, `UPDATE.md`, `README.md`, `docs/ROADMAP.md`, `docs/PROJECT.md`, `PLAN.md`.

## Insights
- Express 5 rejects legacy `app.get('*')` patterns; use `/{*path}` for SPA fallback routing.
- Undo/redo UX improves notably when actions are batched by short drawing bursts instead of single-stroke granularity.
- Stabilizing CI secret scanning requires reliable git history availability in runners.

## Notes
- This file is maintained by the autonomous clone loop.

### Auto-discovered Open Checklist Items (2026-02-08)
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] `npm run check`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Update `CHANGELOG.md`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Tag release: `git tag v0.1.0`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Push tags: `git push --tags`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Publish GitHub release notes
