function defaultNow() {
  return Date.now()
}

export function createFixedWindowRateLimiter(options) {
  const windowMs = Number.isFinite(options?.windowMs) ? Math.max(1, options.windowMs) : 1000
  const max = Number.isFinite(options?.max) ? Math.max(1, options.max) : 1
  const now = typeof options?.now === 'function' ? options.now : defaultNow

  let windowStart = null
  let count = 0

  function resetIfNeeded(currentTime) {
    if (windowStart === null) return
    if (currentTime - windowStart >= windowMs) {
      windowStart = currentTime
      count = 0
    }
  }

  return {
    check() {
      const currentTime = now()
      if (windowStart === null) {
        windowStart = currentTime
      } else {
        resetIfNeeded(currentTime)
      }

      if (count >= max) {
        const retryAfterMs = Math.max(0, windowMs - (currentTime - windowStart))
        return { allowed: false, retryAfterMs }
      }

      count += 1
      return { allowed: true, retryAfterMs: 0 }
    },
  }
}
