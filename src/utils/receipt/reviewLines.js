import { matchProducts, normalizeName } from './matchProducts.js'

/**
 * Lignes de revue : une par produit lu sur le ticket, avec la cible choisie
 * (produit existant ou nouveau produit) et les valeurs modifiables.
 */

const AUTO_MATCH_THRESHOLD = 0.6
const SUGGESTION_THRESHOLD = 0.25
const SUGGESTION_LIMIT = 8
const SIZE_TOKEN = /^\d+(?:[.,]\d+)?(?:g|kg|cl|l|ml)?$/i

/** Nom proposé pour un nouveau produit à partir du libellé du ticket. */
export function suggestProductName(rawName) {
  const words = String(rawName ?? '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .split(/\s+/)
    .filter((word) => word && !SIZE_TOKEN.test(word) && /[\p{L}]{2}/u.test(word))
  const text = words.join(' ')
  if (!text) return ''
  const letters = text.replace(/[^\p{L}]/gu, '')
  const shouting = letters.length > 0 && letters === letters.toUpperCase()
  const base = shouting ? text.toLowerCase() : text
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function existingTarget(candidate, extra = {}) {
  return {
    type: 'existing',
    listId: candidate.listId,
    todoId: candidate.id,
    text: candidate.text,
    ...extra,
  }
}

export function newTarget(listId, text) {
  return { type: 'new', listId, text }
}

/** Cible à partir d’un candidat de la liste (produit existant ou brouillon « nouveau » d’une autre ligne). */
export function targetFromCandidate(candidate, extra = {}) {
  if (candidate.pending) return newTarget(candidate.listId, candidate.text)
  return existingTarget(candidate, extra)
}

/**
 * Brouillons de nouveaux produits déjà saisis sur d’autres lignes du ticket.
 * Chaque brouillon porte les libellés OCR associés, pour rattacher automatiquement
 * une deuxième ligne du même article.
 */
export function pendingProductCandidates(lines, lists = []) {
  const byKey = new Map()
  for (const line of lines) {
    if (!line.included || line.target?.type !== 'new') continue
    const text = String(line.target.text ?? '').trim()
    if (!text) continue
    const listId = line.target.listId
    const key = `${listId}:${normalizeName(text)}`
    const entry = byKey.get(key) ?? {
      id: `pending:${key}`,
      listId,
      text,
      listName: lists.find((list) => list.id === listId)?.name ?? '',
      receiptNames: [],
      pending: true,
      done: false,
    }
    if (line.name && !entry.receiptNames.includes(line.name)) entry.receiptNames.push(line.name)
    byKey.set(key, entry)
  }
  return [...byKey.values()]
}

/** Produits existants + brouillons de nouvelles lignes, pour l’autocomplétion et le rapprochement. */
export function mergeReviewCandidates(existing, lines, lists = []) {
  const pending = pendingProductCandidates(lines, lists)
  const taken = new Set(existing.map((c) => `${c.listId}:${normalizeName(c.text)}`))
  return [...existing, ...pending.filter((p) => !taken.has(`${p.listId}:${normalizeName(p.text)}`))]
}

function pushPendingCandidate(pending, { listId, text, receiptName, listName }) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return
  const key = `${listId}:${normalizeName(trimmed)}`
  const entry = pending.get(key) ?? {
    id: `pending:${key}`,
    listId,
    text: trimmed,
    listName: listName ?? '',
    receiptNames: [],
    pending: true,
    done: false,
  }
  if (receiptName && !entry.receiptNames.includes(receiptName)) entry.receiptNames.push(receiptName)
  pending.set(key, entry)
}

/**
 * Prix unitaire affiché pour une ligne : la valeur lue sur le ticket.
 * Le prix au kilo d'un produit au poids n'est pas un prix unitaire : la ligne affiche alors son montant.
 * Une valeur absente se déduit du total.
 */
export function readUnitCents(product) {
  const quantity = product.quantity || 1
  const total = product.totalCents ?? 0
  if (product.weightGrams) return total
  if (product.unitCents > 0) return product.unitCents
  return Math.round(total / quantity)
}

/** Montant retenu pour la ligne : total lu moins la remise éventuelle. */
export function lineNetCents(line) {
  return Math.max(0, (line.totalCents ?? 0) - (line.discountCents ?? 0))
}

export function buildReviewLines(products, candidates, { defaultListId = null, lists = [] } = {}) {
  const pending = new Map()
  const listName = (id) => lists.find((list) => list.id === id)?.name ?? ''

  return products.map((product, index) => {
    const pool = [...candidates, ...pending.values()]
    const suggestions = matchProducts(product.name, pool, {
      threshold: SUGGESTION_THRESHOLD,
      limit: SUGGESTION_LIMIT,
    })
    const top = suggestions[0]
    const target =
      top && top.score >= AUTO_MATCH_THRESHOLD
        ? targetFromCandidate(top.candidate, { via: top.via, score: top.score })
        : newTarget(defaultListId, suggestProductName(product.name))

    // Les brouillons créés ici servent aux lignes suivantes du même ticket (même article, autre libellé OCR).
    if (target.type === 'new') {
      pushPendingCandidate(pending, {
        listId: target.listId,
        text: target.text,
        receiptName: product.name,
        listName: listName(target.listId),
      })
    }

    return {
      key: index,
      name: product.name,
      quantity: product.quantity ?? 1,
      unitCents: readUnitCents(product),
      totalCents: product.totalCents ?? 0,
      discountCents: product.discountCents ?? 0,
      weightGrams: product.weightGrams ?? null,
      uncertain: Boolean(product.uncertain || product.quantityMismatch),
      included: true,
      suggestions: suggestions.map((s) => ({
        candidate: s.candidate,
        score: s.score,
        via: s.via,
      })),
      target,
    }
  })
}

function toQuantity(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed) : 1
}

