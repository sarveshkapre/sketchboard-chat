# ROADMAP

## Near-term
- Chat reactions and message pinning.

## Done
- Room-based sessions.
- SVG export.
- Basic server-side rate limits.
- Clean room URLs (`/r/<room>`).
- Optional disk persistence (`PERSIST=1`).
- Optional persistence cleanup controls (`PERSIST_MAX_ROOMS`, `PERSIST_TTL_DAYS`).
- Undo/redo (per-user).
- Recent rooms list (local).
- View-only mode (`?mode=view`).
- Admin room metrics endpoint (`GET /api/rooms`).
- Rooms panel UI (uses `/api/rooms`).
- Kick users from a room (admin token required).
- Room lock/unlock (admin).
- User profile updates (name + color).

## Later
- Image import + stickers.
- Voice rooms.
- Lightweight persistence.
