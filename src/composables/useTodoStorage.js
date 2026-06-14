import { ref, reactive, watch, computed } from 'vue'

const STORAGE_KEY = 'shoping-timing-lists'
const LEGACY_STORAGE_KEY = 'shoping-timing-todos'

const DAY = 86_400_000
const NOW = Date.now()

const UNIT_GROUPS = {
  mass:   { kg: 1000, g: 1 },
  volume: { L: 1000, cL: 10, mL: 1 },
}
export const UNITS = ['', 'pcs', 'kg', 'g', 'L', 'cL', 'mL']

export function getUnitGroup(unit) {
  if (unit === '') return 'none'
  for (const [name, group] of Object.entries(UNIT_GROUPS)) {
    if (group[unit] != null) return name
  }
  return unit
}

export function getBaseUnit(unit) {
  for (const group of Object.values(UNIT_GROUPS)) {
    if (group[unit] != null) {
      return Object.entries(group).find(([, v]) => v === 1)?.[0] ?? unit
    }
  }
  return unit
}

export function unitScale(unit) {
  for (const group of Object.values(UNIT_GROUPS)) {
    if (group[unit] != null) return group[unit]
  }
  return 1
}

export function needsConversionModal(fromUnit, toUnit) {
  if (fromUnit === toUnit) return false
  return getUnitGroup(fromUnit) !== getUnitGroup(toUnit)
}

function convertQuantity(qty, fromUnit, toUnit, conversions = {}) {
  if (fromUnit === toUnit) return qty
  for (const group of Object.values(UNIT_GROUPS)) {
    if (group[fromUnit] != null && group[toUnit] != null) {
      return qty * group[fromUnit] / group[toUnit]
    }
  }
  const fromBase = getBaseUnit(fromUnit)
  const toBase = getBaseUnit(toUnit)
  const key = `${fromBase}:${toBase}`
  const reverseKey = `${toBase}:${fromBase}`
  if (conversions[key] != null) {
    const qtyInFromBase = convertQuantity(qty, fromUnit, fromBase)
    return convertQuantity(qtyInFromBase * conversions[key], toBase, toUnit)
  }
  if (conversions[reverseKey] != null) {
    const qtyInFromBase = convertQuantity(qty, fromUnit, fromBase)
    return convertQuantity(qtyInFromBase / conversions[reverseKey], toBase, toUnit)
  }
  return qty
}

function demoTimings(intervalDays, count, agoFraction, done = true, quantity = 1, unit = '') {
  const interval = intervalDays * DAY
  const lastEnd = NOW - interval * agoFraction
  const timings = []
  for (let i = count; i >= 1; i--) {
    const end = lastEnd - interval * i
    timings.push({ start: end - 5000, end, quantity, unit })
  }
  if (done) {
    timings.push({ start: lastEnd - 5000, end: lastEnd, quantity, unit })
  } else {
    timings.push({ start: lastEnd - 5000 })
  }
  return { timings, quantity, unit, conversions: {} }
}

const defaultLists = [
  {id: 'demo-manger', name: 'Manger', todos: [
    { id: 1, text: 'Lait', done: true, ...demoTimings(4, 5, 0.9, true, 2, 'L') },
    { id: 2, text: 'Pain', done: true, ...demoTimings(2, 6, 0.3, true, 1, '') },
    { id: 3, text: 'Œufs', done: true, ...demoTimings(7, 4, 0.6, true, 6, 'pcs') },
    { id: 4, text: 'Beurre', done: true, ...demoTimings(14, 3, 0.75, true, 250, 'g') },
    { id: 5, text: 'Pâtes', done: false, ...demoTimings(10, 3, 0.4, false, 500, 'g') },
    { id: 6, text: 'Riz', done: false, ...demoTimings(21, 2, 0.1, false, 1, 'kg') },
    { id: 7, text: 'Fruits', done: false, ...demoTimings(5, 4, 0.2, false, 1, 'kg') },
  ]},
  {id: 'demo-maison', name: 'Maison', todos: [
    { id: 8, text: 'Éponges', done: true, ...demoTimings(30, 3, 0.85, true, 3, 'pcs') },
    { id: 9, text: 'Lessive', done: false, ...demoTimings(21, 2, 0.5, false, 2, 'L') },
    { id: 10, text: 'Liquide vaisselle', done: true, ...demoTimings(25, 3, 0.15, true, 500, 'mL') },
    { id: 11, text: 'Sacs poubelle', done: false, ...demoTimings(30, 2, 0.7, false, 1, '') },
    { id: 12, text: 'Sopalin', done: true, ...demoTimings(14, 4, 0.5, true, 6, 'pcs') },
  ]},
  {id: 'demo-hygiene', name: 'Hygiène', todos: [
    { id: 13, text: 'Dentifrice', done: true, ...demoTimings(45, 2, 0.65, true, 1, '') },
    { id: 14, text: 'Shampooing', done: false, ...demoTimings(30, 3, 0.35, false, 250, 'mL') },
    { id: 15, text: 'Savon', done: true, ...demoTimings(20, 3, 0.95, true, 1, '') },
  ]},
]

