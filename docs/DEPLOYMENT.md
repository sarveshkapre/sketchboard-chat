# Deployment Guide

## Baseline
- Node.js 20+
- A reverse proxy that supports WebSockets (nginx, Caddy, Traefik, Cloudflare, etc.)

## Recommended Env Vars
- `PORT`: server listen port (default `4000`)
- `CORS_ORIGIN`: comma-separated allowlist of origins (set this in production)
  - Example: `https://sketch.example.com,https://www.sketch.example.com`
- `AUTH_TOKEN`: optional access token that gates Socket.IO connections
  - If set, the client will prompt for the token and reconnect.
- `INVITE_SECRET`: enables invite-only rooms with expiring, signed invite links
  - Use a long random secret.
- `ADMIN_TOKEN`: bearer token for admin HTTP endpoints (e.g. `GET /api/rooms`)
  - Keep this separate from `AUTH_TOKEN`.
- `PERSIST`: set `1` to persist room state to disk
- `PERSIST_DIR`: directory for persisted room files (default `./data`)
- `PERSIST_MAX_ROOMS`: optional cap on persisted room files
- `PERSIST_TTL_DAYS`: optional TTL cleanup window

## Build + Run
```bash
npm ci
npm run build
npm run start
```

Smoke:
```bash
npm run smoke
```

## Reverse Proxy Notes
- WebSockets must be enabled for Socket.IO.
- If you terminate TLS at the proxy, forward `X-Forwarded-*` headers as usual.

## Security Checklist
- Set `CORS_ORIGIN` to an allowlist.
- Set `AUTH_TOKEN` if your deployment should not be publicly accessible.
- Keep `ADMIN_TOKEN` private; it grants room-moderation capabilities via HTTP.
- Set `INVITE_SECRET` if you want invite-only rooms (and keep it stable to avoid breaking old invites).

