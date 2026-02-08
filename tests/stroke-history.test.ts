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
    expect(removed?.map((stroke) => stroke.id)).toEqual(['c'])
    expect(strokes.map((s) => s.id)).toEqual(['a', 'b'])

    const restored = redoLastStroke(strokes, redoByUser, 'u1')
    expect(restored?.map((stroke) => stroke.id)).toEqual(['c'])
    expect(strokes.map((s) => s.id)).toEqual(['a', 'b', 'c'])

    clearRedoStack(redoByUser, 'u1')
    expect(redoLastStroke(strokes, redoByUser, 'u1')).toBe(null)
  })

  it('undoes and redoes grouped strokes for the same user batch', () => {
    const redoByUser = new Map<string, unknown[]>()
    const strokes = [
      { id: 'a', userId: 'u1', batchId: 'batch-1' },
      { id: 'b', userId: 'u2', batchId: 'batch-x' },
      { id: 'c', userId: 'u1', batchId: 'batch-2' },
      { id: 'd', userId: 'u1', batchId: 'batch-2' },
      { id: 'e', userId: 'u3', batchId: 'batch-z' },
      { id: 'f', userId: 'u1', batchId: 'batch-2' },
    ]

    const removed = undoLastStroke(strokes, redoByUser, 'u1')
    expect(removed?.map((stroke) => stroke.id)).toEqual(['c', 'd', 'f'])
    expect(strokes.map((s) => s.id)).toEqual(['a', 'b', 'e'])

    const restored = redoLastStroke(strokes, redoByUser, 'u1')
    expect(restored?.map((stroke) => stroke.id)).toEqual(['c', 'd', 'f'])
    expect(strokes.map((s) => s.id)).toEqual(['a', 'b', 'e', 'c', 'd', 'f'])
  })
})
