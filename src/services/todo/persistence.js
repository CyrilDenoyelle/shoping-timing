import { STORAGE_KEYS } from '@/services/storage/keys.js'
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

export function loadListsFromStorage(storage) {
  try {
    const parsed = storage.getJson(STORAGE_KEYS.LISTS)
    if (Array.isArray(parsed)) return parsed.map(migrateList)

    const legacyTodos = storage.getJson(STORAGE_KEYS.LEGACY_TODOS)
    if (Array.isArray(legacyTodos)) {
      return [{ id: 'default', name: 'Ma liste', todos: legacyTodos.map(migrateTodo) }]
    }
    return null
  } catch {
    return null
  }
}

export function saveListsToStorage(lists, storage) {
  if (!storage.setJson(STORAGE_KEYS.LISTS, lists)) {
    console.warn('Impossible de sauvegarder les listes')
  }
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
