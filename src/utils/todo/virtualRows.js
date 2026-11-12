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
    let lastListId = null
    let categoryIndex = 0
    let lastShoppingTodo = null
    for (const todo of shoppingTodos) {
      if (todo.listId !== lastListId) {
        if (lastShoppingTodo) lastShoppingTodo.isLastInCategory = true
        rows.push({
          type: 'shopping-category',
          key: `sc-${todo.listId}`,
          listId: todo.listId,
          listName: todo.listName,
          categoryIndex,
          isFirstCategory: categoryIndex === 0,
        })
        lastListId = todo.listId
        categoryIndex += 1
      }
      lastShoppingTodo = {
        type: 'shopping-todo',
        key: `s-${todo.listId}-${todo.id}`,
        listId: todo.listId,
        todo,
        isLastInCategory: false,
      }
      rows.push(lastShoppingTodo)
    }
    if (lastShoppingTodo) lastShoppingTodo.isLastInCategory = true
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
    case 'shopping-category':
      return row.isFirstCategory ? 32 : 48
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
