# Sketchboard Chat

One‑line pitch: a realtime, multiplayer sketchboard with chat + presence for quick demos and lightweight collaboration.

## Features (current)
- Shared drawing canvas (Socket.IO)
- Live cursors + active user list
- Group chat
- Export canvas to PNG

## Top risks / unknowns
- In‑memory state (strokes/messages) can still grow under abuse; needs continued caps + room isolation.
- No auth/rate limits; production deployments should add protections and tighten `CORS_ORIGIN`.
- Canvas resize + high‑DPI rendering needs careful scaling to avoid blur or drift.

## Commands
See `docs/PROJECT.md` for the canonical command list and environment variables.

## What shipped last
- Room-based sessions via `?room=...` (isolated board state + presence + chat per room).
- Server-side input validation + caps for strokes, chat, and cursor updates.
- SVG export download for vector sketches.
- Presence and chat UX polish (cursor throttling, message author metadata, chat autoscroll).

## What should ship next
- SVG export for vector sketches.
- Lightweight persistence (disk or SQLite) behind a flag.
- Undo/redo + stroke grouping.
