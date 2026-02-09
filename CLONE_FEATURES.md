# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- [ ] P2 Performance: Reduce full-canvas redraw frequency by drawing committed strokes to an offscreen buffer and blitting.
- [ ] P2 Feature: Image import on canvas (drag/drop + paste), with server-side size caps + validation + opt-in persistence.
- [ ] P2 Feature: Stickers tool (emoji/stamps) that syncs as first-class board elements (not strokes).
- [ ] P3 UX: Mobile/touch drawing polish (palm rejection, better toolbar sizing, scroll/zoom ergonomics).
- [ ] P3 Feature: Voice rooms (push-to-talk).

## Implemented
- [x] (2026-02-09) P1 Performance: Optimize in-progress drawing by rendering only the newest stroke segment on pointermove. Evidence: `src/App.tsx`; `npm run check`.
- [x] (2026-02-09) P1 Security: Refuse to start with `CORS_ORIGIN=*` when `NODE_ENV=production` unless explicitly overridden via `ALLOW_INSECURE_CORS=1`. Evidence: `server/config.mjs`, `server/index.mjs`, `tests/cors-guard.test.ts`, `README.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`; `npm run check`.
- [x] (2026-02-09) P1 Quality: Extend `npm run smoke` to verify Socket.IO room isolation (strokes + chat do not leak across rooms). Evidence: `scripts/smoke.mjs`; `npm run smoke`.
- [x] (2026-02-09) P1 Reliability: Retain empty-room state for a bounded window when `PERSIST` is off (config: `ROOM_IDLE_TTL_MS` + `ROOM_GC_INTERVAL_MS`), then GC to avoid unbounded in-memory growth. Evidence: `server/index.mjs`, `tests/room-idle-gc.test.ts`, `README.md`, `docs/PROJECT.md`.
- [x] (2026-02-09) P2 Admin: Rooms list shows clear `Locked` and `Invite-only` badges, plus quick filters for those states. Evidence: `src/App.tsx`, `src/App.css`.
- [x] (2026-02-09) P2 DX: Added `npm run smoke` and switched CI smoke to use it. Evidence: `scripts/smoke.mjs`, `package.json`, `.github/workflows/ci.yml`.
- [x] (2026-02-09) P1 Security: Added optional socket access guard via `AUTH_TOKEN`, with a client prompt/reconnect flow. Evidence: `server/index.mjs`, `src/authStorage.ts`, `src/App.tsx`, `tests/socket-auth-guard.test.ts`.
- [x] (2026-02-09) P2 UX: When rejected from an invite-only room, show a reconnect UI to paste an invite link/token. Evidence: `src/App.tsx`, `src/App.css`.
- [x] (2026-02-09) P2 Feature: Invite UX improvements: selectable TTL + regenerate/revoke. Evidence: `server/index.mjs`, `server/invite.mjs`, `server/persistence.mjs`, `src/App.tsx`, `tests/invite.test.ts`, `tests/persistence.test.ts`.
- [x] (2026-02-09) P2 UX: Made "Copy link" context-aware for invite-only rooms. Evidence: `src/App.tsx`, `src/room.ts`.
- [x] (2026-02-09) P2 Docs: Added a production deployment guide. Evidence: `docs/DEPLOYMENT.md`, `README.md`.
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
- Invite regen/revoke can be done safely without storing tokens by versioning invites (embed a version in the signed payload and reject mismatches).
- A lightweight deployment guard can be implemented as an optional Socket.IO handshake token (`AUTH_TOKEN`) without changing the HTTP healthcheck.
- Market baseline: realtime whiteboards typically ship share links and fine-grained access modes (view/comment/edit), with optional expiring links/passwords for public sharing. Sources: `https://help.miro.com/hc/en-us/articles/360017730893-Invite-people-to-collaborate-on-your-board`, `https://help.miro.com/hc/en-us/articles/360017572454-Share-boards-and-projects`.
- Collaboration baseline: tools like Excalidraw and tldraw emphasize lightweight "share a link to collaborate" flows. Sources: `https://docs.excalidraw.com/docs/@excalidraw/excalidraw/`, `https://tldraw.dev/`.
- Image import baseline: mainstream whiteboards support drag/drop and paste-from-clipboard images directly onto the canvas, usually with basic resizing and layer controls. Sources: `https://help.miro.com/hc/en-us/articles/360017730773-Upload-files-to-a-board`, `https://help.figma.com/hc/en-us/articles/4404878935693-Add-images-to-FigJam`, `https://tldraw.dev/blog/flip`.
- Stickers/stamps baseline: modern whiteboards include lightweight stamp/sticker tools (often with quick keyboard entry) for low-friction feedback and annotation. Sources: `https://help.figma.com/hc/en-us/articles/360047238133-Use-stamps-in-FigJam`, `https://miro.com/es/help/miro-reactions-and-stickers/`.

## Notes
- This file is maintained by the autonomous clone loop.

### Auto-discovered Open Checklist Items (2026-02-08)
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] `npm run check`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Update `CHANGELOG.md`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Tag release: `git tag v0.1.0`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Push tags: `git push --tags`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Publish GitHub release notes
