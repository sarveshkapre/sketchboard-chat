import { describe, expect, it } from 'vitest'

import { clearRedoStack, redoLastStroke, undoLastStroke } from '../server/stroke-history.mjs'

describe('stroke history', () => {
  it('undoes and redoes the last stroke by user', () => {
    const redoByUser = new Map<string, unknown[]>()
    const strokes = [
      { id: 'a', userId: 'u1' },
      { id: 'b', userId: 'u2' },
      { id: 'c', userId: 'u1' },
    ]

    const removed = undoLastStroke(strokes, redoByUser, 'u1')
    expect(removed?.id).toBe('c')
    expect(strokes.map((s) => s.id)).toEqual(['a', 'b'])

    const restored = redoLastStroke(strokes, redoByUser, 'u1')
    expect(restored?.id).toBe('c')
    expect(strokes.map((s) => s.id)).toEqual(['a', 'b', 'c'])

    clearRedoStack(redoByUser, 'u1')
    expect(redoLastStroke(strokes, redoByUser, 'u1')).toBe(null)
  })
})

