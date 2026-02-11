# Project Memory

## Objective
- Keep sketchboard-chat production-ready. Current focus: Sketchboard Chat. Find the highest-impact pending work, implement it, test it, and push to main.

## Architecture Snapshot

## Open Problems

## Recent Decisions
- Template: YYYY-MM-DD | Decision | Why | Evidence (tests/logs) | Commit | Confidence (high/medium/low) | Trust (trusted/untrusted)
- 2026-02-11 | Enforce aggregate room image bytes (`ROOM_MAX_IMAGE_BYTES`) in-memory and normalize hydrated room images to byte limits. | Per-image caps alone do not bound total room memory under many uploads; aggregate enforcement is needed to keep memory predictable. | `tests/socket-images.test.ts`; `npm run check`; `npm run smoke` | 7a27e58 | high | trusted
- 2026-02-11 | Extend room metrics/admin UI with `imagesBytes` and `stateBytesEstimate`. | Operators need byte-level triage signals to identify abusive rooms quickly and decide when to intervene. | `tests/rooms-metrics.test.ts`; `tests/utils.test.ts`; `npm run check` | 7a27e58 | high | trusted
- 2026-02-11 | Add default production CSP header with optional override (`CSP_HEADER`). | Baseline browser hardening reduces injection blast radius and is expected in production deployments. | `tests/csp-header.test.ts`; `npm run check`; GitHub Actions run `21897025725` | 7a27e58 | high | trusted
- 2026-02-11 | Prioritize zoom/pan and first-class text/stickers as next PMF work after reliability hardening. | Bounded market scan shows these are baseline whiteboard expectations and highest user-visible capability gaps. | `CLONE_FEATURES.md`; `https://docs.excalidraw.com/docs/introduction/features`; `https://tldraw.dev/examples/editor-api/camera/follow-camera`; `https://plus.excalidraw.com/blog/excalidraw-plus-whiteboard` | 7a27e58 | medium | untrusted
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
- 2026-02-10 | Add `PERSIST_MAX_BYTES` cap and deterministic trimming for per-room persisted snapshots. | Prevents oversized room files (especially from embedded base64 images) and reduces disk abuse risk when `PERSIST=1`, while keeping persistence on by default. | `tests/persistence.test.ts`; `npm run check`; `npm run smoke` | 3831c66 | high | trusted

## Mistakes And Fixes
- Template: YYYY-MM-DD | Issue | Root cause | Fix | Prevention rule | Commit | Confidence
- 2026-02-11 | Initial room byte-cap config floor blocked small-limit validation and made policy less tunable. | `ROOM_MAX_IMAGE_BYTES` minimum clamp was set too high for realistic small-room configs/testing. | Lowered minimum clamp and added socket integration coverage for aggregate room byte limit rejection. | Any new limit env var should ship with at least one boundary-value integration test (`below/at/above`) before merge. | 7a27e58 | high
- 2026-02-09 | Invite token verification always failed. | Regex incorrectly matched a literal backslash before the dot separator. | Fix regex + add unit/integration tests for create/verify and invite-only join rejection. | Add a unit test for any security-critical token format; add at least one socket-level integration test for end-to-end enforcement. | 87004af | high

## Known Risks

## Next Prioritized Tasks
- P1 UX: basic zoom/pan with stable board coordinates and predictable cursor/pointer behavior.
- P1 Feature: text tool (create/edit/move short labels) as first-class elements.
- P1 Feature: stickers tool (emoji/stamps) as first-class elements.
- P2 UX: mobile/touch drawing polish (toolbar sizing, gesture ergonomics, palm rejection).

## Verification Evidence
- Template: YYYY-MM-DD | Command | Key output | Status (pass/fail)
- 2026-02-11 | `npm test -- tests/socket-images.test.ts tests/csp-header.test.ts tests/rooms-metrics.test.ts tests/utils.test.ts` | 8 tests passed | pass
- 2026-02-11 | `npm run check` | lint+typecheck+tests+build all passed (56 tests) | pass
- 2026-02-11 | `npm run smoke` | `{\"status\":\"ok\"}` | pass
- 2026-02-11 | `gh run watch 21897025725 --exit-status` | `build` + `codeql` jobs passed | pass
- 2026-02-10 | `npm run check` | lint+typecheck+tests+build all passed (53 tests) | pass
- 2026-02-10 | `npm run smoke` | `{\"status\":\"ok\"}` | pass
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
