# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- [ ] P1 UX: Basic zoom/pan (trackpad wheel-zoom + pan tool) with stable board coordinates. Score: impact 5, effort 3, strategic fit 5, differentiation 3, risk 3, confidence 3.
- [ ] P1 Feature: Text tool (create/edit/move short labels) as first-class board elements. Score: impact 5, effort 4, strategic fit 5, differentiation 4, risk 3, confidence 3.
- [ ] P1 Feature: Stickers tool (emoji/stamps) as first-class board elements. Score: impact 4, effort 3, strategic fit 4, differentiation 4, risk 2, confidence 4.
- [ ] P2 UX: Mobile/touch drawing polish (toolbar sizing, gesture ergonomics, palm rejection). Score: impact 4, effort 3, strategic fit 4, differentiation 3, risk 3, confidence 3.
- [ ] P2 Reliability: Persisted-state aggregate image-byte cap parity with in-memory room cap. Score: impact 4, effort 2, strategic fit 5, differentiation 2, risk 2, confidence 4.
- [ ] P2 Security: Restrict `connect-src` CSP to configured server origin(s) for tighter production posture. Score: impact 3, effort 2, strategic fit 4, differentiation 1, risk 2, confidence 4.
- [ ] P2 Observability: Add `GET /api/rooms/:roomId` detail endpoint (top talkers, recent audit, bytes breakdown). Score: impact 4, effort 3, strategic fit 4, differentiation 2, risk 2, confidence 3.
- [ ] P2 UX: Add explicit room-capacity indicator (images used/bytes used) near Image action. Score: impact 3, effort 2, strategic fit 4, differentiation 2, risk 1, confidence 4.
- [ ] P2 Quality: Playwright smoke for two-user draw/chat/image isolation and moderation lock path. Score: impact 4, effort 3, strategic fit 4, differentiation 1, risk 2, confidence 4.
- [ ] P2 Performance: Incremental cursor/presence rendering to avoid full user-list state churn on high-frequency cursor updates. Score: impact 3, effort 3, strategic fit 3, differentiation 2, risk 2, confidence 3.
- [ ] P3 Feature: Read-only invite links that cannot escalate to edit mode without moderator action. Score: impact 3, effort 3, strategic fit 4, differentiation 2, risk 2, confidence 3.
- [ ] P3 Reliability: Server-side autosave snapshot integrity checker + startup warning for corrupted room files. Score: impact 3, effort 2, strategic fit 3, differentiation 1, risk 2, confidence 3.
- [ ] P3 Security: Optional signed admin API nonce to reduce bearer token replay window. Score: impact 2, effort 4, strategic fit 3, differentiation 2, risk 3, confidence 2.
- [ ] P3 DX: Add load-test script for room fanout throughput (strokes/chat/image events). Score: impact 3, effort 3, strategic fit 3, differentiation 1, risk 2, confidence 3.
- [ ] P3 Feature: Voice rooms (push-to-talk). Score: impact 2, effort 5, strategic fit 2, differentiation 4, risk 4, confidence 2.

## Implemented
- [x] (2026-02-11) P1 Reliability: Added aggregate per-room image-byte cap (`ROOM_MAX_IMAGE_BYTES`) and enforced it at `image:add` with deterministic rejection notice; hydration now normalizes persisted images to room/image byte limits. Evidence: `server/index.mjs`, `tests/socket-images.test.ts`; `npm test -- tests/socket-images.test.ts`.
- [x] (2026-02-11) P1 Observability: Extended room metrics with `imagesBytes` and `stateBytesEstimate`, and surfaced these values in the admin rooms UI. Evidence: `server/rooms-metrics.mjs`, `src/adminRooms.ts`, `src/App.tsx`, `tests/rooms-metrics.test.ts`, `tests/utils.test.ts`; `npm test -- tests/rooms-metrics.test.ts tests/utils.test.ts`.
- [x] (2026-02-11) P1 Security: Added production default CSP response header with optional `CSP_HEADER` override and regression test coverage. Evidence: `server/index.mjs`, `tests/csp-header.test.ts`, `README.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`; `npm test -- tests/csp-header.test.ts`.
- [x] (2026-02-10) P1 Reliability: Cap per-room persisted state file size via `PERSIST_MAX_BYTES`; oversized snapshots are trimmed deterministically before writing to disk. Evidence: `server/persistence.mjs`, `server/index.mjs`, `tests/persistence.test.ts`, `README.md`, `docs/PROJECT.md`, `docs/DEPLOYMENT.md`; `npm run check`, `npm run smoke`.
- [x] (2026-02-09) P1 Feature: Image import (paste/drag/drop/file picker), synced per room with server-side validation/caps and persistence support (SVG export embeds images; admin rooms list shows image counts). Evidence: `server/index.mjs`, `server/validation.mjs`, `server/persistence.mjs`, `server/rooms-metrics.mjs`, `src/App.tsx`, `src/svg.ts`, `src/adminRooms.ts`, `tests/socket-images.test.ts`, `tests/server-validation.test.ts`, `tests/persistence.test.ts`, `tests/rooms-metrics.test.ts`, `tests/svg.test.ts`; `npm run check`.
- [x] (2026-02-09) P1 UX: Select tool to move/delete imported images (includes keyboard delete/backspace). Evidence: `src/App.tsx`; `npm run check`.
- [x] (2026-02-09) P2 Performance: Offscreen layers for committed strokes + background/images; compositing avoids full redraws during normal drawing. Evidence: `src/App.tsx`; `npm run check`.
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
- Navigation baseline: whiteboards typically support trackpad pinch-to-zoom and two-finger pan; many also support spacebar-held "hand tool" panning and mousewheel zoom. Sources: `https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam`, `https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen`.
- Market scan (2026-02-11): Excalidraw emphasizes low-friction collaboration with text/images and infinite canvas, reinforcing zoom/pan + text tool as highest PMF gaps for this repo. Sources: `https://docs.excalidraw.com/docs/introduction/features`, `https://plus.excalidraw.com/blog/excalidraw-plus-whiteboard`.
- Market scan (2026-02-11): tldraw’s camera API examples highlight robust viewport controls as baseline editor infrastructure, supporting a near-term camera/zoom implementation priority. Source: `https://tldraw.dev/examples/editor-api/camera/follow-camera`.
- Reliability insight: per-image size caps alone are insufficient; aggregate room byte caps are needed to bound memory under many small/medium uploads.

## Notes
- This file is maintained by the autonomous clone loop.

### Auto-discovered Open Checklist Items (2026-02-08)
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] `npm run check`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Update `CHANGELOG.md`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Tag release: `git tag v0.1.0`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Push tags: `git push --tags`
- /Users/sarvesh/code/sketchboard-chat/docs/RELEASE.md:- [ ] Publish GitHub release notes
