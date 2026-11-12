/**
 * Ordre d'affichage des catégories en mode courses.
 * Indépendant de l'ordre des listes hors mode courses.
 */

export function alignShoppingCategoryOrder(listIds, storedOrder) {
  const known = new Set(listIds)
  const kept = []
  const seen = new Set()
  if (Array.isArray(storedOrder)) {
    for (const id of storedOrder) {
      if (!known.has(id) || seen.has(id)) continue
      kept.push(id)
      seen.add(id)
    }
  }
  for (const id of listIds) {
    if (!seen.has(id)) kept.push(id)
  }
  return kept
}

/**
 * Déplace une catégorie avant ou après une autre.
 * L'index est calculé après le retrait, donc « après » place bien la catégorie sous la cible.
 */
export function moveShoppingCategoryOrder(order, fromListId, toListId, place = 'before') {
  if (fromListId === toListId) return order
  const fromIndex = order.indexOf(fromListId)
  const toIndex = order.indexOf(toListId)
  if (fromIndex === -1 || toIndex === -1) return order
  const next = order.slice()
  const [moved] = next.splice(fromIndex, 1)
  let insertAt = next.indexOf(toListId)
  if (insertAt === -1) return order
  if (place === 'after') insertAt += 1
  next.splice(insertAt, 0, moved)
  return next
}
