/**
 * Vérifications et totaux d'un ticket parsé. Fonctions pures, montants en centimes.
 */

/**
 * @param {Array<{ totalCents: number, discountCents?: number, quantity: number, uncertain: boolean, quantityMismatch: boolean }>} products
 * @param {{ declaredTotalCents?: number | null, declaredCount?: number | null, declaredLineCount?: number | null }} [declared]
 *   declaredCount : nombre d'articles vendus ; declaredLineCount : nombre de lignes produits.
 */
export function summarizeReceipt(
  products,
  { declaredTotalCents = null, declaredCount = null, declaredLineCount = null } = {},
) {
  const sumCents = products.reduce((sum, p) => sum + p.totalCents - (p.discountCents ?? 0), 0)
  const articleCount = products.reduce((sum, p) => sum + (p.quantity ?? 1), 0)
  const hasTotal = declaredTotalCents != null
  const articlesMatch = declaredCount != null && declaredCount === articleCount
  const linesMatch = declaredLineCount != null && declaredLineCount === products.length

  return {
    productCount: products.length,
    sumCents,
    articleCount,
    declaredTotalCents,
    declaredCount,
    declaredLineCount,
    differenceCents: hasTotal ? declaredTotalCents - sumCents : null,
    totalMatches: hasTotal && declaredTotalCents === sumCents,
    countMatches: articlesMatch || linesMatch,
    countKind: articlesMatch ? 'articles' : linesMatch ? 'lignes' : null,
    flaggedCount: products.filter((p) => p.uncertain || p.quantityMismatch).length,
  }
}

/**
 * Choisit la lecture la plus cohérente parmi plusieurs passes OCR.
 * Priorité : total cohérent, puis nombre d'articles ou de lignes cohérent, puis plus petit écart
 * avec le total, puis moins de lignes signalées.
 * @param {Array<{ id: string, label: string, products: unknown[], summary: ReturnType<typeof summarizeReceipt> }>} passes
 */
export function pickBestPass(passes) {
  const gap = (p) => (p.summary.differenceCents == null ? Infinity : Math.abs(p.summary.differenceCents))
  const best =
    [...passes].sort(
      (a, b) =>
        Number(b.summary.totalMatches) - Number(a.summary.totalMatches) ||
        Number(b.summary.countMatches) - Number(a.summary.countMatches) ||
        gap(a) - gap(b) ||
        a.summary.flaggedCount - b.summary.flaggedCount,
    )[0] ?? null

  if (!best) return { best: null, reason: 'Aucune lecture disponible.' }

  const countLabel = best.summary.countKind === 'lignes' ? 'de lignes' : 'd’articles'
  if (best.summary.totalMatches && best.summary.countMatches) {
    const plural = best.summary.countKind === 'lignes' ? 'de lignes cohérents' : 'd’articles cohérents'
    return { best, reason: `Total et nombre ${plural}.` }
  }
  if (best.summary.declaredTotalCents == null) {
    return { best, reason: 'Total du ticket non lu : vérifier la somme à la main.' }
  }
  if (best.summary.countMatches) {
    return { best, reason: `Nombre ${countLabel} cohérent, total à vérifier.` }
  }
  return { best, reason: 'Aucune lecture ne satisfait les contrôles : à corriger à la main.' }
}
