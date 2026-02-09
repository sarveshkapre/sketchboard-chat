# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- [ ] P1 Security: Add optional lightweight auth guard for production deployments.
- [ ] P2 UX: When a user is rejected from an invite-only room, show a reconnect UI to paste an invite token (vs silent disconnect).
- [ ] P2 Feature: Invite UX: selectable TTL (5m/15m/1h/24h) + regenerate link button.
- [ ] P2 UX: Make "Copy link" context-aware: for invite-only rooms, prefer copying the last invite (or prompt to create one).
- [ ] P2 Admin: Show `Invite-only` and `Locked` badges in the rooms list, and add quick filters for those states.
- [ ] P2 Reliability: Add inactivity GC for rooms (drop in-memory state after N minutes idle unless `PERSIST=1`).
- [ ] P2 Performance: Reduce full-canvas redraw frequency by drawing incremental strokes to an offscreen buffer and blitting.
- [ ] P2 DX: Add `npm run smoke` (start server, curl `/health`, stop) and use it in CI.
- [ ] P2 Docs: Add a production deployment guide (CORS allowlist, `INVITE_SECRET`, `ADMIN_TOKEN`, reverse proxy hints).
- [ ] P3 Feature: Voice rooms (push-to-talk).

## Implemented
- [x] (2026-02-09) P2 Feature: Added invite-only rooms with expiring, signed invite links (server-validated). Evidence: `server/invite.mjs`, `server/index.mjs`, `src/App.tsx`, `tests/invite.test.ts`, `tests/socket-moderation.test.ts`.
- [x] (2026-02-09) P2 UX: Persisted user profile locally and auto-applied on connect. Evidence: `src/profileStorage.ts`, `src/App.tsx`, `tests/profileStorage.test.ts`.
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
- Market baseline: realtime whiteboards typically ship share links and fine-grained access modes (view/comment/edit), with optional expiring links/passwords for public sharing. Sources: `https://help.miro.com/hc/en-us/articles/360017730893-Invite-people-to-collaborate-on-your-board`, `https://help.miro.com/hc/en-us/articles/360017572454-Share-boards-and-projects`.
- Collaboration baseline: tools like Excalidraw and tldraw emphasize lightweight "share a link to collaborate" flows. Sources: `https://docs.excalidraw.com/docs/@excalidraw/excalidraw/`, `https://tldraw.dev/`.

## Notes
- This file is maintained by the autonomous clone loop.

### Auto-discovered Open Checklist Items (2026-02-08)
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] `npm run check`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Update `CHANGELOG.md`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Tag release: `git tag v0.1.0`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Push tags: `git push --tags`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Publish GitHub release notes
