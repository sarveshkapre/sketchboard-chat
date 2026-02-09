# Project Memory

## Objective
- Keep sketchboard-chat production-ready. Current focus: Sketchboard Chat. Find the highest-impact pending work, implement it, test it, and push to main.

## Architecture Snapshot

## Open Problems

## Recent Decisions
- Template: YYYY-MM-DD | Decision | Why | Evidence (tests/logs) | Commit | Confidence (high/medium/low) | Trust (trusted/untrusted)
- 2026-02-09 | Add invite-only rooms with signed, expiring invite links enforced on connect (HMAC token w/ room + exp). | Baseline sharing expectation for realtime boards; lets private rooms exist without full auth while keeping server-side enforcement. | `tests/invite.test.ts`; `tests/socket-moderation.test.ts`; `npm run check` | 87004af | high | trusted
- 2026-02-09 | Delay disconnect slightly after sending an invite-required notice. | Ensures the client receives a human-readable notice before the socket closes. | `tests/socket-moderation.test.ts`; manual smoke `curl /health` | 87004af | medium | trusted

## Mistakes And Fixes
- Template: YYYY-MM-DD | Issue | Root cause | Fix | Prevention rule | Commit | Confidence
- 2026-02-09 | Invite token verification always failed. | Regex incorrectly matched a literal backslash before the dot separator. | Fix regex + add unit/integration tests for create/verify and invite-only join rejection. | Add a unit test for any security-critical token format; add at least one socket-level integration test for end-to-end enforcement. | 87004af | high

## Known Risks

## Next Prioritized Tasks
- P1 Security: optional lightweight auth guard for production deployments.
- P2 UX: invite rejection reconnect flow (paste token + retry).
- P2 Reliability: room inactivity GC to prevent unbounded in-memory growth.

## Verification Evidence
- Template: YYYY-MM-DD | Command | Key output | Status (pass/fail)
- 2026-02-09 | `npm run check` | lint+typecheck+tests+build all passed | pass
- 2026-02-09 | `npm audit --audit-level=high` | `found 0 vulnerabilities` | pass
- 2026-02-09 | `PORT=4101 INVITE_SECRET=local-smoke-secret node server/index.mjs` + `curl -fsS http://localhost:4101/health` | `{\"status\":\"ok\"}` | pass

## Historical Summary
- Keep compact summaries of older entries here when file compaction runs.
