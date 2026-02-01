# Sketchboard Chat

Realtime sketching board with multiplayer presence and chat. Draw together, see live cursors, and export the canvas as PNG.

## Features
- Realtime shared drawing board (Socket.IO)
- Multiplayer presence with live cursors
- Group chat panel
- Export to PNG

## Quickstart
```bash
npm install
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`

## Configuration
- `PORT` (server): default `4000`
- `CORS_ORIGIN` (server): default `*`
- `VITE_SERVER_URL` (client): override Socket.IO server URL

## Production
```bash
npm install
npm run build
npm run start
```

## Docker
```bash
docker build -t sketchboard-chat .
docker run --rm -p 4000:4000 sketchboard-chat
```

## Repo docs
All repository docs (except this README) live in `docs/`.
