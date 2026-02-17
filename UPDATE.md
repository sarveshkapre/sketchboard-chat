# Update (2026-02-17)

## Shipped
- Chat UX: unread counter + jump-to-latest, message copy action, and chat search filter.
- Productivity UX: keyboard shortcuts (`P`/`E`/`V`, `[`/`]`, `,`, `?`) with an in-app shortcuts modal.
- Persistence UX: drawing preferences (`tool`, `color`, `size`) now persist locally.
- Room UX: quick random room generation action in room settings.
- Admin UX: rooms list sorting controls (users/messages/strokes/state bytes/name).
- Reliability: duplicate chat message IDs are now de-duplicated server-side per room.

## Verified
- `npm run check`

---

# Update (2026-02-11)

## Shipped
- Reliability: Added `ROOM_MAX_IMAGE_BYTES` to cap aggregate per-room image bytes in memory; image adds are now rejected when the cap would be exceeded.
- Observability: `GET /api/rooms` now returns `imagesBytes` and `stateBytesEstimate`; admin rooms UI now surfaces both values.
- Security: Added a default production `Content-Security-Policy` response header (override with `CSP_HEADER`).

## Verified
- `npm run check`
- `npm run smoke`

---

# Update (2026-02-10)

## Shipped
- Reliability: Added `PERSIST_MAX_BYTES` to cap per-room persisted state file size; oversized snapshots are trimmed deterministically to prevent disk abuse when `PERSIST=1`.

## Verified
- `npm run check`
- `npm run smoke`

---

# Update (2026-02-09)

## Shipped
- Reliability: When `PERSIST` is off, empty rooms are retained briefly in memory (configurable TTL) to avoid accidental board loss on quick reconnects.
- Admin UX: Rooms list now shows `Locked` and `Invite-only` badges, with quick filters for those states.
- Feature: Image import (paste/drag/drop/file picker), synced per room.
- UX: Select tool to move/delete images; SVG export embeds images; admin rooms list shows image counts.

## Verified
- `npm run check`
- `npm run smoke`

---

# Update (2026-02-08)

## Shipped
- Grouped stroke undo/redo actions: quick consecutive strokes now share a batch ID and undo/redo together.
- Express 5 production startup fix: SPA fallback route updated to `/{*path}`.
- CI hardening: build job checkout now uses full git history (`fetch-depth: 0`) to stabilize secret scan history lookups.

## Verified
- `npm run check`

## Manual smoke
- `npm run start`
- `curl http://localhost:4000/health` -> `{"status":"ok"}`
- `curl http://localhost:4000/api/rooms` -> `{"rooms":[]}`

---

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
