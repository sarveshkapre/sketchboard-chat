# ROADMAP

## Near-term
- Optional lightweight auth guard for production deployments.
- Invite UX: selectable invite TTL + regenerate/revoke flow.
- Image import + stickers.

## Done
- Room settings drawer (lock, invite, roles).
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
- Room roles (owner/mod) with in-room moderation.
- Room activity log for moderation changes.
- Chat reactions and pinned messages.
- Stroke action batching for grouped undo/redo.
- Optional invite-only rooms with expiring invite links.

## Later
- Voice rooms.
- Lightweight persistence.