/** Chaque montant s'édite seul : l'incohérence reste visible en rouge jusqu'à ce que quantité × unitaire = total. */
export function setLineQuantity(line, value) {
  line.quantity = toQuantity(value)
}

export function setLineUnit(line, cents) {
  line.unitCents = Math.max(0, Math.round(cents) || 0)
}

export function setLineTotal(line, cents) {
  line.totalCents = Math.max(0, Math.round(cents) || 0)
}

/** Convertit une saisie en euros (« 1,45 ») en centimes ; renvoie 0 pour une saisie illisible. */
export function parseEuroInput(value) {
  const parsed = parseFloat(String(value ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

export function isLineReady(line) {
  if (!line.included) return true
  const target = line.target
  if (!target) return false
  if (target.type === 'existing') return target.todoId != null && target.listId != null
  return Boolean(target.listId) && String(target.text ?? '').trim().length > 0
}

/** Au moins une ligne est retenue. */
export function canValidate(lines) {
  return lines.some((line) => line.included)
}

export function receiptTotalCents(lines) {
  return lines.filter((line) => line.included).reduce((sum, line) => sum + lineNetCents(line), 0)
}

/**
 * Incohérences d'une ligne retenue (affichées en rouge) :
 * - amounts : total absent, ou quantité × prix unitaire − remise différent du total (tolérance d'un centime par article) ;
 * - product : aucun produit choisi, ou nom du nouveau produit vide.
 * Une ligne au poids affiche son montant comme prix unitaire : seul le total absent compte.
 */
export function lineIssues(line) {
  if (!line.included) return { amounts: false, product: false }
  const quantity = Number(line.quantity) >= 1 ? Number(line.quantity) : 1
  const total = line.totalCents ?? 0
  let amounts = total <= 0
  if (!amounts && !line.weightGrams) {
    const expected = (line.unitCents ?? 0) * quantity
    amounts = Math.abs(expected - total) > quantity
  }
  return { amounts, product: !isLineReady(line) }
}

/**
 * Contrôle complet avant validation.
 * @param {object[]} lines lignes de revue
 * @param {number|null} declaredTotalCents total du ticket (lu ou saisi), null s'il est inconnu
 */
export function reviewIssues(lines, declaredTotalCents = null) {
  const included = lines.filter((line) => line.included)
  const badAmounts = included.filter((line) => lineIssues(line).amounts)
  const badProducts = included.filter((line) => lineIssues(line).product)
  const sumCents = receiptTotalCents(lines)
  const gapCents = declaredTotalCents == null ? null : sumCents - declaredTotalCents
  const gap = gapCents != null && gapCents !== 0

  const messages = []
  if (badAmounts.length > 0) {
    messages.push(
      `${badAmounts.length} ligne(s) avec une quantité, un prix unitaire ou un total incohérent.`,
    )
  }
  if (badProducts.length > 0) {
    messages.push(`${badProducts.length} ligne(s) sans produit ou sans nom de nouveau produit.`)
  }
  if (gap) {
    messages.push(
      `Le total des lignes (${formatCents(sumCents)}) diffère du total du ticket (${formatCents(declaredTotalCents)}).`,
    )
  }
  return {
    amountKeys: badAmounts.map((line) => line.key),
    productKeys: badProducts.map((line) => line.key),
    sumCents,
    gapCents,
    gap,
    messages,
    hasIssues: messages.length > 0,
  }
}

function formatCents(cents) {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

function groupKey(target) {
  if (target.type === 'existing') return `existing:${target.listId}:${target.todoId}`
  return `new:${target.listId}:${normalizeName(target.text)}`
}

/**
 * Enregistre les achats du ticket.
 * @param {object[]} lines lignes de revue
 * @param {{addTodo: Function, addReceiptName: Function, applyReceiptPurchase: Function}} api
 */
export function validateReviewLines(lines, api, at = Date.now()) {
  const groups = new Map()
  let ignored = 0
  for (const line of lines) {
    if (!line.included) {
      ignored++
      continue
    }
    const key = groupKey(line.target)
    const group = groups.get(key) ?? { target: line.target, lines: [] }
    group.lines.push(line)
    groups.set(key, group)
  }

  const report = { created: 0, checked: 0, recorded: 0, skipped: 0, ignored, entries: [], totalCents: 0 }
  for (const { target, lines: grouped } of groups.values()) {
    let { listId, todoId } = target
    let created = false
    if (target.type === 'new') {
      const todo = api.addTodo(listId, String(target.text).trim())
      if (!todo) continue
      todoId = todo.id
      created = true
      report.created++
    }
    for (const line of grouped) api.addReceiptName(listId, todoId, line.name)

    const quantity = grouped.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
    const totalCents = grouped.reduce((sum, line) => sum + lineNetCents(line), 0)
    const action = api.applyReceiptPurchase(listId, todoId, { quantity, at })
    if (action === 'check') report.checked++
    else if (action === 'record') report.recorded++
    else if (action === 'skip') report.skipped++
    report.totalCents += totalCents
    report.entries.push({
      names: grouped.map((line) => line.name),
      productText: target.text,
      listId,
      todoId,
      quantity,
      totalCents,
      action,
      created,
    })
  }
  return report
}
