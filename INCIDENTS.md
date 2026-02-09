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
- Date: 2026-02-09
- Trigger: `tests/invite.test.ts` and `tests/socket-moderation.test.ts` failures while validating invite-only rooms.
- Impact: Invite links would never validate, so invite-only rooms would reject all non-owner/mod joins.
- Root Cause: Token parsing regex incorrectly expected a literal backslash before the `.` separator.
- Fix: Correct regex and add unit + socket integration coverage.
- Prevention Rule: Any new auth/token format must ship with a unit test for accept/reject cases plus one end-to-end socket test.
- Evidence: `npm run check` (pass).
- Commit: 87004af
- Confidence: high
