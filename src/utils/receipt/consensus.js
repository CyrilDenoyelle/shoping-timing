/**
 * Vote par ligne entre plusieurs lectures d'un même ticket.
 *
 * Les erreurs de chiffres tombent à des endroits différents d'une lecture à l'autre.
 * Chaque produit de la lecture de référence est aligné avec ses équivalents des autres lectures
 * (ordre conservé, noms proches), puis son montant est voté. Fonctions pures.
 */

const MIN_NAME_SIMILARITY = 0.45

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '')
}

function bigrams(text) {
  const set = new Map()
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2)
    set.set(pair, (set.get(pair) ?? 0) + 1)
  }
  return set
}

/** Similarité de Dice sur les paires de lettres, entre 0 et 1. */
export function nameSimilarity(a, b) {
  const x = normalizeName(a)
  const y = normalizeName(b)
  if (x.length < 2 || y.length < 2) return 0
  const bx = bigrams(x)
  const by = bigrams(y)
  let shared = 0
  for (const [pair, count] of bx) shared += Math.min(count, by.get(pair) ?? 0)
  return (2 * shared) / (x.length - 1 + (y.length - 1))
}

/**
 * Alignement monotone de deux listes de produits (programmation dynamique) : maximise la somme
 * des similarités de noms, au-dessus d'un seuil. Renvoie, pour chaque produit de `reference`,
 * l'indice du produit apparié dans `other`, ou -1.
 */
export function alignProducts(reference, other) {
  const n = reference.length
  const m = other.length
  const similarity = reference.map((r) => other.map((o) => nameSimilarity(r.name, o.name)))

  const score = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const pair = similarity[i - 1][j - 1]
      const matched = pair >= MIN_NAME_SIMILARITY ? score[i - 1][j - 1] + pair : -Infinity
      score[i][j] = Math.max(score[i - 1][j], score[i][j - 1], matched)
    }
  }

  const mapping = new Array(n).fill(-1)
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    const pair = similarity[i - 1][j - 1]
    const matched = pair >= MIN_NAME_SIMILARITY ? score[i - 1][j - 1] + pair : -Infinity
    if (matched === score[i][j] && matched !== -Infinity) {
      mapping[i - 1] = j - 1
      i--
      j--
    } else if (score[i - 1][j] >= score[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return mapping
}

const isReliable = (p) => !p.uncertain && !p.quantityMismatch

function netTotal(p) {
  return p.totalCents
}

/** Vote pondéré : une lecture fiable compte double. Égalité : la première valeur candidate l'emporte. */
function vote(candidates, valueOf) {
  const weights = new Map()
  for (const candidate of candidates) {
    const value = valueOf(candidate)
    weights.set(value, (weights.get(value) ?? 0) + (isReliable(candidate) ? 2 : 1))
  }
  let best = null
  let bestWeight = -1
  for (const [value, weight] of weights) {
    if (weight > bestWeight) {
      best = value
      bestWeight = weight
    }
  }
  return { value: best, weight: bestWeight, support: candidates.filter((c) => valueOf(c) === best) }
}

/**
 * @param {Array<{ id: string, products: Array }>} passes  la lecture de référence en premier
 * @returns {Array}  produits de la référence, montants votés
 */
export function consensusProducts(passes) {
  if (passes.length === 0) return []
  const [reference, ...others] = passes
  const mappings = others.map((pass) => alignProducts(reference.products, pass.products))

  return reference.products.map((product, index) => {
    const group = [product]
    others.forEach((pass, k) => {
      const matchIndex = mappings[k][index]
      if (matchIndex >= 0) group.push(pass.products[matchIndex])
    })
    // Une ligne que la référence lit sans doute n'est jamais remise en cause : les erreurs de chiffres
    // se répètent d'une passe à l'autre (un « 8 » lu « 3 » partout) et feraient perdre la bonne valeur.
    if (group.length === 1 || isReliable(product)) return product

    const total = vote(group, netTotal)
    const winner = total.support.find(isReliable) ?? total.support[0]
    // Un montant n'est confirmé que par au moins deux lectures dont une fiable.
    const confirmed = total.support.length >= 2 && total.support.some(isReliable)

    const discount = vote(group, (p) => p.discountCents ?? 0)
    const weightSource = group.find((p) => p.weightGrams)

    return {
      ...product,
      quantity: winner.quantity,
      unitCents: winner.unitCents,
      totalCents: winner.totalCents,
      discountCents: discount.value,
      weightGrams: weightSource?.weightGrams ?? product.weightGrams,
      uncertain: !confirmed,
      quantityMismatch: confirmed ? false : winner.quantityMismatch,
      votes: group.length,
    }
  })
}
