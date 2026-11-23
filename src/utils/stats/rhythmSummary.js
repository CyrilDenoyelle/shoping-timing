import { DAY } from '@/utils/time.js'

/**
 * Textes de la vue simple des rythmes : durées en toutes lettres, prochain achat estimé et vocabulaire courant.
 * Fonctions pures, sans dépendance au navigateur.
 */

const SECOND = 1_000
const MINUTE = 60_000
const HOUR = 3_600_000

/** Unités de la plus petite à la plus grande ; `max` est la durée à partir de laquelle on passe à l'unité suivante. */
const WORD_UNITS = [
  { ms: SECOND, max: MINUTE, one: 'seconde', many: 'secondes', feminine: true },
  { ms: MINUTE, max: HOUR, one: 'minute', many: 'minutes', feminine: true },
  { ms: HOUR, max: DAY, one: 'heure', many: 'heures', feminine: true },
  { ms: DAY, max: 7 * DAY, one: 'jour', many: 'jours', feminine: false },
  { ms: 7 * DAY, max: 30 * DAY, one: 'semaine', many: 'semaines', feminine: true },
  { ms: 30 * DAY, max: Infinity, one: 'mois', many: 'mois', feminine: false },
]

/** Durée arrondie à l'unité courante la plus proche, ex. { count: 5, unit: jour }. Null si la durée est inexploitable. */
function wordParts(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null
  for (let i = 0; i < WORD_UNITS.length; i++) {
    const unit = WORD_UNITS[i]
    if (ms >= unit.max) continue
    const count = Math.max(1, Math.round(ms / unit.ms))
    // 59,7 min s'arrondit à 60 min : on passe à l'unité suivante (« 1 heure »).
    if (count * unit.ms >= unit.max && i < WORD_UNITS.length - 1) continue
    return { count, unit }
  }
  return null
}

/** Durée en toutes lettres : « 5 jours », « 2 semaines », « 1 mois ». Null si la durée est inexploitable. */
export function formatDurationWords(ms) {
  const parts = wordParts(ms)
  if (!parts) return null
  const { count, unit } = parts
  return `${count} ${count > 1 ? unit.many : unit.one}`
}

/** Fréquence en toutes lettres : « tous les 5 jours », « toutes les 2 semaines », « tous les mois ». */
export function formatEvery(ms) {
  const parts = wordParts(ms)
  if (!parts) return null
  const { count, unit } = parts
  const article = unit.feminine ? 'toutes les' : 'tous les'
  return count === 1 ? `${article} ${unit.many}` : `${article} ${count} ${unit.many}`
}

/** Date courte : « jeu. 28 nov. » (année ajoutée quand elle diffère de celle de `now`). */
export function formatShortDate(ms, now, { weekday = false } = {}) {
  const date = new Date(ms)
  return date.toLocaleDateString('fr-FR', {
    ...(weekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Part du rythme écoulée depuis le dernier achat à partir de laquelle le produit est « bientôt » à racheter. */
export const SOON_RATIO = 0.8

/**
 * Estimation du prochain achat : dernier achat + rythme retenu.
 * `status` : 'listed' (déjà sur la liste à acheter), 'late', 'soon' ou 'ok'. Null sans dernier achat ni rythme.
 * @param {{ lastPurchaseAt: number | null, done: boolean, stats: { averageMs: number } }} product
 * @param {number} now
 */
export function forecastNextPurchase(product, now) {
  const { lastPurchaseAt, done, stats } = product
  const averageMs = stats?.averageMs
  if (!Number.isFinite(lastPurchaseAt) || !Number.isFinite(averageMs) || averageMs <= 0) return null
  const dueAt = lastPurchaseAt + averageMs
  const remainingMs = dueAt - now
  let status = 'ok'
  if (!done) status = 'listed'
  else if (remainingMs < 0) status = 'late'
  else if ((now - lastPurchaseAt) / averageMs >= SOON_RATIO) status = 'soon'
  return { dueAt, remainingMs, status }
}

/**
 * Textes d'une estimation : `badge` (état en un coup d'œil) et `text` (date prévue).
 * @param {NonNullable<ReturnType<typeof forecastNextPurchase>>} forecast
 * @param {number} now
 */
export function describeForecast(forecast, now) {
  const date = formatShortDate(forecast.dueAt, now, { weekday: true })
  switch (forecast.status) {
    case 'listed':
      return { badge: 'À acheter', text: 'Déjà sur la liste de courses' }
    case 'late':
      return {
        badge: `En retard de ${formatDurationWords(-forecast.remainingMs) ?? '1 minute'}`,
        text: `Prochain achat attendu le ${date}`,
      }
    case 'soon':
      return {
        badge: `Bientôt · dans ${formatDurationWords(forecast.remainingMs) ?? '1 minute'}`,
        text: `Prochain achat vers le ${date}`,
      }
    default:
      return {
        badge: `Dans ${formatDurationWords(forecast.remainingMs) ?? '1 minute'}`,
        text: `Prochain achat vers le ${date}`,
      }
  }
}

/** Nombre d'intervalles laissés hors du rythme (trop longs, trop courts ou trop éloignés de l'habitude). */
export function countOutOfRhythm(exclusions) {
  return (exclusions?.['too-long'] ?? 0) + (exclusions?.['too-short'] ?? 0) + (exclusions?.trimmed ?? 0)
}
