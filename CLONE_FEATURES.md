# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- [ ] P2 UX: Persist user profile (name + color) locally and auto-apply it on connect (so refreshes don't randomize identity).
- [ ] P2 Feature: Add limited-duration invite links with server-side validation for private room sharing.
- [ ] P2 Security: Add optional lightweight auth guard for production deployments.

## Implemented
- [x] (2026-02-09) P1 Feature: Added dedicated room settings drawer consolidating join/share/moderation and reduced sidebar/toolbar clutter. Evidence: `src/App.tsx`, `src/App.css`.
- [x] (2026-02-09) P1 Quality: Added socket integration tests for moderation flows (`room:lock`, `room:kick`, `role:set`). Evidence: `tests/socket-moderation.test.ts`, `server/index.mjs`.
- [x] (2026-02-09) P1 DX: Added CI smoke step that boots the server and curls `/health`. Evidence: `.github/workflows/ci.yml`.
- [x] (2026-02-09) P1 CI: Upgraded `github/codeql-action` from `v3` to `v4`. Evidence: `.github/workflows/ci.yml`.
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
- CodeQL Action `v4` is the supported baseline going forward (v3 is deprecated).

## Notes
- This file is maintained by the autonomous clone loop.

### Auto-discovered Open Checklist Items (2026-02-08)
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] `npm run check`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Update `CHANGELOG.md`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Tag release: `git tag v0.1.0`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Push tags: `git push --tags`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Publish GitHub release notes
