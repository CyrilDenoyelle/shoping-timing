/**
 * Rapprochement entre une ligne de ticket (libellé abrégé, parfois mal lu)
 * et les produits existants de l'application.
 */

const MIN_PREFIX_LENGTH = 3
const DEFAULT_THRESHOLD = 0.45
const DEFAULT_LIMIT = 3
const MIN_FUZZY_TOKEN_DICE = 0.75
const COVERAGE_BASE = 0.6
const COVERAGE_SPREAD = 0.25
const MIN_COVERAGE_TOKEN_LENGTH = 3

/** Minuscules, sans accents, lettres et chiffres séparés par des espaces. */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const MEASURE_TOKEN = /^\d+(?:g|kg|cl|l|ml)?$/

/** Mots utiles : les nombres et contenances (« 850g », « 1l ») sont écartés. */
export function tokenize(value) {
  return normalizeName(value)
    .split(' ')
    .filter((t) => t.length >= 2 && !MEASURE_TOKEN.test(t))
}

function commonPrefixLength(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function ngrams(text, size) {
  const grams = new Map()
  if (text.length < size) {
    if (text) grams.set(text, 1)
    return grams
  }
  for (let i = 0; i <= text.length - size; i++) {
    const gram = text.slice(i, i + size)
    grams.set(gram, (grams.get(gram) ?? 0) + 1)
  }
  return grams
}

function diceOnGrams(a, b) {
  let sizeA = 0
  let sizeB = 0
  let common = 0
  for (const count of a.values()) sizeA += count
  for (const count of b.values()) sizeB += count
  if (sizeA === 0 || sizeB === 0) return 0
  for (const [gram, count] of a) common += Math.min(count, b.get(gram) ?? 0)
  return (2 * common) / (sizeA + sizeB)
}

/** Similarité de caractères (trigrammes) sur les textes sans espaces. */
export function trigramDice(a, b) {
  const left = normalizeName(a).replace(/ /g, '')
  const right = normalizeName(b).replace(/ /g, '')
  if (!left || !right) return 0
  return diceOnGrams(ngrams(left, 3), ngrams(right, 3))
}

function tokenAffinity(a, b) {
  if (a === b) return 1
  const shortest = a.length <= b.length ? a : b
  const longest = shortest === a ? b : a
  if (shortest.length >= MIN_PREFIX_LENGTH && longest.startsWith(shortest)) return 0.85
  if (shortest.length >= 4) {
    const dice = diceOnGrams(ngrams(a, 2), ngrams(b, 2))
    if (dice >= MIN_FUZZY_TOKEN_DICE) return 0.7 * dice
    const prefix = commonPrefixLength(a, b)
    if (prefix >= MIN_PREFIX_LENGTH && prefix / shortest.length >= 0.6) return 0.6
  }
  return 0
}

/**
 * Part des mots communs (égalité, préfixe d'abréviation ou faute de lecture légère).
 * Deux mesures sont combinées : la similarité symétrique, et la couverture du libellé le plus court.
 * La couverture permet de retrouver « Lait » dans « Lait écrémé bio » sans pénaliser les mots en trop du ticket.
 */
export function tokenScore(a, b) {
  const left = tokenize(a)
  const right = tokenize(b)
  if (left.length === 0 || right.length === 0) return 0
  const taken = new Set()
  let sum = 0
  for (const token of left) {
    let best = 0
    let bestIndex = -1
    right.forEach((other, index) => {
      if (taken.has(index)) return
      const affinity = tokenAffinity(token, other)
      if (affinity > best) {
        best = affinity
        bestIndex = index
      }
    })
    if (bestIndex >= 0) {
      taken.add(bestIndex)
      sum += best
    }
  }
  const symmetric = (2 * sum) / (left.length + right.length)
  const shorter = left.length <= right.length ? left : right
  const longer = shorter === left ? right : left
  const meaningful = shorter.some((t) => t.length >= MIN_COVERAGE_TOKEN_LENGTH)
  const coverage = meaningful ? sum / shorter.length : 0
  // Un produit qui couvre davantage de mots du ticket garde l'avantage sur un nom plus générique.
  const coverageScore = coverage * (COVERAGE_BASE + COVERAGE_SPREAD * (sum / longer.length))
  return Math.max(symmetric, coverageScore)
}

/** Note de 0 à 1 entre un libellé de ticket et un nom (produit ou alias). */
export function scoreNames(receiptName, candidateName) {
  const left = normalizeName(receiptName)
  const right = normalizeName(candidateName)
  if (!left || !right) return 0
  if (left === right) return 1
  return Math.max(tokenScore(left, right), 0.95 * trigramDice(left, right))
}

/**
 * Classe les produits existants pour une ligne de ticket.
 * @param {string} receiptName libellé lu sur le ticket
 * @param {Array<{id:number, listId:string, text:string, receiptNames?:string[]}>} candidates
 * @returns {Array<{candidate: object, score: number, via: 'alias'|'name'|'fuzzy'}>}
 */
export function matchProducts(receiptName, candidates, { threshold = DEFAULT_THRESHOLD, limit = DEFAULT_LIMIT } = {}) {
  const normalized = normalizeName(receiptName)
  if (!normalized) return []
  const ranked = []
  for (const candidate of candidates) {
    const aliases = candidate.receiptNames ?? []
    if (aliases.some((alias) => normalizeName(alias) === normalized)) {
      ranked.push({ candidate, score: 1, via: 'alias' })
      continue
    }
    const nameScore = scoreNames(receiptName, candidate.text)
    let score = nameScore
    for (const alias of aliases) score = Math.max(score, scoreNames(receiptName, alias))
    if (score < threshold) continue
    ranked.push({ candidate, score, via: nameScore === 1 ? 'name' : 'fuzzy' })
  }
  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, limit)
}

/** Recherche manuelle : produits dont le nom contient les mots saisis (sans accents). */
export function searchCandidates(query, candidates, limit = 8) {
  const words = normalizeName(query).split(' ').filter(Boolean)
  if (words.length === 0) return []
  return candidates
    .filter((candidate) => {
      const text = normalizeName(candidate.text)
      return words.every((word) => text.includes(word))
    })
    .slice(0, limit)
}
