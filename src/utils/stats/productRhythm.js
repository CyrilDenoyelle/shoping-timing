import { analyzeIntervals } from '@/utils/todo/todoIntervals.js'
import { formatPurchaseQtyLabel } from '@/utils/stats/purchaseTimeline.js'
import { DAY } from '@/utils/time.js'

const MINUTE = 60_000
const HOUR = 3_600_000

/** Unités d'affichage des durées sur l'axe vertical (id stable, libellé court, durée en ms). */
const DURATION_UNITS = {
  minute: { id: 'minute', label: 'min', ms: MINUTE },
  hour: { id: 'hour', label: 'h', ms: HOUR },
  day: { id: 'day', label: 'j', ms: DAY },
  week: { id: 'week', label: 'sem', ms: 7 * DAY },
  month: { id: 'month', label: 'mois', ms: 30 * DAY },
}

/** Unité la plus lisible pour afficher des durées allant jusqu'à `maxMs`. */
export function durationUnitFor(maxMs) {
  if (maxMs < 2 * HOUR) return DURATION_UNITS.minute
  if (maxMs < 2 * DAY) return DURATION_UNITS.hour
  if (maxMs < 120 * DAY) return DURATION_UNITS.day
  if (maxMs < 730 * DAY) return DURATION_UNITS.week
  return DURATION_UNITS.month
}

const EXCLUSION_LABELS = {
  'too-long': 'trop long',
  'too-short': 'trop court',
  trimmed: 'écarté (éloigné du noyau du rythme)',
}

/** Libellé lisible de la raison pour laquelle un intervalle est écarté du calcul. */
export function describeExclusion(reason) {
  return EXCLUSION_LABELS[reason] ?? 'écarté'
}

/**
 * Résumé court des intervalles écartés d'un produit, ex. « 1 trop long · 2 éloignés du noyau du rythme ».
 * Chaîne vide quand aucun intervalle n'est écarté.
 * @param {{ 'too-long': number, 'too-short': number, trimmed: number }} counts
 */
export function summarizeExclusions(counts) {
  const parts = []
  if (counts['too-long'] > 0) parts.push(`${counts['too-long']} trop long${counts['too-long'] > 1 ? 's' : ''}`)
  if (counts['too-short'] > 0) parts.push(`${counts['too-short']} trop court${counts['too-short'] > 1 ? 's' : ''}`)
  if (counts.trimmed > 0) {
    parts.push(
      counts.trimmed === 1
        ? '1 éloigné du noyau du rythme'
        : `${counts.trimmed} éloignés du noyau du rythme`,
    )
  }
  return parts.join(' · ')
}

/** Date du dernier achat enregistré, ou null. */
function lastPurchaseOf(todo) {
  const ends = (todo.timings ?? []).map((t) => t?.end).filter(Number.isFinite)
  return ends.length > 0 ? Math.max(...ends) : null
}

/**
 * Produits ayant au moins un intervalle mesurable, regroupés par liste (ordre des listes et des produits conservé).
 * Chaque produit porte l'analyse complète de `analyzeIntervals`.
 * @param {unknown[]} lists
 */
export function buildProductRhythms(lists) {
  const groups = []
  if (!Array.isArray(lists)) return groups
  for (const list of lists) {
    const products = []
    for (const todo of list?.todos ?? []) {
      const analysis = analyzeIntervals(todo)
      if (analysis.samples.length === 0) continue
      const unit = String(todo.unit ?? '').trim()
      const exclusions = { 'too-long': 0, 'too-short': 0, trimmed: 0 }
      for (const s of analysis.samples) if (s.exclusion) exclusions[s.exclusion]++
      products.push({
        key: `${list.id}:${todo.id}`,
        text: (todo.text ?? '').trim() || 'Sans titre',
        unit,
        selectorLabel: formatPurchaseQtyLabel(analysis.scale, unit),
        // Dernier achat connu, et présence du produit sur la liste à acheter (non coché).
        lastPurchaseAt: lastPurchaseOf(todo),
        done: Boolean(todo.done),
        exclusions,
        ...analysis,
      })
    }
    if (products.length > 0) {
      groups.push({ listId: list.id, listName: (list.name ?? '').trim(), products })
    }
  }
  return groups
}

/** Texte de recherche normalisé : minuscules, sans accents, espaces simplifiés. */
export function normalizeSearch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Garde les produits dont le nom ou la liste contient tous les mots recherchés (sans tenir compte
 * des accents ni de la casse). Les listes sans produit restant disparaissent ; la requête vide garde tout.
 * @param {ReturnType<typeof buildProductRhythms>} groups
 * @param {string} query
 */
export function filterProductGroups(groups, query) {
  const terms = normalizeSearch(query).split(' ').filter(Boolean)
  if (terms.length === 0) return groups
  const filtered = []
  for (const group of groups) {
    const listName = normalizeSearch(group.listName)
    const products = group.products.filter((product) => {
      const haystack = `${normalizeSearch(product.text)} ${listName}`
      return terms.every((term) => haystack.includes(term))
    })
    if (products.length > 0) filtered.push({ ...group, products })
  }
  return filtered
}

/**
 * Garde les produits ayant au moins `minPoints` intervalles mesurés. Les listes sans produit restant
 * disparaissent. `minPoints` ≤ 1 ne change rien : un produit affiché a toujours au moins un intervalle.
 * @param {ReturnType<typeof buildProductRhythms>} groups
 * @param {number} minPoints
 */
export function filterGroupsByPointCount(groups, minPoints) {
  if (!Number.isFinite(minPoints) || minPoints <= 1) return groups
  const filtered = []
  for (const group of groups) {
    const products = group.products.filter((product) => product.samples.length >= minPoints)
    if (products.length > 0) filtered.push({ ...group, products })
  }
  return filtered
}

// Rayon d'un point : croît avec la racine de la quantité (surface proportionnelle au poids).
const MIN_POINT_RADIUS = 3
const POINT_RADIUS_SPAN = 6
// Rayon commun quand tous les intervalles ont le même poids (la taille n'apporte alors aucune information).
const UNIFORM_POINT_RADIUS = 5

/**
 * Données prêtes à tracer pour un produit : un point par intervalle.
 * L'axe X est l'ordre des intervalles (espacement uniforme) : la durée n'est portée que par Y.
 * `at` / `from` restent les dates réelles pour les libellés et l'infobulle.
 * @param {ReturnType<typeof buildProductRhythms>[number]['products'][number]} product
 */
export function buildRhythmChartModel(product) {
  const { samples, stats, lowerMs, upperMs } = product
  const unit = durationUnitFor(Math.max(...samples.map((s) => s.scaledMs)))
  const maxQty = Math.max(...samples.map((s) => s.qty))
  const uniformWeights = samples.every((s) => s.qty === samples[0].qty)
  const radiusOf = (qty) =>
    uniformWeights ? UNIFORM_POINT_RADIUS : MIN_POINT_RADIUS + POINT_RADIUS_SPAN * Math.sqrt(qty / maxQty)

  const points = samples.map((s, i) => ({
    x: i,
    y: s.scaledMs / unit.ms,
    at: s.at,
    from: s.from,
    intervalMs: s.interval,
    qty: s.qty,
    used: s.used,
    exclusion: s.exclusion,
    radius: radiusOf(s.qty),
  }))

  const pad = 0.35

  return {
    unit,
    points,
    meanY: Number.isFinite(stats.averageMs) ? stats.averageMs / unit.ms : null,
    band: lowerMs == null ? null : { lower: lowerMs / unit.ms, upper: upperMs / unit.ms },
    xRange: { min: -pad, max: points.length - 1 + pad },
  }
}
