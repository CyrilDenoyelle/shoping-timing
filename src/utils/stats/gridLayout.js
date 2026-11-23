/**
 * Répartition équilibrée de cartes en rangées.
 *
 * La grille CSS compte GRID_COLUMNS colonnes ; une carte occupe `GRID_COLUMNS / taille de sa rangée` colonnes.
 * 12 est divisible par 1, 2, 3 et 4 : chaque rangée remplit toute la largeur, sans carte orpheline.
 */
export const GRID_COLUMNS = 12
export const MAX_COLUMNS = 4

const clampColumns = (value) => {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return 1
  return Math.min(Math.max(n, 1), MAX_COLUMNS)
}

/**
 * Nombre maximal de cartes par rangée pour une largeur donnée.
 * @param {number} width largeur disponible en px
 * @param {{ minColumnWidth?: number, gap?: number, maxColumns?: number }} [options]
 */
export function columnsForWidth(width, { minColumnWidth = 320, gap = 10, maxColumns = MAX_COLUMNS } = {}) {
  if (!Number.isFinite(width) || width <= 0) return 1
  const fit = Math.floor((width + gap) / (minColumnWidth + gap))
  return Math.min(Math.max(fit, 1), clampColumns(maxColumns))
}

/**
 * Taille de chaque rangée : le nombre de rangées est le minimum nécessaire, puis les cartes sont
 * réparties à parts égales (les premières rangées reçoivent le surplus).
 * Exemple avec 7 cartes : 3 colonnes max → [3, 2, 2] ; 4 colonnes max → [4, 3].
 * @returns {number[]}
 */
export function balancedRows(count, maxColumns) {
  if (!Number.isFinite(count) || count <= 0) return []
  const columns = clampColumns(maxColumns)
  const rows = Math.ceil(count / columns)
  const base = Math.floor(count / rows)
  const extra = count % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

/** Nombre de colonnes de grille (sur GRID_COLUMNS) occupées par chaque carte, dans l'ordre d'affichage. */
export function cardSpans(count, maxColumns) {
  return balancedRows(count, maxColumns).flatMap((size) => Array(size).fill(GRID_COLUMNS / size))
}

/**
 * Même répartition quand une carte est agrandie : elle occupe seule une rangée pleine largeur, et les cartes
 * qui la précèdent, comme celles qui la suivent, forment chacune leurs propres rangées équilibrées.
 * L'ordre des cartes ne change pas : `focusIndex` désigne la carte agrandie dans l'ordre d'affichage.
 * Un indice absent ou hors limites donne la répartition normale.
 */
export function cardSpansAround(count, focusIndex, maxColumns) {
  if (!Number.isInteger(focusIndex) || focusIndex < 0 || focusIndex >= count) return cardSpans(count, maxColumns)
  return [
    ...cardSpans(focusIndex, maxColumns),
    GRID_COLUMNS,
    ...cardSpans(count - focusIndex - 1, maxColumns),
  ]
}
