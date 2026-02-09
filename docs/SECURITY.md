# SECURITY

## Reporting
Please report security issues via GitHub Security Advisories.

## Notes
- No authentication is provided by default.
- For production deployments, consider setting `AUTH_TOKEN` to gate Socket.IO connections (and set a strict `CORS_ORIGIN` allowlist).
- Keep `ADMIN_TOKEN` private; it grants access to admin endpoints.
