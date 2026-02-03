import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm, utimes } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { createRoomPersistence } from '../server/persistence.mjs'

describe('persistence', () => {
  it('saves and loads room state', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sketchboard-chat-'))
    try {
      const persistence = createRoomPersistence({
        enabled: true,
        dir,
        debounceMs: 50,
        limits: { maxStrokes: 2, maxMessages: 2 },
      })

      const room = {
        strokes: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
        messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
        rolesByKey: new Map([
          ['u1', 'owner'],
          ['u2', 'mod'],
        ]),
        ownerKey: 'u1',
      }

      await persistence.saveNow('room-1', room)
      const loaded = await persistence.load('room-1')

      expect(loaded?.strokes.map((s) => s.id)).toEqual(['s2', 's3'])
      expect(loaded?.messages.map((m) => m.id)).toEqual(['m2', 'm3'])
      expect(loaded?.ownerKey).toBe('u1')
      expect(loaded?.rolesByKey).toEqual([
        ['u1', 'owner'],
        ['u2', 'mod'],
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('cleans up old room files by max count and ttl', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sketchboard-chat-'))
    try {
      const persistence = createRoomPersistence({
        enabled: true,
        dir,
        debounceMs: 50,
        limits: { maxStrokes: 2, maxMessages: 2 },
        maxRooms: 2,
        maxAgeMs: 1000,
      })

      await persistence.saveNow('room-1', { strokes: [], messages: [] })
      await persistence.saveNow('room-2', { strokes: [], messages: [] })
      await persistence.saveNow('room-3', { strokes: [], messages: [] })

      const now = Date.now()
      const file1 = path.join(dir, 'room-room-1.json')
      const file2 = path.join(dir, 'room-room-2.json')
      const file3 = path.join(dir, 'room-room-3.json')

      await utimes(file1, new Date(now - 10_000), new Date(now - 10_000))
      await utimes(file2, new Date(now - 500), new Date(now - 500))
      await utimes(file3, new Date(now - 200), new Date(now - 200))

      await persistence.cleanupNow()

      const loaded1 = await persistence.load('room-1')
      const loaded2 = await persistence.load('room-2')
      const loaded3 = await persistence.load('room-3')

      expect(loaded1).toBe(null) // TTL should remove it
      expect(loaded2).not.toBe(null)
      expect(loaded3).not.toBe(null)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
