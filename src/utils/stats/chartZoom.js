/**
 * Calculs de zoom pour l'axe du temps d'une courbe (fonctions pures, testables sans navigateur).
 * Une plage est un objet `{ min, max }` en millisecondes ; `full` est la plage complète de la courbe.
 */
const HOUR = 3_600_000

/** Facteur d'un clic sur un bouton de zoom. */
export const ZOOM_STEP = 1.6
/** La vue la plus serrée couvre 1/MAX_ZOOM de la plage complète. */
const MAX_ZOOM = 20
/** Durée minimale affichée : 12 h, assez pour distinguer deux achats d'une même journée. */
const MIN_SPAN_FLOOR = 12 * HOUR
/** Marge de l'axe vertical autour des valeurs visibles (facteur multiplicatif, axe logarithmique). */
export const LOG_PAD = 1.5

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/** Plus petite durée affichable pour une plage complète donnée. */
export function minSpanFor(full) {
  const fullSpan = full.max - full.min
  return Math.min(fullSpan, Math.max(fullSpan / MAX_ZOOM, MIN_SPAN_FLOOR))
}

/** Ramène une plage dans `full` en conservant sa durée (la durée est elle-même limitée à celle de `full`). */
export function clampRange(range, full) {
  const span = Math.min(range.max - range.min, full.max - full.min)
  const min = clamp(range.min, full.min, full.max - span)
  return { min, max: min + span }
}

/** Vrai quand la plage affichée est plus étroite que la plage complète. */
export function isZoomed(range, full) {
  return range.max - range.min < full.max - full.min - 1
}

/**
 * Zoome autour d'un point d'ancrage : l'instant sous `anchor` garde la même position à l'écran.
 * `factor` > 1 rapproche (zoom avant), < 1 éloigne. Sans ancre, le centre de la vue sert de repère.
 */
export function zoomRange(range, full, factor, anchor) {
  if (!Number.isFinite(factor) || factor <= 0) return range
  const span = range.max - range.min
  const fullSpan = full.max - full.min
  const nextSpan = Math.min(fullSpan, Math.max(minSpanFor(full), span / factor))
  if (nextSpan >= fullSpan) return { min: full.min, max: full.max }
  const at = anchor ?? (range.min + range.max) / 2
  const ratio = clamp((at - range.min) / span, 0, 1)
  const min = at - ratio * nextSpan
  return clampRange({ min, max: min + nextSpan }, full)
}

/** Décale la plage de `delta` ms sans sortir de `full`. */
export function panRange(range, full, delta) {
  return clampRange({ min: range.min + delta, max: range.max + delta }, full)
}

/**
 * Plage de l'axe vertical logarithmique ajustée aux points visibles dans `xRange`
 * (tous les points si aucun n'est visible), en y incluant les valeurs `extra` (ex. rythme retenu).
 * @param {{ x: number, y: number }[]} points
 * @param {{ min: number, max: number }} xRange
 * @param {(number | null | undefined)[]} [extra]
 */
export function fitLogRange(points, xRange, extra = [], pad = LOG_PAD) {
  const visible = points.filter((p) => p.x >= xRange.min && p.x <= xRange.max)
  const source = visible.length > 0 ? visible : points
  const ys = [
    ...source.map((p) => p.y),
    ...extra.filter((value) => Number.isFinite(value) && value > 0),
  ]
  return { min: Math.min(...ys) / pad, max: Math.max(...ys) * pad }
}
