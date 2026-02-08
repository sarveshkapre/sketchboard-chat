function getRedoStack(redoByUser, userId) {
  const existing = redoByUser.get(userId)
  if (existing) return existing
  const stack = []
  redoByUser.set(userId, stack)
  return stack
}

function normalizeBatchId(stroke) {
  if (!stroke || typeof stroke !== 'object') return ''
  return typeof stroke.batchId === 'string' ? stroke.batchId : ''
}

export function clearRedoStack(redoByUser, userId) {
  redoByUser.delete(userId)
}

export function undoLastStroke(strokes, redoByUser, userId) {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index]
    if (stroke?.userId !== userId) continue
    const batchId = normalizeBatchId(stroke)
    const removed = []

    if (batchId) {
      for (let batchIndex = strokes.length - 1; batchIndex >= 0; batchIndex -= 1) {
        const candidate = strokes[batchIndex]
        if (candidate?.userId !== userId) continue
        if (normalizeBatchId(candidate) !== batchId) continue
        strokes.splice(batchIndex, 1)
        removed.unshift(candidate)
      }
    } else {
      strokes.splice(index, 1)
      removed.push(stroke)
    }

    if (removed.length === 0) return null
    getRedoStack(redoByUser, userId).push(removed)
    return removed
  }
  return null
}

export function redoLastStroke(strokes, redoByUser, userId) {
  const stack = redoByUser.get(userId)
  if (!stack || stack.length === 0) return null
  const entry = stack.pop()
  if (!entry) return null

  const batch = Array.isArray(entry) ? entry.filter(Boolean) : [entry]
  if (batch.length === 0) return null
  for (const stroke of batch) {
    strokes.push(stroke)
  }
  return batch
}
