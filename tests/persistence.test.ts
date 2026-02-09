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
        limits: { maxStrokes: 2, maxMessages: 2, maxAudit: 2 },
      })

      const room = {
        locked: true,
        private: true,
        inviteVersion: 7,
        strokes: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
        messages: [
          { id: 'm1', text: 'one', createdAt: '2026-01-01T00:00:00.000Z', reactions: { '👍': ['u1'] } },
          { id: 'm2', text: 'two', createdAt: '2026-01-01T00:00:01.000Z' },
          { id: 'm3', text: 'three', createdAt: '2026-01-01T00:00:02.000Z' },
        ],
        audit: [
          { id: 'a1', at: '2026-01-01T00:00:00.000Z', text: 'First' },
          { id: 'a2', at: '2026-01-01T00:00:01.000Z', text: 'Second' },
          { id: 'a3', at: '2026-01-01T00:00:02.000Z', text: 'Third' },
        ],
        rolesByKey: new Map([
          ['u1', 'owner'],
          ['u2', 'mod'],
        ]),
        ownerKey: 'u1',
        pinnedId: 'm2',
      }

      await persistence.saveNow('room-1', room)
      const loaded = await persistence.load('room-1')

      expect(loaded?.strokes.map((s) => s.id)).toEqual(['s2', 's3'])
      expect(loaded?.messages.map((m) => m.id)).toEqual(['m2', 'm3'])
      expect(loaded?.messages[0]?.reactions).toBeUndefined()
      expect(loaded?.audit?.map((entry) => entry.id)).toEqual(['a2', 'a3'])
      expect(loaded?.ownerKey).toBe('u1')
      expect(loaded?.pinnedId).toBe('m2')
      expect(loaded?.locked).toBe(true)
      expect(loaded?.private).toBe(true)
      expect(loaded?.inviteVersion).toBe(7)
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
        limits: { maxStrokes: 2, maxMessages: 2, maxAudit: 2 },
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
