import { ref, reactive, watch, computed } from 'vue'
import { STORAGE_KEYS, defaultStorage } from '@/services/storage'
import { defaultLists } from '@/utils/todo/demoData.js'
import { getBaseUnit, unitScale } from '@/utils/todo/units.js'
import { updateTodoAverage, formatMs, getProgress } from '@/utils/todo/todoIntervals.js'
import { todoShoppingKey, parseShoppingKey } from '@/utils/todo/shoppingKeys.js'
import { debounce } from '@/utils/debounce.js'
import {
  loadListsFromStorage,
  saveListsToStorage,
  generateId,
} from '@/services/todo/persistence.js'
import {
  createHistoryStacks,
  saveStack,
  applyUndo,
  applyRedo,
  syncHistoryStacksListIdsForTodo,
  pruneHistoryStacksForTodo,
} from '@/services/todo/history.js'

function readShoppingModeFromStorage(storage = defaultStorage) {
  const v = storage.getString(STORAGE_KEYS.SHOPPING_MODE)
  return v === '1' || v === 'true'
}

function saveShoppingOrder(order, storage = defaultStorage) {
  storage.setJson(STORAGE_KEYS.SHOPPING_ORDER, order)
}

const shoppingMode = ref(readShoppingModeFromStorage())
const manualSort = ref(defaultStorage.getString(STORAGE_KEYS.SORT_MODE) === 'manual')
const shoppingManualSort = ref(defaultStorage.getString(STORAGE_KEYS.SHOPPING_MANUAL_SORT) === '1')
const shoppingOrder = ref((() => {
  const parsed = defaultStorage.getJson(STORAGE_KEYS.SHOPPING_ORDER, [])
  return Array.isArray(parsed) ? parsed : []
})())

const confettiTrigger = ref(0)
const { undo: initialUndo, redo: initialRedo } = createHistoryStacks(defaultStorage)
const undoStack = reactive(initialUndo)
const redoStack = reactive(initialRedo)
let instance = null
let flushListsPersist = null
let pageHideRegistered = false

