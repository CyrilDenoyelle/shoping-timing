/**
 * Transforme le texte OCR d'un ticket de caisse en lignes produits.
 * Fonction pure : aucune dépendance au DOM ni au stockage.
 * Les montants sont manipulés en centimes (entiers) pour éviter les erreurs d'arrondi.
 *
 * Deux présentations de ticket sont reconnues :
 * - « NOM  prix  lettre de taxe », la quantité figurant sur une ligne « 4 x 0,15 EUR 0,60 » ;
 * - « NOM  P.U.  Qté  Total  lettre de taxe », avec remises et produits au poids sur des lignes à part.
 */

// Début de la zone de totaux : les lignes produits s'arrêtent avant. Testé sur le texte sans accents.
// « TANT » suffit à reconnaître MONTANT, MOITANT ou MOHTANT lus par l'OCR.
// « M…NT » ou « M…AN » couvre les lectures tronquées : MONAN, MOMENT.
const STOP_PATTERN =
  /TANT\b|\bM[O0]\w{0,2}(?:NT|AN)\b|\bCB\b|CONTAC|ELIG|TRD|RENDRE|ESPECES|RECAPITULATIF|CODE\s*TVA|\bPAYER\b|NOMBRE\s+DE\s+LIGNES|LIGNES\s*:/i

// Noms qui ne désignent jamais un produit, même si la zone de totaux n'a pas été repérée.
const NON_PRODUCT_NAME = /PAYER|ELIGIBLE|\bTVA\b/i

// Remises : « Rem Pain », « Prix en baisse » (le moins du montant est souvent perdu par l'OCR).
const DISCOUNT_NAME = /baisse|^\W*re[mg]\b|^\W*remise|^\W*reduction/i

// Ligne de quantité : « 4 x 0,15 EUR 0,64 EUR À » (le « x » est parfois lu « K » ou « % »).
const QUANTITY_LINE = /^(\d{1,3})\s*[xXkK×%]\s*(\d{1,4}[.,]\d{1,2})\S*\s*(?:EUR|EUK|€)?\s*(\d{1,4}[.,]\d{1,2})?/

// Ligne de quantité dont le prix unitaire est abîmé : « 4% Ü, 15 EUR 0,64 EUR À ».
// Seul le début « n x » et le total en fin de ligne sont fiables.
const QUANTITY_PREFIX = /^(\d{1,3})\s*[xXkK×%]\s*[^\s]{0,3}[.,]\s?\d{1,2}\b/

// Produit au poids : « 0,594 kg x 2,79 EUR/kg ». Le prix au kilo est parfois illisible.
const WEIGHT_LINE = /(\d{1,2}[.,]\d{3})\s*k\w?\s*[xX×%]\s*(?:(\d{1,3}[.,]\d{2}))?/i

const MONEY = /(\d{1,4}[.,]\d{2})(?!\d)/g

const MONEY_TOKEN = /^-?\d{1,4}[.,]\d{1,3}$/
const INT_TOKEN = /^\d{1,2}$/
// Montant abîmé par l'OCR : « 1,994A7 », « 32BAT », « fS.59AT ».
const GARBLED_TOKEN = /^[A-Za-z]{0,2}[\d.,-]*\d[\d.,]*[A-Za-zÀ-ÿ]{0,3}\d?$/
const MONEY_INSIDE = /-?\d{1,4}[.,]\d{1,3}/

export function toCents(value) {
  return Math.round(parseFloat(String(value).replace(',', '.')) * 100)
}

function stripAccents(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function countLetters(text) {
  return (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length
}

function cleanName(text) {
  return text.replace(/\s+/g, ' ').replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9)]+$/g, '').trim()
}

function decimalsOf(value) {
  return String(value).split(/[.,]/)[1]?.length ?? 0
}

function buildProduct({
  name,
  raw,
  quantity,
  unitCents,
  totalCents,
  uncertain,
  weightGrams = null,
  quantityMismatch,
}) {
  return {
    name,
    raw,
    quantity,
    unitCents,
    totalCents,
    discountCents: 0,
    weightGrams,
    uncertain,
    quantityMismatch: quantityMismatch ?? Math.round(unitCents * quantity) !== totalCents,
  }
}

