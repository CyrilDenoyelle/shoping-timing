/**
 * Choisit les indices d'axe X à graduer (points espacés uniformément).
 * Inclut les bornes et, si possible, le point le plus haut (intervalle le plus long).
 *
 * @param {{ x: number, y?: number }[]} points
 * @param {number} xMin
 * @param {number} xMax
 * @param {number} [maxTicks=6]
 * @returns {number[]}
 */
export function pickRhythmXTicks(points, xMin, xMax, maxTicks = 6) {
  const visible = points
    .filter((p) => Number.isFinite(p.x) && p.x >= xMin && p.x <= xMax)
    .sort((a, b) => a.x - b.x)

  if (visible.length === 0) return []
  if (visible.length <= maxTicks) return visible.map((p) => p.x)

  const picked = new Set([visible[0].x, visible[visible.length - 1].x])

  // Mettre en avant l'intervalle le plus long (ex. pause hors saison).
  let peak = visible[0]
  for (const p of visible) {
    if ((p.y ?? 0) > (peak.y ?? 0)) peak = p
  }
  picked.add(peak.x)

  const target = Math.min(maxTicks, visible.length)
  while (picked.size < target) {
    const ordered = [...picked].sort((a, b) => a - b)
    let best = null
    let bestScore = -1
    for (let i = 0; i < ordered.length - 1; i++) {
      const lo = ordered[i]
      const hi = ordered[i + 1]
      for (const p of visible) {
        if (p.x <= lo || p.x >= hi || picked.has(p.x)) continue
        const score = Math.min(p.x - lo, hi - p.x)
        if (score > bestScore) {
          bestScore = score
          best = p.x
        }
      }
    }
    if (best == null) break
    picked.add(best)
  }

  return [...picked].sort((a, b) => a - b)
}
