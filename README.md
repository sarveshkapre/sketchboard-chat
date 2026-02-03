# Sketchboard Chat

Realtime sketching board with multiplayer presence and chat. Draw together, see live cursors, and export the canvas as PNG.

## Features
- Realtime shared drawing board (Socket.IO)
- Multiplayer presence with live cursors
- Group chat panel
- Room-based sessions via `?room=...`
- Undo/redo (per-user, synced)
- User profiles (display name + color)
- Room roles (owner/mod) with in-room moderation
- Room activity log for moderation changes
- Export to PNG and SVG

## Quickstart
```bash
npm install
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`

Room example: `http://localhost:5173/r/team-1` (also supports `?room=team-1`)
View-only example: `http://localhost:5173/r/team-1?mode=view`

## Configuration
- `PORT` (server): default `4000`
- `CORS_ORIGIN` (server): default `*` (set a comma-separated allowlist in prod, e.g. `https://example.com,https://www.example.com`)
- `ADMIN_TOKEN` (server): optional bearer token for admin endpoints (e.g. `/api/rooms`)
- `PERSIST` (server): set `1` to persist strokes/messages to disk (default off)
- `PERSIST_DIR` (server): persistence directory (default `./data`)
- `PERSIST_DEBOUNCE_MS` (server): debounce before writing to disk (default `400`)
- `PERSIST_MAX_ROOMS` (server): optional cap on number of room files kept (cleanup runs in background)
- `PERSIST_TTL_DAYS` (server): optional TTL for room files (delete older than N days)
- `VITE_SERVER_URL` (client): override Socket.IO server URL

## Production
```bash
npm install
npm run build
npm run start
```

## Admin endpoints
If `ADMIN_TOKEN` is set, admin endpoints require a bearer token.

Example:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:4000/api/rooms
```

Lock/unlock a room:
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:4000/api/rooms/team-1/lock
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:4000/api/rooms/team-1/unlock
```

## Docker
```bash
docker build -t sketchboard-chat .
docker run --rm -p 4000:4000 sketchboard-chat
```

## Repo docs
Most repository docs live in `docs/` (see also `PLAN.md`, `CHANGELOG.md`, and `UPDATE.md` at the repo root).