function lastMoneyIn(line) {
  const matches = [...line.matchAll(MONEY)]
  return matches.length ? matches[matches.length - 1][1] : null
}

// La ligne « CB SANS CONTACT » est prioritaire : le « MONTANT » est souvent mal lu (« d9,33 » pour 35,53).
function findDeclaredTotalCents(lines) {
  for (const pattern of [/\bCB\b|CONTAC/i, /\bPAYER\b/i, /TANT\b/i]) {
    const line = lines.find((l) => pattern.test(stripAccents(l)))
    const money = line ? lastMoneyIn(line) : null
    if (money) return toCents(money)
  }
  return null
}

function findDeclaredCount(lines) {
  for (const line of lines) {
    const match = /art\w*\s+vendu\w*\W*(\d+)/i.exec(line)
    if (match) return parseInt(match[1], 10)
  }
  return null
}

// « Nombre de lignes: 33 » : nombre de lignes produits, remises et lignes de poids exclues.
function findDeclaredLineCount(lines) {
  for (const line of lines) {
    const match = /nombre\s+de\s+lignes\W{0,3}(\d{1,3})\b/i.exec(stripAccents(line))
    if (match) return parseInt(match[1], 10)
  }
  return null
}

/** Découpe une ligne en jetons ; les parasites collés à un nombre (« 0,12}1 ») le séparent. */
function tokenize(raw) {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => (/\d/.test(token) ? token.split(/[}{|[\]()“”"~=*<>_]+/).filter(Boolean) : [token]))
}

// Au-delà de 1 000 €, un « prix » vient d'un chiffre mal lu (« 2209,45 » pour 2,09).
const IMPLAUSIBLE_CENTS = 100000

const isPlausibleMoney = (text) => toPositiveCents(text) < IMPLAUSIBLE_CENTS

function classifyToken(token) {
  const core = token.replace(/^[^\w-]+/, '').replace(/[^\w]+$/, '')
  if (!core || /^(?:EUR|EUK)$/i.test(core)) return { kind: 'noise' }
  if (MONEY_TOKEN.test(core)) {
    return isPlausibleMoney(core) ? { kind: 'money', money: core } : { kind: 'garbled', money: null }
  }
  if (INT_TOKEN.test(core)) return { kind: 'int', value: parseInt(core, 10) }
  if (core.length >= 3 && GARBLED_TOKEN.test(core)) {
    const inside = MONEY_INSIDE.exec(core)
    return { kind: 'garbled', money: inside && isPlausibleMoney(inside[0]) ? inside[0] : null }
  }
  return { kind: core.length <= 4 ? 'noise' : 'word' }
}

const hasMoney = (item) => item.kind === 'money' || (item.kind === 'garbled' && item.money)

function isSeparatorToken(token) {
  const core = token.replace(/^[^\w-]+/, '').replace(/[^\w]+$/, '')
  return core === '' || /^[A-Za-zÀ-ÿ]{1,2}$/.test(core)
}

// Un signe moins parasite (« --0,35 ») ne rend pas un prix de produit négatif.
function toPositiveCents(text) {
  return Math.abs(toCents(text))
}

/**
 * Lit la fin d'une ligne : bruit et lettres de taxe ignorés, puis nombres (P.U., quantité, total).
 * @returns {{ name: string, items: Array } | null}
 */
function readTail(raw) {
  const tokens = tokenize(raw)
  let end = tokens.length
  while (end > 0 && classifyToken(tokens[end - 1]).kind === 'noise') end--

  const items = []
  let start = end
  let skipped = 0
  while (start > 0 && items.length < 5) {
    const token = tokens[start - 1]
    const item = classifyToken(token)
    if (item.kind === 'money' || item.kind === 'int' || item.kind === 'garbled') {
      items.unshift({ ...item, index: start - 1 })
      skipped = 0
    } else if (items.length > 0 && skipped < 2 && isSeparatorToken(token)) {
      // Ponctuation ou lettre de taxe isolée entre deux nombres (« 1,46 A 4SAT »).
      skipped++
    } else {
      break
    }
    start--
  }

  // Les nombres isolés en début de séquence font partie du nom (« XXL 31 », « 1kg »).
  while (items.length > 0 && !hasMoney(items[0])) items.shift()
  if (items.length === 0) return null

  return { name: tokens.slice(0, items[0].index).join(' '), items }
}

/**
 * Interprète les nombres d'une ligne : [total] ou [P.U., quantité, total] selon ce qui est lisible.
 * Un total illisible est recalculé (P.U. × quantité) et signalé comme incertain.
 */
function interpretItems(items) {
  const first = items[0]
  let rest = items.slice(1)

  if (rest.length === 0) {
    const text = first.money
    return {
      quantity: 1,
      unitCents: toPositiveCents(text),
      totalCents: toPositiveCents(text),
      uncertain: first.kind === 'garbled' || decimalsOf(text) !== 2,
      quantityMismatch: false,
    }
  }

  let unitText = first.money
  let quantity = null
  // « 1,642 » : le prix unitaire 1,64 suivi de la quantité 2.
  const glued = /^(-?\d{1,4}[.,]\d{2})(\d)$/.exec(unitText)
  if (glued) {
    unitText = glued[1]
    quantity = parseInt(glued[2], 10)
  } else if (rest[0].kind === 'int') {
    quantity = rest[0].value
    rest = rest.slice(1)
  }

  const totalItem = rest[0] && hasMoney(rest[0]) ? rest[0] : null
  const unitCents = toPositiveCents(unitText)
  const unitUncertain = first.kind === 'garbled' || decimalsOf(unitText) !== 2
  const totalRead = totalItem ? toPositiveCents(totalItem.money) : null
  const totalDecimals = totalItem ? decimalsOf(totalItem.money) : 0
  const totalUncertain = totalItem ? totalItem.kind === 'garbled' || totalDecimals !== 2 : true

  // Le total est un multiple exact du prix unitaire : la quantité lue (ou absente) cède à ce rapport.
  const ratio = totalRead != null && unitCents > 0 ? Math.round(totalRead / unitCents) : null
  const ratioFits = ratio != null && ratio >= 1 && ratio <= 99 && ratio * unitCents === totalRead
  const quantityRead = quantity
  if (ratioFits) quantity = ratio
  else if (quantity == null) quantity = 1

  const computedCents = unitCents * quantity
  // Un total abîmé par des décimales ou des lettres cède au calcul P.U. × quantité, quand le P.U. est net.
  const useComputed = totalRead == null || (!ratioFits && totalDecimals > 2 && !unitUncertain)
  const totalCents = useComputed ? computedCents : totalRead

  return {
    quantity,
    unitCents,
    totalCents,
    // Une quantité lue puis corrigée par le total reste à vérifier.
    uncertain: unitUncertain || totalUncertain || (quantityRead != null && quantityRead !== quantity),
    quantityMismatch: !useComputed && !ratioFits && computedCents !== totalRead,
  }
}

/**
 * @param {string} text  texte OCR brut (une ligne par ligne du ticket)
 * @returns {{
 *   products: Array<{
 *     name: string, raw: string, quantity: number, unitCents: number, totalCents: number,
 *     discountCents: number, weightGrams: number | null, uncertain: boolean, quantityMismatch: boolean,
 *   }>,
 *   declaredTotalCents: number | null,
 *   declaredCount: number | null,
 *   declaredLineCount: number | null,
 * }}
 */
export function parseReceiptText(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const declaredTotalCents = findDeclaredTotalCents(lines)
  const declaredCount = findDeclaredCount(lines)
  const declaredLineCount = findDeclaredLineCount(lines)

  const stopIndex = lines.findIndex((l) => STOP_PATTERN.test(stripAccents(l)))
  const body = stopIndex === -1 ? lines : lines.slice(0, stopIndex)

  const products = []
  // Nom d'un produit vu sans prix : il sert si la ligne suivante est une quantité (« 4 x ... ») ou un poids.
  let pending = null

  for (const raw of body) {
    const quantityMatch = QUANTITY_LINE.exec(raw)
    const prefixMatch = quantityMatch ? null : QUANTITY_PREFIX.exec(raw)
    const prefixTail = prefixMatch ? readTail(raw) : null
    if (quantityMatch || (prefixMatch && prefixTail)) {
      let quantity
      let unitCents
      let totalCents
      let uncertain
      if (quantityMatch) {
        quantity = parseInt(quantityMatch[1], 10)
        unitCents = toCents(quantityMatch[2])
        totalCents = quantityMatch[3] ? toCents(quantityMatch[3]) : Math.round(unitCents * quantity)
        uncertain = decimalsOf(quantityMatch[2]) !== 2
      } else {
        quantity = parseInt(prefixMatch[1], 10)
        const tail = interpretItems(prefixTail.items)
        totalCents = tail.totalCents
        unitCents = Math.round(totalCents / quantity)
        uncertain = true
      }
      if (pending) {
        products.push(
          buildProduct({
            name: pending,
            raw,
            quantity,
            unitCents,
            totalCents,
            uncertain,
            quantityMismatch: quantityMatch ? undefined : false,
          }),
        )
        pending = null
      } else if (products.length > 0) {
        const last = products[products.length - 1]
        Object.assign(
          last,
          buildProduct({
            name: last.name,
            raw,
            quantity,
            unitCents,
            totalCents,
            uncertain,
            quantityMismatch: quantityMatch ? undefined : false,
          }),
          { discountCents: last.discountCents },
        )
      }
      continue
    }

    const weightMatch = WEIGHT_LINE.exec(raw)
    if (weightMatch) {
      const weightGrams = Math.round(parseFloat(weightMatch[1].replace(',', '.')) * 1000)
      const perKgCents = weightMatch[2] ? toCents(weightMatch[2]) : null
      const computedCents = perKgCents != null ? Math.round((weightGrams * perKgCents) / 1000) : null
      if (pending && computedCents != null) {
        products.push(
          buildProduct({
            name: pending,
            raw,
            quantity: 1,
            unitCents: perKgCents,
            totalCents: computedCents,
            uncertain: false,
            weightGrams,
            quantityMismatch: false,
          }),
        )
        pending = null
      } else if (products.length > 0) {
        const last = products[products.length - 1]
        last.weightGrams = weightGrams
        if (computedCents != null) {
          last.unitCents = perKgCents
          const differs = Math.abs(computedCents - last.totalCents) > 1
          if (differs && last.uncertain) {
            // Poids × prix au kilo, tous deux lisibles : ce calcul remplace un total abîmé.
            last.totalCents = computedCents
            last.uncertain = false
            last.quantityMismatch = false
          } else {
            last.quantityMismatch = differs
          }
        }
      }
      continue
    }

    const tail = readTail(raw)
    if (!tail) {
      if (countLetters(raw) >= 3) pending = cleanName(raw)
      continue
    }

    const nameRaw = cleanName(tail.name)
    const read = interpretItems(tail.items)

    if (DISCOUNT_NAME.test(stripAccents(nameRaw))) {
      const last = products[products.length - 1]
      // Une remise supérieure au prix du produit est un chiffre mal lu : elle est ignorée.
      if (last && read.totalCents <= last.totalCents) last.discountCents += read.totalCents
      pending = null
      continue
    }

    // Un nom parasité par un décimal ou « EUR » (« LX D,10 EUR ») est remplacé par le nom vu juste avant.
    const nameIsGarbled = countLetters(nameRaw) >= 2 && /[.,]\d|EUR/i.test(nameRaw)
    const name = pending && nameIsGarbled ? pending : nameRaw
    pending = null
    if (countLetters(name) < 3 || NON_PRODUCT_NAME.test(stripAccents(name))) continue

    products.push(buildProduct({ name, raw, ...read }))
  }

  return { products, declaredTotalCents, declaredCount, declaredLineCount }
}
