function getRedoStack(redoByUser, userId) {
  const existing = redoByUser.get(userId)
  if (existing) return existing
  const stack = []
  redoByUser.set(userId, stack)
  return stack
}

export function clearRedoStack(redoByUser, userId) {
  redoByUser.delete(userId)
}

export function undoLastStroke(strokes, redoByUser, userId) {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index]
    if (stroke?.userId !== userId) continue
    strokes.splice(index, 1)
    getRedoStack(redoByUser, userId).push(stroke)
    return stroke
  }
  return null
}

export function redoLastStroke(strokes, redoByUser, userId) {
  const stack = redoByUser.get(userId)
  if (!stack || stack.length === 0) return null
  const stroke = stack.pop()
  if (!stroke) return null
  strokes.push(stroke)
  return stroke
}

