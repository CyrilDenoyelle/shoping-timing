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
    .slice(1) // remove the first undefined
    .filter((i) => !Number.isNaN(i))
  if (intervals.length === 0) return Infinity
  return intervals.reduce((a, b) => a + b, 0) / intervals.length
}

function updateTodoAverage(todo) {
  todo.averageIntervalMs = computeAverageIntervalMs(todo)
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
  return Math.max(0, elapsed / todo.averageIntervalMs)
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

export function useTodoStorage(storage = localStorage) {
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
  let tickInterval

  onMounted(() => {
    tickInterval = setInterval(() => {
      now.value = Date.now()
    }, 1000 * 60) // 1 minute
  })

  onUnmounted(() => {
    clearInterval(tickInterval)
  })

  const sortedTodos = computed(() => {
    const n = now.value
    return [...todos.value].sort(
      (a, b) => getProgress(b, n) - getProgress(a, n)
    )
  })

  const displayTodos = computed(() => {
    const n = now.value
    return sortedTodos.value.map((todo) => ({
      ...todo,
      progress: getProgress(todo, n),
    }))
  })

  const displayLists = computed(() => {
    const n = now.value
    const mapped = lists.value.map((list) => {
      const sorted = [...list.todos].sort(
        (a, b) => getProgress(b, n) - getProgress(a, n)
      )
      const hasUnchecked = list.todos.some((t) => !t.done)
      return {
        ...list,
        hasUnchecked,
        displayTodos: sorted.map((todo) => ({
          ...todo,
          progress: getProgress(todo, n),
        })),
      }
    })
    return mapped.sort((a, b) => {
      if (a.hasUnchecked === b.hasUnchecked) return 0
      return a.hasUnchecked ? -1 : 1
    })
  })

  return {
    lists,
    activeListId,
    activeList,
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
  }
}
