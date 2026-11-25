/**
 * Lignes plates pour virtualiser les cartes Rythmes (en-têtes + rangées de grille).
 */
import { GRID_COLUMNS, cardSpansAround } from '@/utils/stats/gridLayout.js'

/** Hauteur estimée d'une rangée de cartes (titre + résumé + graphique 180px). */
export const CARD_ROW_ESTIMATE_PX = 300
/** Hauteur estimée d'un bandeau de catégorie (padding + titre + marge basse). */
export const GROUP_HEADER_ESTIMATE_PX = 52
/** Écart vertical entre deux groupes (équivalent à .groups { gap }). */
export const GROUP_GAP_PX = 24

/**
 * Découpe les produits d'un groupe en rangées selon les spans de grille (somme = 12).
 * @param {{ key: string }[]} products
 * @param {number[]} spans
 * @returns {{ product: object, span: number }[][]}
 */
export function splitProductsIntoGridRows(products, spans) {
  const rows = []
  let current = []
  let filled = 0
  for (let i = 0; i < products.length; i++) {
    const span = spans[i] ?? GRID_COLUMNS
    current.push({ product: products[i], span })
    filled += span
    if (filled >= GRID_COLUMNS) {
      rows.push(current)
      current = []
      filled = 0
    }
  }
  if (current.length) rows.push(current)
  return rows
}

/**
 * Aplatit les groupes visibles en lignes virtualisables.
 * @param {{ listId: string, listName?: string, products: object[] }[]} groups
 * @param {number} columns
 * @param {string | null} [expandedKey]
 */
export function buildRhythmVirtualRows(groups, columns, expandedKey = null) {
  const rows = []
  if (!Array.isArray(groups)) return rows

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]
    const products = group.products ?? []
    const focusIndex = expandedKey
      ? products.findIndex((p) => p.key === expandedKey)
      : -1
    const spans = cardSpansAround(products.length, focusIndex, columns)

    rows.push({
      type: 'group-header',
      key: `h-${group.listId}`,
      listId: group.listId,
      listName: group.listName,
      productCount: products.length,
      isFirst: gi === 0,
    })

    const gridRows = splitProductsIntoGridRows(products, spans)
    for (let ri = 0; ri < gridRows.length; ri++) {
      const cards = gridRows[ri]
      rows.push({
        type: 'card-row',
        key: `r-${group.listId}-${ri}`,
        listId: group.listId,
        cards,
        hasExpanded: cards.some((c) => c.product.key === expandedKey),
      })
    }
  }

  return rows
}

/**
 * @param {{ type: string, isFirst?: boolean, hasExpanded?: boolean }} row
 * @param {number} [expandedHeightPx]
 */
export function estimateRhythmRowSize(row, expandedHeightPx = CARD_ROW_ESTIMATE_PX) {
  if (row?.type === 'group-header') {
    return GROUP_HEADER_ESTIMATE_PX + (row.isFirst ? 0 : GROUP_GAP_PX)
  }
  if (row?.type === 'card-row') {
    return row.hasExpanded ? expandedHeightPx : CARD_ROW_ESTIMATE_PX
  }
  return CARD_ROW_ESTIMATE_PX
}

export function findCardRowIndex(rows, productKey) {
  return rows.findIndex(
    (r) => r.type === 'card-row' && r.cards.some((c) => c.product.key === productKey),
  )
}