export function computeWeightedIntervalMs(todo) {
  const timings = todo.timings ?? []
  if (timings.length < 2) return Infinity
  const currentUnit = todo.unit || ''
  const conversions = todo.conversions ?? {}
  const rates = []
  for (let i = 0; i < timings.length - 1; i++) {
    const t = timings[i]
    const tNext = timings[i + 1]
    if (t.end == null || tNext.end == null) continue
    const interval = tNext.end - t.end
    if (interval <= 0) continue
    const qty = convertQuantity(t.quantity ?? 1, t.unit ?? '', currentUnit, conversions)
    rates.push(qty / interval)
  }
  if (rates.length === 0) return Infinity
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
  if (avgRate <= 0) return Infinity
  return (todo.quantity ?? 1) / avgRate
}

function updateTodoAverage(todo) {
  todo.averageIntervalMs = computeWeightedIntervalMs(todo)
}

export function formatMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null
  if (ms < 60_000) return `${Math.round(ms / 1_000)} sec`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`
  if (ms < 7 * 86_400_000) return `${Math.round(ms / 86_400_000)} j`
  if (ms < 30 * 86_400_000) return `${Math.round(ms / (7 * 86_400_000))} sem`
  return `${Math.round(ms / (30 * 86_400_000))} mois`
}

function getProgress(todo, now) {
  if (!todo.done) return 1
  const timings = todo.timings ?? []
  if (
    timings.length === 0 ||
    !Number.isFinite(todo.averageIntervalMs) ||
    todo.averageIntervalMs <= 0
  ) {
    return 0
  }
  const lastEnd = timings[timings.length - 1].end
  if (lastEnd == null) return 0
  const elapsed = now - lastEnd
  const progress = Math.ceil((elapsed / todo.averageIntervalMs) * 10) / 10
  return Math.max(0, progress - 0.5)
}

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

function loadFromStorage(storage = localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(migrateList)
    }
    const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY)
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

function saveToStorage(lists, storage = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(lists))
  } catch (e) {
    console.warn('Impossible de sauvegarder les listes:', e)
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

const SORT_MODE_KEY = 'shoping-timing-sort-mode'
const SHOPPING_MODE_KEY = 'shoping-timing-shopping-mode'
const SHOPPING_ORDER_KEY = 'shoping-timing-shopping-order'
const SHOPPING_MANUAL_SORT_KEY = 'shoping-timing-shopping-manual-sort'
const UNDO_STORAGE_KEY = 'shoping-timing-undo'
const REDO_STORAGE_KEY = 'shoping-timing-redo'
const MAX_PERSISTED_ACTIONS = 100

function loadStack(key) {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.slice(-MAX_PERSISTED_ACTIONS)
    }
  } catch {}
  return []
}

function saveStack(key, stack) {
  try {
    localStorage.setItem(key, JSON.stringify(stack.slice(-MAX_PERSISTED_ACTIONS)))
  } catch {}
}

// Shared singleton state
function readShoppingModeFromStorage() {
  try {
    const v = localStorage.getItem(SHOPPING_MODE_KEY)
    return v === '1' || v === 'true'
  } catch {
    return false
  }
}

const shoppingMode = ref(readShoppingModeFromStorage())
const manualSort = ref((() => {
  try { return localStorage.getItem(SORT_MODE_KEY) === 'manual' } catch { return false }
})())
const shoppingManualSort = ref((() => {
  try { return localStorage.getItem(SHOPPING_MANUAL_SORT_KEY) === '1' } catch { return false }
})())
const shoppingOrder = ref((() => {
  try {
    const raw = localStorage.getItem(SHOPPING_ORDER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
})())

const todoShoppingKey = (listId, todoId) => `${listId}:${todoId}`

function parseShoppingKey(key) {
  const i = key.lastIndexOf(':')
  return { listId: key.slice(0, i), todoId: Number(key.slice(i + 1)) }
}

function saveShoppingOrder(order) {
  try {
    localStorage.setItem(SHOPPING_ORDER_KEY, JSON.stringify(order))
  } catch {}
}
const confettiTrigger = ref(0)
const undoStack = reactive(loadStack(UNDO_STORAGE_KEY))
const redoStack = reactive(loadStack(REDO_STORAGE_KEY))
let instance = null

export function useTodoStorage(storage = localStorage) {
  if (instance) return instance

  const stored = loadFromStorage(storage)
  const lists = ref(stored ?? defaultLists)
  const activeListId = ref(lists.value[0]?.id ?? null)

  let nextTodoId = Math.max(0, ...lists.value.flatMap((l) => l.todos.map((t) => t.id))) + 1

  watch(
    lists,
    (newLists) => saveToStorage(newLists, storage),
    { deep: true }
  )

  watch(undoStack, () => saveStack(UNDO_STORAGE_KEY, undoStack))
  watch(redoStack, () => saveStack(REDO_STORAGE_KEY, redoStack))

  watch(shoppingMode, () => {
    try {
      localStorage.setItem(SHOPPING_MODE_KEY, shoppingMode.value ? '1' : '0')
    } catch {}
  })

  watch(shoppingManualSort, () => {
    try {
      localStorage.setItem(SHOPPING_MANUAL_SORT_KEY, shoppingManualSort.value ? '1' : '0')
    } catch {}
  })

  watch(shoppingOrder, (order) => saveShoppingOrder(order), { deep: true })

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

  watch(lists, syncShoppingOrder, { deep: true, immediate: true })

  const findListById = (listId) => lists.value.find((l) => l.id === listId)

  const isUncheckedShoppingKey = (key) => {
    const { listId, todoId } = parseShoppingKey(key)
    const todo = findListById(listId)?.todos.find((t) => t.id === todoId)
    return todo != null && !todo.done
  }

  /**
   * Vues mémoire : mêmes objets entrée que dans undoStack / redoStack (références partagées).
   * L’ordre dans chaque tableau suit l’ordre chronologique global des entrées pertinentes pour ce todo.
   * Une seule pile physique reste nécessaire pour que « annuler / rétablir global » et par-item
   * partagent la même liste d’entrées redo (redo toujours sur la même structure reactive).
   */
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

  const activeList = computed(() =>
    lists.value.find((l) => l.id === activeListId.value)
  )

  const todos = computed(() => activeList.value?.todos ?? [])

  const addList = (name) => {
    const trimmed = (name || 'Nouvelle liste').trim()
    const newList = {
      id: generateId(),
      name: trimmed,
      todos: [],
    }
    lists.value.push(newList)
    activeListId.value = newList.id
  }

  const removeList = (id) => {
    const idx = lists.value.findIndex((l) => l.id === id)
    if (idx === -1) return
    const [removed] = lists.value.splice(idx, 1)
    for (const t of removed.todos ?? []) pruneHistoryStacksForTodo(t.id)
    if (activeListId.value === id) {
      activeListId.value = lists.value[0]?.id ?? null
    }
  }

  const setActiveList = (id) => {
    activeListId.value = id
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
      syncHistoryStacksListIdsForTodo(moved.id, toList.id)
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
    // id unique dans toute l’app (undo/redo dépend de cette invariante)
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

  /**
   * Undo/redo reposent sur l’unicité globale des `todo.id` (voir `nextTodoId`).
   * On ne résout pas un todo via `entry.listId` : après un déplacement entre listes, seul `todoId` est fiable ;
   * `listId` dans l’entrée est une dénormalisation mise à jour sur `moveTodo`.
   */
  const findTodoByStableIdForHistory = (todoId) => {
    for (const l of lists.value) {
      const t = l.todos.find((x) => x.id === todoId)
      if (t) return t
    }
    return null
  }

  /** Après déplacement entre listes, aligner les entrées persistées avec la liste réelle du todo. */
  const syncHistoryStacksListIdsForTodo = (todoId, listId) => {
    for (const e of undoStack) {
      if (e.todoId === todoId) e.listId = listId
    }
    for (const e of redoStack) {
      if (e.todoId === todoId) e.listId = listId
    }
  }

  /** Suppression définitive : retirer l’historique lié au todo pour ne pas désynchroniser les piles. */
  const pruneHistoryStacksForTodo = (todoId) => {
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (undoStack[i].todoId === todoId) undoStack.splice(i, 1)
    }
    for (let i = redoStack.length - 1; i >= 0; i--) {
      if (redoStack[i].todoId === todoId) redoStack.splice(i, 1)
    }
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
    pruneHistoryStacksForTodo(id)
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

  const applyUndo = (entry, todo) => {
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

  const applyRedo = (entry, todo) => {
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

  const displayTodos = computed(() => {
    const displayed = [...todos.value].map(toDisplayTodo)
    return manualSort.value ? displayed : displayed.sort(sortByProgress)
  })

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
    return mapped
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
    try { localStorage.setItem(SORT_MODE_KEY, manualSort.value ? 'manual' : 'auto') } catch {}
  }

  const toggleShoppingManualSort = () => {
    shoppingManualSort.value = !shoppingManualSort.value
    if (shoppingManualSort.value) syncShoppingOrder()
  }

  instance = {
    lists,
    activeListId,
    activeList,
    shoppingMode,
    manualSort,
    shoppingManualSort,
    confettiTrigger,
    uncheckedCount,
    displayTodos,
    displayLists,
    shoppingTodos,
    allTodoTexts,
    addList,
    removeList,
    renameList,
    moveList,
    moveTodo,
    moveShoppingTodo,
    setActiveList,
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
    todoUndoChains,
    todoRedoChains,
    undoDepthForTodo,
    redoDepthForTodo,
    toggleShoppingMode,
    toggleManualSort,
    toggleShoppingManualSort,
    refreshNow,
  }

  return instance
}
