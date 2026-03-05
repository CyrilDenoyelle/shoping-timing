import { ref, watch, computed, onMounted, onUnmounted } from 'vue'

const STORAGE_KEY = 'shoping-timing-lists'
const LEGACY_STORAGE_KEY = 'shoping-timing-todos'

const TWO_MINUTES_MS = 2 * 60 * 1000

const defaultLists = [
  {
    id: 'default',
    name: 'Ma liste',
    todos: [
      { id: 1, text: 'Apprendre Vue.js', done: true, timings: [[Date.now(), Date.now() + TWO_MINUTES_MS]], averageIntervalMs: TWO_MINUTES_MS },
      { id: 2, text: 'Créer une todo list', done: true, timings: [[Date.now(), Date.now() + TWO_MINUTES_MS]], averageIntervalMs: TWO_MINUTES_MS },
      { id: 3, text: 'Profiter du framework', done: false, timings: [], averageIntervalMs: Infinity },
    ],
  },
]

function computeAverageIntervalMs(todo) {
  const timings = todo.timings ?? []
  if (timings.length < 2) return Infinity
  const intervals = timings
    .map((t, i, arr) => i === 0 ? undefined : t[1] - arr[i - 1][1])
    .slice(1)
    .filter((i) => !Number.isNaN(i))
  if (intervals.length === 0) return Infinity
  return intervals.reduce((a, b) => a + b, 0) / intervals.length
}

function updateTodoAverage(todo) {
  todo.averageIntervalMs = computeAverageIntervalMs(todo)
}

function formatMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null
  if (ms < 60_000) return '< 1 min'
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
  const lastStarted = new Date(timings[timings.length - 1][1]).getTime()
  const elapsed = now - lastStarted
  const progress = Math.ceil((elapsed / todo.averageIntervalMs) * 10) / 10
  return Math.max(0, progress - 0.3)
}

function migrateTodo(todo) {
  if (!Array.isArray(todo.timings)) {
    todo.timings = []
  }
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
    })
  }

  const toggleTodo = (listId, id) => {
    const list = findListById(listId)
    if (!list) return
    const todo = list.todos.find((t) => t.id === id)
    if (!todo) return
    todo.done = !todo.done
    if (todo.done) {
      if (todo.timings.length === 0) {
        todo.timings.push([Date.now(), Date.now()])
      } else {
        todo.timings[todo.timings.length - 1].push(Date.now())
      }
      updateTodoAverage(todo)
    } else {
      todo.timings.push([Date.now()])
      updateTodoAverage(todo)
    }
  }

  const removeTodo = (listId, id) => {
    const list = findListById(listId)
    if (!list) return
    list.todos = list.todos.filter((t) => t.id !== id)
  }

  const renameTodo = (listId, id, text) => {
    const list = findListById(listId)
    if (!list) return
    const todo = list.todos.find((t) => t.id === id)
    if (todo) todo.text = (text || 'Sans titre').trim()
  }

  const undoLastTiming = (listId, id) => {
    const list = findListById(listId)
    if (!list) return
    const todo = list.todos.find((t) => t.id === id)
    if (!todo || !todo.timings?.length) return
    todo.timings.pop()
    if (todo.timings.length === 0) {
      todo.done = false
    } else {
      const last = todo.timings[todo.timings.length - 1]
      todo.done = last.length === 2
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

  const displayLists = computed(() => {
    const mapped = lists.value.map((list) => ({
      ...list,
      hasUnchecked: list.todos.some((t) => !t.done),
      displayTodos: [...list.todos].map(toDisplayTodo).sort(sortByProgress),
    }))
    if (!shoppingMode.value) return mapped
    return mapped.sort((a, b) => {
      if (a.hasUnchecked === b.hasUnchecked) return 0
      return a.hasUnchecked ? -1 : 1
    })
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
    addList,
    removeList,
    renameList,
    moveList,
    setActiveList,
    addTodo,
    toggleTodo,
    removeTodo,
    renameTodo,
    undoLastTiming,
    toggleShoppingMode,
    refreshNow,
  }

  return instance
}
