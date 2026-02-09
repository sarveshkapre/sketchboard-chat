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

## Environment
- `PORT` (server): default `4000`
- `CORS_ORIGIN` (server): default `*` (set a comma-separated allowlist in prod)
- `AUTH_TOKEN` (server): optional access token for Socket.IO connections (client prompts and reconnects if required)
- `ADMIN_TOKEN` (server): optional bearer token for admin endpoints (e.g. `/api/rooms`)
- `INVITE_SECRET` (server): optional secret used to sign invite links (enables invite-only rooms)
- `PERSIST` (server): set `1` to persist strokes/messages to disk (default off)
- `PERSIST_DIR` (server): persistence directory (default `./data`)
- `PERSIST_DEBOUNCE_MS` (server): debounce before writing to disk (default `400`)
- `PERSIST_MAX_ROOMS` (server): optional cap on number of room files kept
- `PERSIST_TTL_DAYS` (server): optional TTL for room files (delete older than N days)
- `VITE_SERVER_URL` (client): server URL override

## Next 3 improvements
1. Image import + stickers.
2. Room inactivity GC to avoid unbounded in-memory growth.
3. Admin rooms list badges/filters for `invite-only` and `locked`.
