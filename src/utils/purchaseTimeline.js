const DAY = 86_400_000

/** @typedef {{ at: number, listName: string, text: string, quantity: number, unit: string }} PurchaseEvent */

/**
 * Quantité enregistrée sur le timing au moment du passage « acheté » (pas le nombre de coches).
 * @param {unknown} t
 */
function timingQuantity(t) {
  const q = t?.quantity
  const n = q != null && !Number.isNaN(Number(q)) ? Number(q) : 1
  return Math.max(0.1, n)
}

/**
 * @param {unknown} t
 */
function timingUnit(t) {
  return String(t?.unit ?? '').trim()
}

/**
 * Libellé cohérent avec l’affichage des todos (ex. 2 kg, 1,5 L).
 * @param {number} quantity
 * @param {string} unit
 */
export function formatPurchaseQtyLabel(quantity, unit) {
  const u = String(unit ?? '').trim()
  const q = quantity
  const numStr = Number.isInteger(q) ? String(q) : String(Number(q.toFixed(1)))
  return u ? `${numStr} ${u}` : numStr
}

/**
 * @param {unknown[]} lists
 * @returns {PurchaseEvent[]}
 */
export function collectPurchaseEvents(lists) {
  const events = []
  if (!Array.isArray(lists)) return events
  for (const list of lists) {
    const name = list?.name ?? ''
    for (const todo of list?.todos ?? []) {
      for (const t of todo?.timings ?? []) {
        if (t?.end == null) continue
        events.push({
          at: t.end,
          listName: name,
          text: todo.text ?? '',
          quantity: timingQuantity(t),
          unit: timingUnit(t),
        })
      }
    }
  }
  events.sort((a, b) => a.at - b.at)
  return events
}

function startOfLocalDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Lundi 00:00 locale */
function startOfIsoWeek(ts) {
  const d = new Date(ts)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Jours calendaires locaux [start..end], sans dérive DST (évite t += 86_400_000). */
function eachDay(fromMs, toMs) {
  const days = []
  const cursor = new Date(startOfLocalDay(fromMs))
  const end = startOfLocalDay(toMs)
  while (cursor.getTime() <= end) {
    days.push(cursor.getTime())
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/** Semaines (lundi) couvrant l’intervalle, avancées par date calendaire. */
function eachWeek(fromMs, toMs) {
  const weeks = []
  const cursor = new Date(startOfIsoWeek(fromMs))
  const end = startOfIsoWeek(toMs)
  while (cursor.getTime() <= end) {
    weeks.push(cursor.getTime())
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

export const TIMELINE_PERIODS = [
  { id: '7d', label: '7 j.', days: 7, bucket: 'day' },
  { id: '30d', label: '30 j.', days: 30, bucket: 'day' },
  { id: '90d', label: '90 j.', days: 90, bucket: 'week' },
  { id: 'all', label: 'Tout', days: null, bucket: 'auto' },
]

/** @typedef {{ quantitySum: number, unit: string, text: string, list: string }} TooltipDetailItem */
/** @typedef {{ items: TooltipDetailItem[] }} TooltipDetailBucket */

/**
 * Détail tooltip : regroupe par produit + liste + unité, somme les quantités achetées.
 * @param {PurchaseEvent[]} bucketEvents
 * @returns {TooltipDetailBucket}
 */
function breakdownBucketForTooltipRows(bucketEvents) {
  if (!bucketEvents.length) return { items: [] }
  /** @type {Map<string, number>} */
  const m = new Map()
  for (const e of bucketEvents) {
    const text = (e.text || 'Sans titre').trim()
    const list = (e.listName || '').trim()
    const unit = String(e.unit ?? '').trim()
    const key = `${text}\u0000${list}\u0000${unit}`
    m.set(key, (m.get(key) ?? 0) + e.quantity)
  }
  const rows = [...m.entries()].map(([key, quantitySum]) => {
    const [text, list, unit] = key.split('\u0000')
    return { quantitySum, unit: unit ?? '', text, list }
  })
  rows.sort((a, b) => {
    const la = a.list ? `${a.text} · ${a.list}` : a.text
    const lb = b.list ? `${b.text} · ${b.list}` : b.text
    return b.quantitySum - a.quantitySum || la.localeCompare(lb, 'fr')
  })
  return { items: rows }
}

/**
 * @param {PurchaseEvent[]} events
 * @param {number} nowMs
 * @param {string} periodId
 */
export function buildTimelineSeries(events, nowMs, periodId) {
  const period = TIMELINE_PERIODS.find((p) => p.id === periodId) ?? TIMELINE_PERIODS[1]
  let bucketMode = period.bucket
  let fromMs

  if (period.days != null) {
    fromMs = nowMs - period.days * DAY
  } else {
    if (events.length === 0) {
      return {
        labels: [],
        counts: [],
        total: 0,
        bucketMode: 'day',
        tooltipRowsPerBucket: [],
      }
    }
    fromMs = events[0].at
    const span = nowMs - fromMs
    if (bucketMode === 'auto') {
      bucketMode = span > 60 * DAY ? 'week' : 'day'
    }
  }

  const inWindow = events.filter((e) => e.at >= fromMs && e.at <= nowMs)
  const total = inWindow.length

  /** @type {Map<number, number>} */
  const countMap = new Map()
  /** @type {Map<number, PurchaseEvent[]>} */
  const eventsByBucket = new Map()
  for (const e of inWindow) {
    const key = bucketMode === 'week' ? startOfIsoWeek(e.at) : startOfLocalDay(e.at)
    countMap.set(key, (countMap.get(key) ?? 0) + 1)
    let arr = eventsByBucket.get(key)
    if (!arr) {
      arr = []
      eventsByBucket.set(key, arr)
    }
    arr.push(e)
  }

  const bucketStarts =
    bucketMode === 'week'
      ? eachWeek(fromMs, nowMs)
      : eachDay(fromMs, nowMs)

  const labels = []
  const counts = []
  /** @type {TooltipDetailBucket[]} */
  const tooltipRowsPerBucket = []
  const fmtDay = (ts) =>
    new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const fmtWeek = (ts) => {
    const start = new Date(ts)
    const end = new Date(ts)
    end.setDate(end.getDate() + 6)
    const a = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    const b = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    return `${a} – ${b}`
  }

  for (const b of bucketStarts) {
    labels.push(bucketMode === 'week' ? fmtWeek(b) : fmtDay(b))
    counts.push(countMap.get(b) ?? 0)
    const evts = eventsByBucket.get(b) ?? []
    tooltipRowsPerBucket.push(breakdownBucketForTooltipRows(evts))
  }

  return { labels, counts, total, bucketMode, tooltipRowsPerBucket }
}
