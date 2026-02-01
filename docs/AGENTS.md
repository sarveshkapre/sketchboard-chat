# AGENTS

## Working agreements
- Keep the MVP local-first and unauthenticated.
- Any real-time changes must be reflected in both server and client.
- Add a test when you add a new utility or critical behavior.

## Commands
- Setup: `npm install`
- Dev: `npm run dev`
- Test: `npm run test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Full gate: `npm run check`

## Structure
- `src/`: React client
- `server/`: Socket.IO server
- `tests/`: Vitest tests
