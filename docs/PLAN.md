# PLAN

## Goal
Deliver a realtime sketchboard with chat, presence, and PNG export for quick demos.

## Stack
- Vite + React + TypeScript for the client.
- Express + Socket.IO for realtime server.

## Architecture
- `server/index.mjs` hosts Socket.IO + serves production static build.
- `src/App.tsx` holds the drawing board, presence, and chat UI.
- In-memory state per room for strokes/messages/users.

## MVP checklist
- [x] Realtime strokes + broadcast
- [x] Presence list + cursor tracking
- [x] Chat panel
- [x] Export to PNG
- [x] CI + lint/typecheck/test/build

## Risks
- Memory usage grows with unlimited strokes/messages; capped in server.
- Canvas scaling on resize; redraw with stored strokes.

## Milestones
1. Scaffold repo + realtime server.
2. Build canvas UX + presence + chat.
3. Add CI, docs, and release flow.
