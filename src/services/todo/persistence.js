import { STORAGE_KEYS } from '@/constants/storageKeys.js'
import { updateTodoAverage } from '@/utils/todo/todoIntervals.js'

function migrateTiming(t) {
  if (Array.isArray(t)) {
    const obj = { start: t[0] }
    if (t[1] != null) obj.end = t[1]
    obj.quantity ??= 1
    obj.unit ??= ''
    return obj
  }
  t.quantity ??= 1
  t.unit ??= ''
  return t
}

function migrateTodo(todo) {
  todo.timings = (todo.timings ?? []).map(migrateTiming)
  if (todo.quantity == null) todo.quantity = 1
  if (todo.unit == null) todo.unit = ''
  if (todo.conversions == null) todo.conversions = {}
  updateTodoAverage(todo)
  return todo
}

function migrateList(list) {
  if (!Array.isArray(list.todos)) list.todos = []
  list.todos = list.todos.map(migrateTodo)
  return list
}

export function loadListsFromStorage(storage = localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEYS.LISTS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(migrateList)
    }
    const legacyRaw = storage.getItem(STORAGE_KEYS.LEGACY_TODOS)
    if (legacyRaw) {
      const legacyTodos = JSON.parse(legacyRaw)
      if (Array.isArray(legacyTodos)) {
        return [{ id: 'default', name: 'Ma liste', todos: legacyTodos.map(migrateTodo) }]
      }
    }
    return null
  } catch {
    return null
  }
}

export function saveListsToStorage(lists, storage = localStorage) {
  try {
    storage.setItem(STORAGE_KEYS.LISTS, JSON.stringify(lists))
  } catch (e) {
    console.warn('Impossible de sauvegarder les listes:', e)
  }
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
