import { convertQuantity } from '@/utils/todo/units.js'
import { DAY } from '@/utils/time.js'

export function computeWeightedIntervalMs(todo) {
  const timings = todo.timings ?? []
  if (timings.length < 2) return Infinity
  const currentUnit = todo.unit || ''
  const conversions = todo.conversions ?? {}
  let totalInterval = 0
  let totalQty = 0
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
  }
  if (totalQty <= 0) return Infinity
  // Temps moyen par unité (pondéré par les qty achetées) × stock cible du sélecteur
  const avgMsPerUnit = totalInterval / totalQty
  return avgMsPerUnit * (todo.quantity ?? 1)
}

export function updateTodoAverage(todo) {
  todo.averageIntervalMs = computeWeightedIntervalMs(todo)
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
  const progress = Math.ceil((elapsed / todo.averageIntervalMs) * 10) / 10
  return Math.max(0, progress - 0.5)
}
