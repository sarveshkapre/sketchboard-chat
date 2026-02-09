import { describe, expect, it } from 'vitest'

import { checkCorsOriginSafety } from '../server/config.mjs'

describe('CORS production guardrail', () => {
  it('rejects wildcard CORS in production unless explicitly overridden', () => {
    const rejected = checkCorsOriginSafety({ nodeEnv: 'production', corsOrigin: '*' })
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toMatch(/Refusing to start/i)

    const allowed = checkCorsOriginSafety({
      nodeEnv: 'production',
      corsOrigin: '*',
      allowInsecureCors: '1',
    })
    expect(allowed.ok).toBe(true)
    expect(allowed.warning).toMatch(/SECURITY WARNING/i)
  })

  it('allows explicit allowlists in production', () => {
    expect(checkCorsOriginSafety({ nodeEnv: 'production', corsOrigin: 'https://example.com' }).ok).toBe(true)
    expect(checkCorsOriginSafety({ nodeEnv: 'production', corsOrigin: ['https://a.com', 'https://b.com'] }).ok).toBe(
      true,
    )
  })

  it('does not block wildcard CORS outside production', () => {
    expect(checkCorsOriginSafety({ nodeEnv: 'development', corsOrigin: '*' }).ok).toBe(true)
    expect(checkCorsOriginSafety({ nodeEnv: '', corsOrigin: '*' }).ok).toBe(true)
  })
})

