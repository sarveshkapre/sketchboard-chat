import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadLocalDrawPrefs, saveLocalDrawPrefs } from '../src/drawPrefsStorage'

const KEY = 'sketchboard:draw-prefs:v1'

describe('draw prefs storage', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    })
  })

  it('saves and loads drawing preferences', () => {
    saveLocalDrawPrefs({ tool: 'eraser', color: '#4d96ff', size: 10 })
    expect(loadLocalDrawPrefs()).toEqual({ tool: 'eraser', color: '#4d96ff', size: 10 })
  })

  it('sanitizes invalid payloads', () => {
    localStorage.setItem(KEY, JSON.stringify({ tool: 'bad', color: 'nope', size: -10 }))
    expect(loadLocalDrawPrefs()).toBe(null)
  })
})
