export function todoShoppingKey(listId, todoId) {
  return `${listId}:${todoId}`
}

export function parseShoppingKey(key) {
  const i = key.lastIndexOf(':')
  return { listId: key.slice(0, i), todoId: Number(key.slice(i + 1)) }
}
