import { describe, expect, it } from 'vitest'

import { createFixedWindowRateLimiter } from '../server/rate-limit.mjs'

describe('rate limiter', () => {
  it('allows up to max within a window and then blocks', () => {
    let now = 0
    const limiter = createFixedWindowRateLimiter({
      windowMs: 1000,
      max: 2,
      now: () => now,
    })

    expect(limiter.check()).toEqual({ allowed: true, retryAfterMs: 0 })
    expect(limiter.check()).toEqual({ allowed: true, retryAfterMs: 0 })

    const blocked = limiter.check()
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)

    now = 1000
    expect(limiter.check()).toEqual({ allowed: true, retryAfterMs: 0 })
  })
})

