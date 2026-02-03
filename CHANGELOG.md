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
- Presence/chat UX improvements (cursor deltas, throttled cursor emits, author metadata, chat autoscroll).

## [0.1.0] - 2026-02-01
- Realtime sketchboard with presence, chat, and PNG export.
