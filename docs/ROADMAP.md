# ROADMAP

## Near-term
- Stickers tool (emoji/stamps) as first-class board elements.
- Basic zoom/pan (trackpad + touch).

## Done
- Added per-room aggregate image byte cap (`ROOM_MAX_IMAGE_BYTES`) to bound in-memory image growth.
- Added room state byte estimates (`imagesBytes`, `stateBytesEstimate`) to admin room metrics/UI.
- Added default production CSP response header (override via `CSP_HEADER`).
- Image import (paste/drag/drop/file picker) with a select tool to move/delete images.
- Optional lightweight auth guard for production deployments.
- Invite UX: selectable invite TTL + regenerate/revoke flow.
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
