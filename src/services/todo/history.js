import { STORAGE_KEYS, MAX_PERSISTED_ACTIONS } from '@/constants/storageKeys.js'
import { updateTodoAverage } from '@/utils/todo/todoIntervals.js'

export function loadStack(key, storage = localStorage) {
  try {
    const raw = storage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.slice(-MAX_PERSISTED_ACTIONS)
    }
  } catch {}
  return []
}

export function saveStack(key, stack, storage = localStorage) {
  try {
    storage.setItem(key, JSON.stringify(stack.slice(-MAX_PERSISTED_ACTIONS)))
  } catch {}
}

export function createHistoryStacks(storage = localStorage) {
  return {
    undo: loadStack(STORAGE_KEYS.UNDO, storage),
    redo: loadStack(STORAGE_KEYS.REDO, storage),
  }
}

export function applyUndo(entry, todo) {
  if (entry.type === 'toggle') {
    if (entry.timingAction === 'pushed') {
      todo.timings.pop()
    } else if (entry.timingAction === 'modified') {
      const last = todo.timings[todo.timings.length - 1]
      if (last) {
        const p = entry.prev
        if (p.end !== undefined) last.end = p.end; else delete last.end
        if (p.quantity !== undefined) last.quantity = p.quantity; else delete last.quantity
        if (p.unit !== undefined) last.unit = p.unit; else delete last.unit
      }
    }
    todo.done = entry.wasDone
  } else if (entry.type === 'unit-change') {
    todo.unit = entry.oldUnit
    todo.quantity = entry.oldQuantity
    todo.conversions = JSON.parse(JSON.stringify(entry.oldConversions))
  }
  updateTodoAverage(todo)
}

export function applyRedo(entry, todo) {
  if (entry.type === 'toggle') {
    todo.done = !entry.wasDone
    if (entry.timingAction === 'pushed') {
      todo.timings.push({ ...entry.timing })
    } else if (entry.timingAction === 'modified') {
      const last = todo.timings[todo.timings.length - 1]
      if (last) {
        const n = entry.next
        last.end = n.end
        last.quantity = n.quantity
        last.unit = n.unit
      }
    }
  } else if (entry.type === 'unit-change') {
    todo.unit = entry.newUnit
    todo.quantity = entry.newQuantity
    todo.conversions = JSON.parse(JSON.stringify(entry.newConversions))
  }
  updateTodoAverage(todo)
}

export function syncHistoryStacksListIdsForTodo(undoStack, redoStack, todoId, listId) {
  for (const e of undoStack) {
    if (e.todoId === todoId) e.listId = listId
  }
  for (const e of redoStack) {
    if (e.todoId === todoId) e.listId = listId
  }
}

export function pruneHistoryStacksForTodo(undoStack, redoStack, todoId) {
  for (let i = undoStack.length - 1; i >= 0; i--) {
    if (undoStack[i].todoId === todoId) undoStack.splice(i, 1)
  }
  for (let i = redoStack.length - 1; i >= 0; i--) {
    if (redoStack[i].todoId === todoId) redoStack.splice(i, 1)
  }
}
