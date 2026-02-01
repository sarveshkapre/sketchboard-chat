import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'

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
      }

      await persistence.saveNow('room-1', room)
      const loaded = await persistence.load('room-1')

      expect(loaded?.strokes.map((s) => s.id)).toEqual(['s2', 's3'])
      expect(loaded?.messages.map((m) => m.id)).toEqual(['m2', 'm3'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

