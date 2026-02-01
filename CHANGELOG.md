# Changelog

## [Unreleased]
- Room-based sessions via `?room=...` (isolated board state + presence + chat).
- Hardened server input handling (CORS origin parsing + validation/caps for strokes, chat, and cursors).
- SVG export for vector sketches.
- Basic server-side rate limits for chat/drawing spam.
- Presence/chat UX improvements (cursor deltas, throttled cursor emits, author metadata, chat autoscroll).

## [0.1.0] - 2026-02-01
- Realtime sketchboard with presence, chat, and PNG export.
