# Update (2026-02-01)

## Shipped
- Room-based sessions via `?room=...` (separate boards per room).
- Server-side validation/caps for realtime events and safer `CORS_ORIGIN` parsing.
- SVG export (downloads vector strokes).
- Presence/chat polish (cursor deltas + throttling, chat author metadata, chat autoscroll).

## Verified
- `npm run check`

## Manual smoke
- `npm run dev`
- Open `http://localhost:5173/?room=team-1` in two tabs and verify isolation from `?room=team-2`.

## Repo workflow
- Changes are committed directly to `main` (no PRs).
