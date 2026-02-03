import { describe, expect, it, vi } from 'vitest'

import { getUserKey } from '../src/userKey'

describe('userKey', () => {
  it('persists a generated key', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })

    const first = getUserKey()
    const second = getUserKey()
    expect(first).toBe(second)
  })
})
