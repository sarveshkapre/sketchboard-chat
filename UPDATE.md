# Update (2026-02-03)

## Shipped
- Room-based sessions via `?room=...` (separate boards per room).
- Clean room URLs via `/r/<room>` (shareable links).
- Server-side validation/caps for realtime events and safer `CORS_ORIGIN` parsing.
- SVG export (downloads vector strokes).
- Basic server-side rate limiting for chat/draw/clear spam.
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
- Presence/chat polish (cursor deltas + throttling, chat author metadata, chat autoscroll).

## Verified
- `npm run check`

## Manual smoke
- `npm run dev`
- Open `http://localhost:5173/r/team-1` in two tabs and verify isolation from `http://localhost:5173/r/team-2`.
- Restart the server with `PERSIST=1` and confirm room state restores.

## Repo workflow
- Changes are committed directly to `main` (no PRs).
