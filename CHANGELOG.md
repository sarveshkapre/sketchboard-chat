# Changelog

## [Unreleased]
- Room-based sessions via `?room=...` (isolated board state + presence + chat).
- Clean room URLs via `/r/<room>` (shareable links).
- Hardened server input handling (CORS origin parsing + validation/caps for strokes, chat, and cursors).
- SVG export for vector sketches.
- Basic server-side rate limits for chat/drawing spam.
- Optional disk persistence for rooms (`PERSIST=1`).
- Optional persistence cleanup controls (`PERSIST_MAX_ROOMS`, `PERSIST_TTL_DAYS`).
- Undo/redo for your own strokes (synced to everyone).
- Recent rooms list (localStorage).
- View-only mode via `?mode=view`.
- Admin room metrics endpoint (`GET /api/rooms`).
- Rooms panel UI (uses `/api/rooms`).
- Kick users from a room (admin token required).
- Rooms panel UX polish (filter + auto refresh).
- Room lock/unlock (admin).
- User profile updates (name + color).
- Room roles (owner/mod) with in-room moderation.
- Stable user identity for role persistence (local key).
- Room activity log for moderation changes.
- Chat reactions and pinned messages.
- Presence/chat UX improvements (cursor deltas, throttled cursor emits, author metadata, chat autoscroll).
- Grouped stroke undo/redo actions via stroke `batchId` (quick consecutive strokes from one user undo/redo together).
- Optional invite-only rooms with expiring invite links (requires `INVITE_SECRET`).
- Room settings drawer consolidating join/share/moderation controls.
- Persisted user profile (name + color) locally and auto-applied on connect.
- Fixed production startup crash on Express 5 by switching the SPA fallback route to `/{*path}`.
- CI hardening: `actions/checkout` now uses `fetch-depth: 0` in the build job for stable secret scan history.
- CI: upgraded CodeQL Action to v4 and added a built-server `/health` smoke step.
- Quality: added socket integration tests for moderation flows (lock/kick/roles/invites).

## [0.1.0] - 2026-02-01
- Realtime sketchboard with presence, chat, and PNG export.
