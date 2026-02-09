export function checkCorsOriginSafety({ nodeEnv, corsOrigin, allowInsecureCors }) {
  const env = String(nodeEnv || '').trim().toLowerCase()
  const isProd = env === 'production'
  if (!isProd) return { ok: true, warning: null, error: null }

  const origin = corsOrigin
  if (origin !== '*') return { ok: true, warning: null, error: null }

  const rawAllow = String(allowInsecureCors || '').trim().toLowerCase()
  const override = rawAllow === '1' || rawAllow === 'true' || rawAllow === 'yes'

  if (override) {
    return {
      ok: true,
      warning:
        'SECURITY WARNING: CORS_ORIGIN="*" in production allows any site to connect. Prefer an explicit allowlist; set ALLOW_INSECURE_CORS only if you fully understand the risk.',
      error: null,
    }
  }

  return {
    ok: false,
    warning: null,
    error:
      'SECURITY: Refusing to start with CORS_ORIGIN="*" in production. Set CORS_ORIGIN to a comma-separated allowlist (e.g. https://sketch.example.com) or set ALLOW_INSECURE_CORS=1 to override.',
  }
}

