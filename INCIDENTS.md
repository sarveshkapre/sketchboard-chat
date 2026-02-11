# Incidents And Learnings

## Entry Schema
- Date
- Trigger
- Impact
- Root Cause
- Fix
- Prevention Rule
- Evidence
- Commit
- Confidence

## Entries
- Date: 2026-02-11
- Trigger: Aggregate room image-byte cap test did not trigger rejection during implementation.
- Impact: `ROOM_MAX_IMAGE_BYTES` policy floor was too high for small-room tuning and boundary-value validation.
- Root Cause: Minimum clamp for `ROOM_MAX_IMAGE_BYTES` was initially set at `250000`, masking expected behavior in low-cap scenarios.
- Fix: Reduced minimum clamp to `1000` and added socket integration coverage validating second-image rejection at cap.
- Prevention Rule: For every new limit env var, add at least one boundary-value integration test that proves rejection just above the configured limit.
- Evidence: `npm run check` (pass), `tests/socket-images.test.ts` cap case (pass).
- Commit: 7a27e58
- Confidence: high

- Date: 2026-02-09
- Trigger: `tests/invite.test.ts` and `tests/socket-moderation.test.ts` failures while validating invite-only rooms.
- Impact: Invite links would never validate, so invite-only rooms would reject all non-owner/mod joins.
- Root Cause: Token parsing regex incorrectly expected a literal backslash before the `.` separator.
- Fix: Correct regex and add unit + socket integration coverage.
- Prevention Rule: Any new auth/token format must ship with a unit test for accept/reject cases plus one end-to-end socket test.
- Evidence: `npm run check` (pass).
- Commit: 87004af
- Confidence: high
