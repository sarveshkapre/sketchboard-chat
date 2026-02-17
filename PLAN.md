# Sketchboard Chat

One‑line pitch: a realtime, multiplayer sketchboard with chat + presence for quick demos and lightweight collaboration.

## Features (current)
- Shared drawing canvas (Socket.IO)
- Live cursors + active user list
- Group chat
- Room-based sessions via `?room=...`
- Export canvas to PNG and SVG
- Undo/redo for your own strokes (synced)
- Optional disk persistence (`PERSIST=1`)
- Optional persistence cleanup controls (`PERSIST_MAX_ROOMS`, `PERSIST_TTL_DAYS`)
- Recent rooms list (localStorage)
- View-only mode via `?mode=view`
- Admin room metrics endpoint (`GET /api/rooms`)
- Rooms panel UI (uses `/api/rooms`)
- Kick users from a room (admin token required)
- Rooms panel UX polish (filter + auto refresh)
- Room lock/unlock (admin)
- User profile updates (name + color)
- Room roles (owner/mod) with in-room moderation
- Stable user identity for role persistence (local key)
- Room activity log for moderation changes
- Chat reactions and pinned messages
- Chat search, copy, unread indicator, and jump-to-latest
- Keyboard shortcuts + in-app shortcuts modal
- Persisted drawing preferences (tool/color/size)
- Random room generator and admin room sorting controls

## Top risks / unknowns
- In‑memory state (strokes/messages) can still grow under abuse; needs continued caps + room isolation.
- No auth; only basic rate limiting. Production deployments should add protections and tighten `CORS_ORIGIN`.
- Canvas resize + high‑DPI rendering needs careful scaling to avoid blur or drift.

## Commands
See `docs/PROJECT.md` for the canonical command list and environment variables.

## What shipped last
- Room-based sessions via `?room=...` (isolated board state + presence + chat per room).
- Server-side input validation + caps for strokes, chat, and cursor updates.
- SVG export download for vector sketches.
- Basic server-side rate limiting for spam resistance.
- Clean, shareable room URLs via `/r/<room>`.
- Optional disk persistence for rooms (`PERSIST=1`).
- Optional persistence cleanup controls (`PERSIST_MAX_ROOMS`, `PERSIST_TTL_DAYS`).
- Undo/redo for your own strokes (synced).
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
- Chat search, copy, unread indicator, and jump-to-latest.
- Keyboard shortcuts + in-app shortcuts modal.
- Persisted drawing preferences (tool/color/size).
- Random room generator and admin room sorting controls.
- Presence and chat UX polish (cursor throttling, message author metadata, chat autoscroll).

## What should ship next
- P1 UX: zoom/pan with stable board coordinates.
- P1 Feature: first-class text tool (move/edit).
- P1 Feature: sticker/emoji tool as board elements.
