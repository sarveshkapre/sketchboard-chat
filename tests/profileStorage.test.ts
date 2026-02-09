import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadLocalProfile, saveLocalProfile } from '../src/profileStorage'

const KEY = 'sketchboard:profile:v1'

describe('profile storage', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    })
  })

  it('saves and loads a profile', () => {
    saveLocalProfile({ name: 'Alice', color: '#4d96ff' })
    expect(loadLocalProfile()).toEqual({ name: 'Alice', color: '#4d96ff' })
  })

  it('sanitizes invalid payloads', () => {
    saveLocalProfile({ name: '   ', color: 'nope' })
    expect(loadLocalProfile()).toBe(null)

    saveLocalProfile({ name: '  Bob  ', color: '#FFF' })
    expect(loadLocalProfile()).toEqual({ name: 'Bob', color: '#fff' })
  })

  it('returns null on corrupt JSON', () => {
    localStorage.setItem(KEY, '{bad json')
    expect(loadLocalProfile()).toBe(null)
  })
})
