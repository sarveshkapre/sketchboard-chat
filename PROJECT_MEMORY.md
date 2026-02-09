# Project Memory

## Objective
- Keep sketchboard-chat production-ready. Current focus: Sketchboard Chat. Find the highest-impact pending work, implement it, test it, and push to main.

## Architecture Snapshot

## Open Problems

## Recent Decisions
- Template: YYYY-MM-DD | Decision | Why | Evidence (tests/logs) | Commit | Confidence (high/medium/low) | Trust (trusted/untrusted)
- 2026-02-09 | Add synced board images (image:add/update/remove) with server-side raster-only validation, rate limits, and persistence. | Image import is a baseline whiteboard expectation; server-side caps/validation are required to keep memory/disk bounded and avoid SVG/script injection. | `tests/socket-images.test.ts`; `tests/server-validation.test.ts`; `tests/persistence.test.ts`; `npm run check` | 7b31252 | high | trusted
- 2026-02-09 | Add client image import (paste/drag/drop/file picker) plus Select tool (move/delete) and SVG export embedding images. | Improves PMF for sketchboard chat by enabling annotation over screenshots/mockups; Select tool keeps interactions predictable without interfering with drawing. | `npm run check` | 6471fd8 | high | trusted
- 2026-02-09 | Composite rendering via offscreen layers (background/images + committed strokes). | Reduces redraw work and makes image moves/resizes feasible without re-stroking all paths each frame. | `npm run check` | 6471fd8 | medium | trusted
- 2026-02-09 | Render only the newest stroke segment while drawing (pointermove) instead of re-stroking the full in-progress path. | Reduces CPU work on long strokes and improves perceived latency during drawing. | `npm run check` | d1dc425 | high | trusted
- 2026-02-09 | Refuse to start with `CORS_ORIGIN=*` when `NODE_ENV=production` unless `ALLOW_INSECURE_CORS=1` is explicitly set. | Production guardrail against accidental public cross-origin access; keeps a deliberate escape hatch. | `tests/cors-guard.test.ts`; `npm run check` | a51b6fe | high | trusted
- 2026-02-09 | Extend `npm run smoke` to verify Socket.IO room isolation (strokes + chat) using `socket.io-client`. | Prevents regressions where events leak across rooms; provides a deterministic runnable smoke beyond `/health`. | `npm run smoke` | 1963976 | high | trusted
- 2026-02-09 | Add invite-only rooms with signed, expiring invite links enforced on connect (HMAC token w/ room + exp). | Baseline sharing expectation for realtime boards; lets private rooms exist without full auth while keeping server-side enforcement. | `tests/invite.test.ts`; `tests/socket-moderation.test.ts`; `npm run check` | 87004af | high | trusted
- 2026-02-09 | Delay disconnect slightly after sending an invite-required notice. | Ensures the client receives a human-readable notice before the socket closes. | `tests/socket-moderation.test.ts`; manual smoke `curl /health` | 87004af | medium | trusted
- 2026-02-09 | Add optional Socket.IO auth guard via `AUTH_TOKEN`, with a client prompt + reconnect flow. | Provides a lightweight production deployment gate without changing room URLs or adding full user accounts. | `tests/socket-auth-guard.test.ts`; `npm run check` | 1ec79c9 | high | trusted
- 2026-02-09 | Make invite links revocable by versioning signed invite tokens; add regenerate/revoke UX. | Enables safe link rotation (old invites invalid immediately) and parity with baseline "regenerate link" expectations. | `tests/invite.test.ts`; `tests/persistence.test.ts`; `npm run check` | 1ec79c9 | high | trusted
- 2026-02-09 | Add `npm run smoke` and use it in CI. | Keeps local and CI healthchecks consistent and reduces fragile inline bash in workflows. | `npm run smoke`; GitHub Actions run `CI` | a041cd4 | high | trusted
- 2026-02-09 | Retain empty rooms for a bounded TTL when persistence is off (evict via periodic GC), but evict immediately when `PERSIST=1`. | Prevents accidental board/chat loss on quick reconnects while keeping memory bounded in long-running servers. | `tests/room-idle-gc.test.ts`; `npm run check` | 61a57e0 | high | trusted
- 2026-02-09 | Add admin rooms list badges and quick filters for `Locked` + `Invite-only`. | Makes moderation triage faster and improves parity with baseline whiteboard admin UX. | `npm run check` | 2cf6326 | high | trusted

## Mistakes And Fixes
- Template: YYYY-MM-DD | Issue | Root cause | Fix | Prevention rule | Commit | Confidence
- 2026-02-09 | Invite token verification always failed. | Regex incorrectly matched a literal backslash before the dot separator. | Fix regex + add unit/integration tests for create/verify and invite-only join rejection. | Add a unit test for any security-critical token format; add at least one socket-level integration test for end-to-end enforcement. | 87004af | high

## Known Risks

## Next Prioritized Tasks
- P2 Feature: stickers tool (emoji/stamps) as first-class board elements.
- P2 UX: basic zoom/pan with stable cursor coordinates.
- P3 Reliability: server-side cap for total bytes of persisted room state.
- P3 UX: mobile/touch drawing polish (palm rejection, toolbar sizing, scroll/zoom ergonomics).

## Verification Evidence
- Template: YYYY-MM-DD | Command | Key output | Status (pass/fail)
- 2026-02-09 | `npm run check` | lint+typecheck+tests+build all passed | pass
- 2026-02-09 | `npm audit --audit-level=high` | `found 0 vulnerabilities` | pass
- 2026-02-09 | `PORT=4101 INVITE_SECRET=local-smoke-secret node server/index.mjs` + `curl -fsS http://localhost:4101/health` | `{\"status\":\"ok\"}` | pass
- 2026-02-09 | `npm run smoke` | `{\"status\":\"ok\"}` | pass
- 2026-02-09 | `npm run check` | 45 tests passed; build succeeded | pass
- 2026-02-09 | `npm run check` | 46 tests passed; build succeeded | pass
- 2026-02-09 | `npm run smoke` | `{\"status\":\"ok\"}` | pass
- 2026-02-09 | `npm test` | 49 tests passed | pass
- 2026-02-09 | `npm run check` | lint+typecheck+tests+build all passed (49 tests) | pass
- 2026-02-09 | `npm run smoke` | `/health` ok + room isolation ok | pass
- 2026-02-09 | `npm run check` | 52 tests passed; build succeeded | pass
- 2026-02-09 | `npm run smoke` | `{\"status\":\"ok\"}` | pass

## Historical Summary
- Keep compact summaries of older entries here when file compaction runs.
