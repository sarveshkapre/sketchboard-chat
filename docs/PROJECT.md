# PROJECT

## Quick commands
- Setup: `npm install`
- Dev: `npm run dev`
- Test: `npm run test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Full gate: `npm run check`
- Smoke: `npm run smoke`

## Rooms
Rooms separate boards by URL. Example: `http://localhost:5173/r/team-1` (also supports `?room=team-1`)
View-only mode: append `?mode=view` (disables drawing + chat).
The first non-view-only user becomes room owner and can promote moderators.
Moderation actions (lock, kick, role changes) appear in the room activity log.
Chat supports emoji reactions and a single pinned message per room.
Rooms can optionally be made invite-only (requires `INVITE_SECRET`); moderators can create expiring invite links.
Images can be added via paste/drag-drop/file picker and moved/deleted using the Select tool.

## Environment
- `PORT` (server): default `4000`
- `CORS_ORIGIN` (server): default `*` (set a comma-separated allowlist in prod)
- `AUTH_TOKEN` (server): optional access token for Socket.IO connections (client prompts and reconnects if required)
- `ADMIN_TOKEN` (server): optional bearer token for admin endpoints (e.g. `/api/rooms`)
- `INVITE_SECRET` (server): optional secret used to sign invite links (enables invite-only rooms)
- `PERSIST` (server): set `1` to persist strokes/messages to disk (default off)
- `PERSIST_DIR` (server): persistence directory (default `./data`)
- `PERSIST_DEBOUNCE_MS` (server): debounce before writing to disk (default `400`)
- `PERSIST_MAX_BYTES` (server): max bytes per persisted room file (default `10000000`); set `0` to disable (not recommended)
- `ROOM_IDLE_TTL_MS` (server): how long to keep an empty room in memory before eviction when `PERSIST` is off (default `900000` = 15 minutes)
- `ROOM_GC_INTERVAL_MS` (server): how often to sweep and evict idle rooms (default `30000` = 30 seconds)
- `PERSIST_MAX_ROOMS` (server): optional cap on number of room files kept
- `PERSIST_TTL_DAYS` (server): optional TTL for room files (delete older than N days)
- `ROOM_MAX_IMAGE_BYTES` (server): max total decoded bytes for all images in a room (default `8000000`)
- `CSP_HEADER` (server): optional custom Content-Security-Policy header (defaults to a safe production policy)
- `VITE_SERVER_URL` (client): server URL override

## Next 3 improvements
1. Basic zoom/pan (trackpad + touch) with stable cursor coordinates.
2. Stickers tool (emoji/stamps) as first-class board elements.
3. Text tool (place/edit/move short labels) as first-class elements.
