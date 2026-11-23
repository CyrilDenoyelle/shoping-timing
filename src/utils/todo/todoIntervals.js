import { convertQuantity } from '@/utils/todo/units.js'
import { DAY } from '@/utils/time.js'

const NO_STATS = { averageMs: Infinity, stdDevMs: null, usedCount: 0, totalCount: 0 }

// --- Filtrage des intervalles aberrants (pauses hors saison, achats très anticipés) ---
// Sous ce nombre d'intervalles, aucune médiane fiable : tout est conservé.
const MIN_SAMPLES_FOR_OUTLIER_FILTER = 3
// Un intervalle est écarté au-delà de K écarts robustes de la médiane (échelle logarithmique).
const OUTLIER_K = 3
// Convertit un MAD (écart absolu médian) en équivalent d'écart-type pour une loi normale.
const MAD_TO_SIGMA = 1.4826
// Plancher de l'écart robuste : un produit très régulier (MAD nul) tolère un facteur ≈ 3,4.
const MIN_LOG_SPREAD = Math.log(1.5)
// Nombre minimal d'intervalles conservés après exclusion des aberrants.
const MIN_KEPT = 2
// Jusqu'à ce nombre d'intervalles retenus, aucun rognage supplémentaire.
const KEEP_ALL_UP_TO = 6
// Au-delà, on garde max(KEEP_ALL_UP_TO, ⌈2/3 × n⌉) intervalles, les plus proches de la médiane.

/**
 * Médiane pondérée (médiane basse) : première valeur triée dont le poids cumulé atteint la moitié du total.
 * Les deux tableaux doivent être non vides et de même longueur.
 */
export function weightedMedian(values, weights) {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
  const half = weights.reduce((sum, w) => sum + w, 0) / 2
  let cumulative = 0
  for (const i of order) {
    cumulative += weights[i]
    if (cumulative >= half) return values[i]
  }
  return values[order[order.length - 1]]
}

/**
 * Intervalles exploitables : durée, quantité (poids), taux en ms par unité,
 * et dates de l'achat qui ouvre (`from`) et ferme (`at`) l'intervalle.
 */
function collectSamples(todo) {
  const timings = todo.timings ?? []
  const currentUnit = todo.unit || ''
  const conversions = todo.conversions ?? {}
  const samples = []
  for (let i = 0; i < timings.length - 1; i++) {
    const t = timings[i]
    const tNext = timings[i + 1]
    if (t.end == null || tNext.end == null) continue
    const interval = tNext.end - t.end
    if (interval <= 0) continue
    const qty = convertQuantity(t.quantity ?? 1, t.unit ?? '', currentUnit, conversions)
    if (qty <= 0) continue
    samples.push({ from: t.end, at: tNext.end, interval, qty, rate: interval / qty })
  }
  return samples
}

/** Parmi `indices`, garde les `count` plus proches (distance minimale) ; à égalité, le plus récent. */
function takeClosest(indices, distances, count) {
  return [...indices]
    .sort((a, b) => distances[a] - distances[b] || b - a)
    .slice(0, count)
}

/**
 * @typedef {'too-long' | 'too-short' | 'trimmed'} ExclusionReason
 * - too-long / too-short : taux hors de la plage tolérée autour de la médiane ;
 * - trimmed : dans la plage, mais écarté par la règle des ⌈2/3⌉ les plus proches de la médiane.
 */

/**
 * Décide quels intervalles représentent le rythme du produit :
 * 1. exclut ceux dont le taux s'éloigne trop de la médiane pondérée (seuil adaptatif à la dispersion du produit) ;
 * 2. garantit au moins MIN_KEPT intervalles ;
 * 3. au-delà de KEEP_ALL_UP_TO, ne garde que les ⌈2/3⌉ les plus proches de la médiane.
 * `median`, `lowerRate` et `upperRate` valent null quand le filtre ne s'applique pas (moins de 3 intervalles).
 * @returns {{ used: boolean[], reasons: (ExclusionReason | null)[], median: number | null, lowerRate: number | null, upperRate: number | null }}
 */
function classifySamples(samples) {
  const used = samples.map(() => true)
  const reasons = samples.map(() => null)
  if (samples.length < MIN_SAMPLES_FOR_OUTLIER_FILTER) {
    return { used, reasons, median: null, lowerRate: null, upperRate: null }
  }

  const weights = samples.map((s) => s.qty)
  const median = weightedMedian(samples.map((s) => s.rate), weights)
  // Distance logarithmique : « 3× plus long » et « 3× plus court » sont à égale distance.
  const distances = samples.map((s) => Math.abs(Math.log(s.rate / median)))
  const spread = Math.max(MAD_TO_SIGMA * weightedMedian(distances, weights), MIN_LOG_SPREAD)
  const limit = OUTLIER_K * spread

  const all = samples.map((_, i) => i)
  let kept = all.filter((i) => distances[i] <= limit)
  for (const i of all) {
    if (distances[i] > limit) reasons[i] = samples[i].rate > median ? 'too-long' : 'too-short'
  }
  if (kept.length < MIN_KEPT) {
    kept = takeClosest(all, distances, MIN_KEPT)
    for (const i of kept) reasons[i] = null
  }
  if (kept.length > KEEP_ALL_UP_TO) {
    const target = Math.max(KEEP_ALL_UP_TO, Math.ceil((2 * kept.length) / 3))
    const retained = new Set(takeClosest(kept, distances, target))
    for (const i of kept) if (!retained.has(i)) reasons[i] = 'trimmed'
  }
  for (const i of all) used[i] = reasons[i] == null

  return {
    used,
    reasons,
    median,
    lowerRate: median * Math.exp(-limit),
    upperRate: median * Math.exp(limit),
  }
}