export function useTodoStorage(storage = defaultStorage) {
  if (instance) return instance

  const stored = loadListsFromStorage(storage)
  const lists = ref(stored ?? defaultLists)

  let nextTodoId = Math.max(0, ...lists.value.flatMap((l) => l.todos.map((t) => t.id))) + 1

  const syncShoppingOrder = () => {
    const allKeys = []
    for (const list of lists.value) {
      for (const t of list.todos) {
        allKeys.push(todoShoppingKey(list.id, t.id))
      }
    }
    const allSet = new Set(allKeys)
    const preserved = shoppingOrder.value.filter((k) => allSet.has(k))
    const preservedSet = new Set(preserved)
    const appended = allKeys.filter((k) => !preservedSet.has(k))
    const next = [...preserved, ...appended]
    if (next.length !== shoppingOrder.value.length || next.some((k, i) => k !== shoppingOrder.value[i])) {
      shoppingOrder.value = next
    }
  }

  const persistLists = debounce((newLists) => saveListsToStorage(newLists, storage), 300)

  flushListsPersist = () => persistLists.flush()
  if (!pageHideRegistered) {
    window.addEventListener('pagehide', () => flushListsPersist?.())
    pageHideRegistered = true
  }

  watch(
    lists,
    (newLists) => {
      syncShoppingOrder()
      persistLists(newLists)
    },
    { deep: true, immediate: true },
  )

  watch(undoStack, () => saveStack(STORAGE_KEYS.UNDO, undoStack, storage))
  watch(redoStack, () => saveStack(STORAGE_KEYS.REDO, redoStack, storage))

  watch(shoppingMode, () => {
    storage.setString(STORAGE_KEYS.SHOPPING_MODE, shoppingMode.value ? '1' : '0')
  })

  watch(shoppingManualSort, () => {
    storage.setString(STORAGE_KEYS.SHOPPING_MANUAL_SORT, shoppingManualSort.value ? '1' : '0')
  })

  watch(shoppingOrder, (order) => saveShoppingOrder(order, storage), { deep: true })

  const findListById = (listId) => lists.value.find((l) => l.id === listId)

  const isUncheckedShoppingKey = (key) => {
    const { listId, todoId } = parseShoppingKey(key)
    const todo = findListById(listId)?.todos.find((t) => t.id === todoId)
    return todo != null && !todo.done
  }

  const todoUndoChains = computed(() => {
    /** @type {Record<string, unknown[]>} */
    const m = {}
    for (const e of undoStack) {
      const k = String(e.todoId)
      ;(m[k] ||= []).push(e)
    }
    return m
  })

  const todoRedoChains = computed(() => {
    /** @type {Record<string, unknown[]>} */
    const m = {}
    for (const e of redoStack) {
      const k = String(e.todoId)
      ;(m[k] ||= []).push(e)
    }
    return m
  })

  const undoDepthForTodo = (todoId) => (todoUndoChains.value[String(todoId)] ?? []).length

  const redoDepthForTodo = (todoId) => (todoRedoChains.value[String(todoId)] ?? []).length

  const addList = (name) => {
    const trimmed = (name || 'Nouvelle liste').trim()
    lists.value.push({
      id: generateId(),
      name: trimmed,
      todos: [],
    })
  }

  const removeList = (id) => {
    const idx = lists.value.findIndex((l) => l.id === id)
    if (idx === -1) return
    const [removed] = lists.value.splice(idx, 1)
    for (const t of removed.todos ?? []) pruneHistoryStacksForTodo(undoStack, redoStack, t.id)
  }

  const renameList = (id, name) => {
    const list = lists.value.find((l) => l.id === id)
    if (list) list.name = (name || 'Sans nom').trim()
  }

  const moveList = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    const [moved] = lists.value.splice(fromIndex, 1)
    lists.value.splice(toIndex, 0, moved)
  }

  const moveTodo = (fromListId, fromIndex, toListId, toIndex) => {
    const fromList = findListById(fromListId)
    const toList = findListById(toListId ?? fromListId)
    if (!fromList || !toList) return
    if (fromListId === (toListId ?? fromListId) && fromIndex === toIndex) return
    const [moved] = fromList.todos.splice(fromIndex, 1)
    toList.todos.splice(toIndex, 0, moved)
    if (fromList !== toList) {
      syncHistoryStacksListIdsForTodo(undoStack, redoStack, moved.id, toList.id)
      const oldKey = todoShoppingKey(fromListId, moved.id)
      const newKey = todoShoppingKey(toList.id, moved.id)
      const idx = shoppingOrder.value.indexOf(oldKey)
      if (idx !== -1) shoppingOrder.value[idx] = newKey
    }
  }

  const moveShoppingTodo = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    syncShoppingOrder()
    const order = [...shoppingOrder.value]
    const uncheckedKeys = order.filter(isUncheckedShoppingKey)
    if (
      fromIndex < 0 || fromIndex >= uncheckedKeys.length ||
      toIndex < 0 || toIndex >= uncheckedKeys.length
    ) return
    const [movedKey] = uncheckedKeys.splice(fromIndex, 1)
    uncheckedKeys.splice(toIndex, 0, movedKey)
    let u = 0
    shoppingOrder.value = order.map((k) => (isUncheckedShoppingKey(k) ? uncheckedKeys[u++] : k))
  }

  const addTodo = (listId, text) => {
    const list = findListById(listId)
    if (!list) return
    list.todos.push({
      id: nextTodoId++,
      text,
      done: false,
      timings: [],
      averageIntervalMs: Infinity,
      quantity: 1,
      unit: '',
      conversions: {},
    })
  }

  const findTodo = (listId, id) => {
    const list = findListById(listId)
    return list?.todos.find((t) => t.id === id)
  }

  const findTodoByStableIdForHistory = (todoId) => {
    for (const l of lists.value) {
      const t = l.todos.find((x) => x.id === todoId)
      if (t) return t
    }
    return null
  }

  const toggleTodo = (listId, id) => {
    const todo = findTodo(listId, id)
    if (!todo) return

    const entry = { type: 'toggle', listId, todoId: id, wasDone: todo.done }
    todo.done = !todo.done

    if (todo.done) {
      if (todo.timings.length === 0) {
        const timing = { start: Date.now(), end: Date.now(), quantity: todo.quantity, unit: todo.unit }
        todo.timings.push(timing)
        entry.timingAction = 'pushed'
        entry.timing = { ...timing }
      } else {
        const last = todo.timings[todo.timings.length - 1]
        entry.timingAction = 'modified'
        entry.prev = { end: last.end, quantity: last.quantity, unit: last.unit }
        last.end = Date.now()
        last.quantity = todo.quantity
        last.unit = todo.unit
        entry.next = { end: last.end, quantity: last.quantity, unit: last.unit }
      }
    } else {
      const timing = { start: Date.now() }
      todo.timings.push(timing)
      entry.timingAction = 'pushed'
      entry.timing = { ...timing }
    }

    undoStack.push(entry)
    for (let i = redoStack.length - 1; i >= 0; i--) {
      if (redoStack[i].todoId === id) redoStack.splice(i, 1)
    }
    updateTodoAverage(todo)
  }

  const removeTodo = (listId, id) => {
    const list = findListById(listId)
    if (!list) return
    list.todos = list.todos.filter((t) => t.id !== id)
    pruneHistoryStacksForTodo(undoStack, redoStack, id)
  }

  const renameTodo = (listId, id, text) => {
    const todo = findTodo(listId, id)
    if (todo) todo.text = (text || 'Sans titre').trim()
  }

  const setQuantity = (listId, id, quantity) => {
    const todo = findTodo(listId, id)
    if (todo) {
      todo.quantity = Math.max(0.1, quantity)
      updateTodoAverage(todo)
    }
  }

  const setUnit = (listId, id, newUnit, conversionFactor = null, newQty = null) => {
    const todo = findTodo(listId, id)
    if (!todo) return

    const entry = {
      type: 'unit-change',
      listId, todoId: id,
      oldUnit: todo.unit,
      newUnit,
      oldQuantity: todo.quantity,
      newQuantity: newQty != null ? Math.max(0.1, newQty) : todo.quantity,
      oldConversions: JSON.parse(JSON.stringify(todo.conversions ?? {})),
    }

    const oldUnit = todo.unit
    if (conversionFactor != null) {
      if (!todo.conversions) todo.conversions = {}
      const fromBase = getBaseUnit(oldUnit)
      const toBase = getBaseUnit(newUnit)
      const baseFactor = conversionFactor * unitScale(newUnit) / unitScale(oldUnit)
      todo.conversions[`${fromBase}:${toBase}`] = baseFactor
    }
    todo.unit = newUnit
    if (newQty != null) todo.quantity = Math.max(0.1, newQty)

    entry.newConversions = JSON.parse(JSON.stringify(todo.conversions))

    undoStack.push(entry)
    for (let i = redoStack.length - 1; i >= 0; i--) {
      if (redoStack[i].todoId === id) redoStack.splice(i, 1)
    }
    updateTodoAverage(todo)
  }

  const undoLastAction = () => {
    while (undoStack.length > 0) {
      const entry = undoStack[undoStack.length - 1]
      const todo = findTodoByStableIdForHistory(entry.todoId)
      if (!todo) {
        undoStack.pop()
        continue
      }
      undoStack.pop()
      applyUndo(entry, todo)
      redoStack.push(entry)
      return
    }
  }

  const redoLastAction = () => {
    while (redoStack.length > 0) {
      const entry = redoStack[redoStack.length - 1]
      const todo = findTodoByStableIdForHistory(entry.todoId)
      if (!todo) {
        redoStack.pop()
        continue
      }
      redoStack.pop()
      applyRedo(entry, todo)
      undoStack.push(entry)
      return
    }
  }

  const undoTodoAction = (_listId, todoId) => {
    const chain = todoUndoChains.value[String(todoId)]
    const entry = chain?.[chain.length - 1]
    if (!entry) return
    const i = undoStack.lastIndexOf(entry)
    if (i === -1) return
    undoStack.splice(i, 1)
    const todo = findTodoByStableIdForHistory(entry.todoId)
    if (!todo) return
    applyUndo(entry, todo)
    redoStack.push(entry)
  }

  const redoTodoAction = (_listId, todoId) => {
    const chain = todoRedoChains.value[String(todoId)]
    const entry = chain?.[chain.length - 1]
    if (!entry) return
    const i = redoStack.lastIndexOf(entry)
    if (i === -1) return
    redoStack.splice(i, 1)
    const todo = findTodoByStableIdForHistory(entry.todoId)
    if (!todo) return
    applyRedo(entry, todo)
    undoStack.push(entry)
  }

  const canUndoTodo = (todoId) => undoDepthForTodo(todoId) > 0

  const canRedoTodo = (todoId) => redoDepthForTodo(todoId) > 0

  const canUndo = computed(() => undoStack.length > 0)
  const canRedo = computed(() => redoStack.length > 0)

  const now = ref(Date.now())

  const refreshNow = () => {
    now.value = Date.now()
  }

  const toDisplayTodo = (todo) => {
    const raw = getProgress(todo, now.value)
    return {
      ...todo,
      x: Math.round((Math.min(1, raw) - (Math.max(1, raw) - 1)) * 100) / 100,
      progress: Math.round(Math.min(1, raw) * 100) / 100,
      formattedInterval: formatMs(todo.averageIntervalMs),
    }
  }

  const sortByProgress = (a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.done) return b.x - a.x
    return 0
  }

  const shoppingTodos = computed(() => {
    if (!shoppingMode.value) return []
    const byKey = new Map()
    for (const list of lists.value) {
      for (const t of list.todos) {
        if (!t.done) {
          const key = todoShoppingKey(list.id, t.id)
          byKey.set(key, { ...toDisplayTodo(t), listId: list.id, listName: list.name })
        }
      }
    }
    const ordered = []
    for (const key of shoppingOrder.value) {
      const item = byKey.get(key)
      if (item) {
        ordered.push(item)
        byKey.delete(key)
      }
    }
    for (const item of byKey.values()) ordered.push(item)
    return ordered
  })

  const displayLists = computed(() => {
    const mapped = lists.value.map((list) => {
      const todos = shoppingMode.value
        ? list.todos.filter((t) => t.done)
        : list.todos
      const displayed = [...todos].map(toDisplayTodo)
      return {
        ...list,
        displayTodos: manualSort.value ? displayed : displayed.sort(sortByProgress),
      }
    })
    return shoppingMode.value
      ? mapped.filter((list) => list.displayTodos.length > 0)
      : mapped
  })

  const allTodoTexts = computed(() =>
    lists.value.flatMap((l) =>
      l.todos.map((t) => ({ text: t.text, listName: l.name, listId: l.id, todoId: t.id }))
    )
  )

  const uncheckedCount = computed(() =>
    lists.value.reduce((sum, l) => sum + l.todos.filter((t) => !t.done).length, 0)
  )

  const hasAnyUnchecked = computed(() => uncheckedCount.value > 0)

  watch(
    hasAnyUnchecked,
    (value, oldValue) => {
      if (!value && shoppingMode.value) {
        shoppingMode.value = false
        if (oldValue !== undefined) confettiTrigger.value++
      }
    },
    { immediate: true },
  )

  const toggleShoppingMode = () => {
    shoppingMode.value = !shoppingMode.value
  }

  const toggleManualSort = () => {
    manualSort.value = !manualSort.value
    storage.setString(STORAGE_KEYS.SORT_MODE, manualSort.value ? 'manual' : 'auto')
  }

  const toggleShoppingManualSort = () => {
    shoppingManualSort.value = !shoppingManualSort.value
    if (shoppingManualSort.value) syncShoppingOrder()
  }

  instance = {
    lists,
    shoppingMode,
    manualSort,
    shoppingManualSort,
    confettiTrigger,
    uncheckedCount,
    displayLists,
    shoppingTodos,
    allTodoTexts,
    addList,
    removeList,
    renameList,
    moveList,
    moveTodo,
    moveShoppingTodo,
    addTodo,
    toggleTodo,
    removeTodo,
    renameTodo,
    setQuantity,
    setUnit,
    undoLastAction,
    redoLastAction,
    undoTodoAction,
    redoTodoAction,
    canUndo,
    canRedo,
    canUndoTodo,
    canRedoTodo,
    toggleShoppingMode,
    toggleManualSort,
    toggleShoppingManualSort,
    refreshNow,
  }

  return instance
}
