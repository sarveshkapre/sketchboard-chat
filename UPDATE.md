# Update (2026-02-01)

## Shipped
- Room-based sessions via `?room=...` (separate boards per room).
- Clean room URLs via `/r/<room>` (shareable links).
- Server-side validation/caps for realtime events and safer `CORS_ORIGIN` parsing.
- SVG export (downloads vector strokes).
- Basic server-side rate limiting for chat/draw/clear spam.
- Optional disk persistence for rooms (`PERSIST=1`).
- Presence/chat polish (cursor deltas + throttling, chat author metadata, chat autoscroll).

## Verified
- `npm run check`

## Manual smoke
- `npm run dev`
- Open `http://localhost:5173/r/team-1` in two tabs and verify isolation from `http://localhost:5173/r/team-2`.
- Restart the server with `PERSIST=1` and confirm room state restores.

## Repo workflow
- Changes are committed directly to `main` (no PRs).
