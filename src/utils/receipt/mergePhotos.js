/**
 * Fusionne les textes OCR de plusieurs photos d'un même ticket.
 * Le début d'une photo peut répéter la fin de la précédente : ces lignes communes ne sont gardées qu'une fois.
 */

const MIN_OVERLAP = 2

function normalize(line) {
  return line.toLowerCase().replace(/\s+/g, ' ').trim()
}

function splitLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Plus grand nombre k (≥ MIN_OVERLAP) tel que les k dernières lignes de `previous` égalent les k premières de `next`. */
function findOverlap(previous, next) {
  const max = Math.min(previous.length, next.length)
  for (let k = max; k >= MIN_OVERLAP; k--) {
    let matches = true
    for (let i = 0; i < k; i++) {
      if (normalize(previous[previous.length - k + i]) !== normalize(next[i])) {
        matches = false
        break
      }
    }
    if (matches) return k
  }
  return 0
}

/**
 * @param {string[]} texts  textes OCR, dans l'ordre des photos
 * @returns {string}  texte fusionné, une ligne par ligne de ticket
 */
export function mergeReceiptTexts(texts) {
  let merged = []
  for (const text of texts) {
    const lines = splitLines(text)
    const overlap = findOverlap(merged, lines)
    merged = merged.concat(lines.slice(overlap))
  }
  return merged.join('\n')
}
