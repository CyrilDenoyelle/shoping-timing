import { ref, watch, computed } from 'vue'

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

// Shared singleton state
const shoppingMode = ref(false)
const confettiTrigger = ref(0)
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

  const activeList = computed(() =>
    lists.value.find((l) => l.id === activeListId.value)
  )

  const todos = computed(() => activeList.value?.todos ?? [])

  const findListById = (listId) => lists.value.find((l) => l.id === listId)

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
    lists.value.splice(idx, 1)
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

  const toggleTodo = (listId, id) => {
    const todo = findTodo(listId, id)
    if (!todo) return
    todo.done = !todo.done
    if (todo.done) {
      if (todo.timings.length === 0) {
        todo.timings.push({ start: Date.now(), end: Date.now(), quantity: todo.quantity, unit: todo.unit })
      } else {
        const last = todo.timings[todo.timings.length - 1]
        last.end = Date.now()
        last.quantity = todo.quantity
        last.unit = todo.unit
      }
    } else {
      todo.timings.push({ start: Date.now() })
    }
    updateTodoAverage(todo)
  }

  const removeTodo = (listId, id) => {
    const list = findListById(listId)
    if (!list) return
    list.todos = list.todos.filter((t) => t.id !== id)
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

  const setUnit = (listId, id, newUnit, conversionFactor = null) => {
    const todo = findTodo(listId, id)
    if (!todo) return
    const oldUnit = todo.unit
    if (conversionFactor != null) {
      if (!todo.conversions) todo.conversions = {}
      const fromBase = getBaseUnit(oldUnit)
      const toBase = getBaseUnit(newUnit)
      const baseFactor = conversionFactor * unitScale(newUnit) / unitScale(oldUnit)
      todo.conversions[`${fromBase}:${toBase}`] = baseFactor
    }
    todo.unit = newUnit
    updateTodoAverage(todo)
  }

  const undoLastTiming = (listId, id) => {
    const todo = findTodo(listId, id)
    if (!todo || !todo.timings?.length) return
    const last = todo.timings[todo.timings.length - 1]
    todo.done = !todo.done
    if (last?.end != null) {
      delete last.end
      delete last.quantity
      delete last.unit
    } else {
      todo.timings.pop()
    }
    updateTodoAverage(todo)
  }

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

  const displayTodos = computed(() =>
    [...todos.value].map(toDisplayTodo).sort(sortByProgress)
  )

  const shoppingTodos = computed(() => {
    if (!shoppingMode.value) return []
    return lists.value.flatMap((list) =>
      list.todos
        .filter((t) => !t.done)
        .map((t) => ({ ...toDisplayTodo(t), listId: list.id, listName: list.name }))
    )
  })

  const displayLists = computed(() => {
    const mapped = lists.value.map((list) => {
      const todos = shoppingMode.value
        ? list.todos.filter((t) => t.done)
        : list.todos
      return {
        ...list,
        displayTodos: [...todos].map(toDisplayTodo).sort(sortByProgress),
      }
    })
    return mapped
  })

  const hasAnyUnchecked = computed(() =>
    lists.value.some((l) => l.todos.some((t) => !t.done))
  )

  watch(hasAnyUnchecked, (value) => {
    if (!value && shoppingMode.value) {
      shoppingMode.value = false
      confettiTrigger.value++
    }
  })

  const toggleShoppingMode = () => {
    shoppingMode.value = !shoppingMode.value
  }

  instance = {
    lists,
    activeListId,
    activeList,
    shoppingMode,
    confettiTrigger,
    displayTodos,
    displayLists,
    shoppingTodos,
    addList,
    removeList,
    renameList,
    moveList,
    setActiveList,
    addTodo,
    toggleTodo,
    removeTodo,
    renameTodo,
    setQuantity,
    setUnit,
    undoLastTiming,
    toggleShoppingMode,
    refreshNow,
  }

  return instance
}
