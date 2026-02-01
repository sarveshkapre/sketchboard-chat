# PROJECT

## Quick commands
- Setup: `npm install`
- Dev: `npm run dev`
- Test: `npm run test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Full gate: `npm run check`

## Rooms
Rooms separate boards by URL. Example: `http://localhost:5173/r/team-1` (also supports `?room=team-1`)
View-only mode: append `?mode=view` (disables drawing + chat).

## Environment
- `PORT` (server): default `4000`
- `CORS_ORIGIN` (server): default `*` (set a comma-separated allowlist in prod)
- `PERSIST` (server): set `1` to persist strokes/messages to disk (default off)
- `PERSIST_DIR` (server): persistence directory (default `./data`)
- `PERSIST_DEBOUNCE_MS` (server): debounce before writing to disk (default `400`)
- `PERSIST_MAX_ROOMS` (server): optional cap on number of room files kept
- `PERSIST_TTL_DAYS` (server): optional TTL for room files (delete older than N days)
- `VITE_SERVER_URL` (client): server URL override

## Next 3 improvements
1. Add per-user stroke grouping (better undo UX).
2. Add a basic admin endpoint for room metrics (counts, sizes).
3. Add readonly/share links and "spectator" mode.
