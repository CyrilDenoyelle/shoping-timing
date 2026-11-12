import { convertQuantity } from '@/utils/todo/units.js'
import { DAY } from '@/utils/time.js'

const NO_STATS = { averageMs: Infinity, stdDevMs: null }

export function computeIntervalStats(todo) {
  const timings = todo.timings ?? []
  if (timings.length < 2) return NO_STATS
  const currentUnit = todo.unit || ''
  const conversions = todo.conversions ?? {}
  let totalInterval = 0
  let totalQty = 0
  let samples = 0
  // Welford pondéré : variance des ms/unité accumulée dans le même passage que la moyenne
  let runningMean = 0
  let m2 = 0
  for (let i = 0; i < timings.length - 1; i++) {
    const t = timings[i]
    const tNext = timings[i + 1]
    if (t.end == null || tNext.end == null) continue
    const interval = tNext.end - t.end
    if (interval <= 0) continue
    const qty = convertQuantity(t.quantity ?? 1, t.unit ?? '', currentUnit, conversions)
    if (qty <= 0) continue
    totalInterval += interval
    totalQty += qty
    samples++
    const rate = interval / qty
    const prevMean = runningMean
    runningMean += (qty / totalQty) * (rate - prevMean)
    m2 += qty * (rate - prevMean) * (rate - runningMean)
  }
  if (totalQty <= 0) return NO_STATS
  // Temps moyen par unité (pondéré par les qty achetées) × stock cible du sélecteur
  const scale = todo.quantity ?? 1
  const avgMsPerUnit = totalInterval / totalQty
  return {
    averageMs: avgMsPerUnit * scale,
    stdDevMs: samples < 2 ? null : Math.sqrt(m2 / totalQty) * scale,
  }
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
