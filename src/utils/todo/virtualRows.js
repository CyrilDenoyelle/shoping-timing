/**
 * Liste plate pour virtualisation fenêtre (headers + todos + pied).
 */

export function buildVirtualRows({
  shoppingMode = false,
  shoppingTodos = [],
  displayLists = [],
  manualSort = false,
}) {
  const rows = []

  if (shoppingMode && shoppingTodos.length) {
    for (let si = 0; si < shoppingTodos.length; si++) {
      const todo = shoppingTodos[si]
      rows.push({
        type: 'shopping-todo',
        key: `s-${todo.listId}-${todo.id}`,
        todo,
        shoppingIndex: si,
      })
    }
    rows.push({ type: 'shopping-end', key: 'shopping-end' })
  }

  for (let listIndex = 0; listIndex < displayLists.length; listIndex++) {
    const list = displayLists[listIndex]
    rows.push({
      type: 'list-header',
      key: `h-${list.id}`,
      list,
      listId: list.id,
      listIndex,
      isFirstList: listIndex === 0 && !(shoppingMode && shoppingTodos.length),
    })

    const todos = list.displayTodos ?? []
    if (!todos.length) {
      if (manualSort) {
        rows.push({
          type: 'list-empty',
          key: `e-${list.id}`,
          listId: list.id,
          todoCount: 0,
        })
      }
    } else {
      for (let todoIndex = 0; todoIndex < todos.length; todoIndex++) {
        const todo = todos[todoIndex]
        rows.push({
          type: 'todo',
          key: `t-${list.id}-${todo.id}`,
          listId: list.id,
          list,
          todo,
          todoIndex,
          compact: !!(shoppingMode && todo.done),
        })
      }
    }
  }

  rows.push({ type: 'add-list', key: 'add-list' })
  return rows
}

export function estimateRowSize(row) {
  switch (row.type) {
    case 'list-header':
      return row.isFirstList ? 36 : 60
    case 'shopping-todo':
      return 44
    case 'todo':
      return row.compact ? 28 : 44
    case 'list-empty':
      return 22
    case 'shopping-end':
      return 24
    case 'add-list':
      return 56
    default:
      return 44
  }
}

/**
 * Bounds document des listes à partir des mesures TanStack.
 * Avec scrollMargin = offsetTop du conteneur, measurement.start ≈ Y document.
 */
export function listBoundsFromMeasurements(rows, measurements) {
  const bounds = []
  if (!measurements?.length) return bounds

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.type !== 'list-header') continue
    const m = measurements[i]
    if (!m) continue

    let end = m.end
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j]
      if (
        next.type === 'list-header' ||
        next.type === 'add-list' ||
        next.type === 'shopping-todo' ||
        next.type === 'shopping-end'
      ) {
        break
      }
      const mj = measurements[j]
      if (mj) end = mj.end
    }

    bounds.push({
      id: row.listId,
      top: m.start,
      span: Math.max(end - m.start, m.size),
    })
  }

  return bounds
}

export function findTodoRowIndex(rows, listId, todoId) {
  return rows.findIndex(
    (r) =>
      (r.type === 'todo' && r.listId === listId && r.todo.id === todoId) ||
      (r.type === 'shopping-todo' && r.todo.listId === listId && r.todo.id === todoId),
  )
}

export function findListHeaderRowIndex(rows, listId) {
  return rows.findIndex((r) => r.type === 'list-header' && r.listId === listId)
}
