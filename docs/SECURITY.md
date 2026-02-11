# SECURITY

## Reporting
Please report security issues via GitHub Security Advisories.

## Notes
- No authentication is provided by default.
- For production deployments, consider setting `AUTH_TOKEN` to gate Socket.IO connections (and set a strict `CORS_ORIGIN` allowlist).
- In `NODE_ENV=production`, the server refuses to start with `CORS_ORIGIN=*` unless you explicitly set `ALLOW_INSECURE_CORS=1`.
- Keep `ADMIN_TOKEN` private; it grants access to admin endpoints.
- In `NODE_ENV=production`, the server sets a default `Content-Security-Policy` header unless overridden via `CSP_HEADER`.
- Use `ROOM_MAX_IMAGE_BYTES` to cap aggregate room image bytes and limit worst-case in-memory growth.