/** Moyenne pondérée et écart-type pondéré (Welford) des intervalles retenus, ramenés au sélecteur. */
function aggregateSamples(used, totalCount, scale) {
  let totalInterval = 0
  let totalQty = 0
  // Welford pondéré : variance des ms/unité accumulée dans le même passage que la moyenne
  let runningMean = 0
  let m2 = 0
  for (const { interval, qty, rate } of used) {
    totalInterval += interval
    totalQty += qty
    const prevMean = runningMean
    runningMean += (qty / totalQty) * (rate - prevMean)
    m2 += qty * (rate - prevMean) * (rate - runningMean)
  }
  // Temps moyen par unité (pondéré par les qty achetées) × stock cible du sélecteur
  const avgMsPerUnit = totalInterval / totalQty
  return {
    averageMs: avgMsPerUnit * scale,
    stdDevMs: used.length < 2 ? null : Math.sqrt(m2 / totalQty) * scale,
    usedCount: used.length,
    totalCount,
  }
}

/**
 * Analyse complète d'un produit : chaque intervalle (avec son poids, sa valeur ramenée au sélecteur,
 * s'il est utilisé ou la raison de son exclusion), la plage tolérée et les statistiques retenues.
 * Source unique pour le calcul du rythme et pour son affichage.
 *
 * Les valeurs `*Ms` ramenées au sélecteur (`scaledMs`, `lowerMs`, `upperMs`, `medianMs`) sont des durées
 * pour `scale` unités, comme `stats.averageMs`.
 * @returns {{
 *   samples: Array<{ from: number, at: number, interval: number, qty: number, rate: number, scaledMs: number, used: boolean, exclusion: ExclusionReason | null }>,
 *   scale: number,
 *   medianMs: number | null,
 *   lowerMs: number | null,
 *   upperMs: number | null,
 *   stats: { averageMs: number, stdDevMs: number | null, usedCount: number, totalCount: number },
 * }}
 */
export function analyzeIntervals(todo) {
  const scale = todo.quantity ?? 1
  const raw = collectSamples(todo)
  if (raw.length === 0) {
    return { samples: [], scale, medianMs: null, lowerMs: null, upperMs: null, stats: NO_STATS }
  }
  const { used, reasons, median, lowerRate, upperRate } = classifySamples(raw)
  const samples = raw.map((s, i) => ({
    ...s,
    scaledMs: s.rate * scale,
    used: used[i],
    exclusion: reasons[i],
  }))
  const scaled = (rate) => (rate == null ? null : rate * scale)
  return {
    samples,
    scale,
    medianMs: scaled(median),
    lowerMs: scaled(lowerRate),
    upperMs: scaled(upperRate),
    stats: aggregateSamples(raw.filter((_, i) => used[i]), raw.length, scale),
  }
}

export function computeIntervalStats(todo) {
  return analyzeIntervals(todo).stats
}

export function computeWeightedIntervalMs(todo) {
  return computeIntervalStats(todo).averageMs
}

export function updateTodoAverage(todo) {
  const { averageMs, stdDevMs } = computeIntervalStats(todo)
  todo.averageIntervalMs = averageMs
  todo.intervalStdDevMs = stdDevMs
}

export function formatMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null
  if (ms < 60_000) return `${Math.round(ms / 1_000)} sec`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`
  if (ms < DAY) return `${Math.round(ms / 3_600_000)}h`
  if (ms < 7 * DAY) return `${Math.round(ms / DAY)} j`
  if (ms < 30 * DAY) return `${Math.round(ms / (7 * DAY))} sem`
  return `${Math.round(ms / (30 * DAY))} mois`
}

export function getProgress(todo, now) {
  if (!todo.done) return 1
  const timings = todo.timings ?? []
  if (
    timings.length === 0 ||
    !Number.isFinite(todo.averageIntervalMs) ||
    todo.averageIntervalMs <= 0
  ) {
    return 0
  }
  const lastEnd = timings[timings.length - 1].end
  if (lastEnd == null) return 0
  const elapsed = now - lastEnd
  // Part du délai moyen écoulée depuis le dernier achat : 0 = acheté, 1 = stock censé fini
  return Math.max(0, elapsed / todo.averageIntervalMs)
}
