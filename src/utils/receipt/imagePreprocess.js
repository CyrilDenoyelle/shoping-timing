/**
 * Préparation d'une photo de ticket pour Tesseract.
 *
 * Deux formes de la photo servent à la lecture :
 * - l'image d'origine remise à l'endroit (orientation EXIF) ;
 * - une image recadrée sur le papier puis binarisée localement (noir et blanc).
 *   La binarisation locale compense les ombres et les plis ; le recadrage retire le fond sombre
 *   qui perturbe le seuillage interne de Tesseract.
 *
 * Les calculs sont des fonctions pures sur des tableaux d'octets (testables sans navigateur).
 * Seules `loadReceiptPhoto`, `renderCleanVariant` et `drawBinaryToCanvas` utilisent le DOM.
 */

const DEFAULT_MAX_SIDE = 4096
const BRIGHT_COLUMN_RATIO = 0.4
const MIN_TICKET_WIDTH_RATIO = 0.3
const WINDOW_WIDTH_RATIO = 0.037
const MIN_WINDOW = 15
const DARKNESS_RATIO = 0.1

/**
 * Niveaux de gris d'un tableau RGBA.
 * @param {Uint8ClampedArray | Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function grayFromRgba(rgba, width, height) {
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000
  }
  return gray
}

/** Seuil d'Otsu : sépare au mieux le fond sombre du papier clair. */
export function otsuThreshold(gray) {
  const histogram = new Uint32Array(256)
  for (let i = 0; i < gray.length; i += 7) histogram[gray[i]]++ // échantillon : suffisant pour le seuil

  let total = 0
  let sumAll = 0
  for (let v = 0; v < 256; v++) {
    total += histogram[v]
    sumAll += v * histogram[v]
  }

  let weightBack = 0
  let sumBack = 0
  let bestVariance = -1
  let threshold = 128
  for (let v = 0; v < 256; v++) {
    weightBack += histogram[v]
    if (weightBack === 0) continue
    const weightFront = total - weightBack
    if (weightFront === 0) break
    sumBack += v * histogram[v]
    const meanBack = sumBack / weightBack
    const meanFront = (sumAll - sumBack) / weightFront
    const variance = weightBack * weightFront * (meanBack - meanFront) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      threshold = v
    }
  }
  return threshold
}

/**
 * Colonnes extrêmes du papier : celles dont une grande part est plus claire que le seuil d'Otsu.
 * Sans papier repéré, la largeur entière est conservée.
 * @returns {{ left: number, right: number }}  bornes incluses
 */
export function findTicketColumns(gray, width, height) {
  const threshold = otsuThreshold(gray)
  const rowStep = Math.max(1, Math.floor(height / 400))
  const samples = Math.ceil(height / rowStep)

  let left = -1
  let right = -1
  for (let x = 0; x < width; x += 2) {
    let bright = 0
    for (let y = 0; y < height; y += rowStep) {
      if (gray[y * width + x] > threshold) bright++
    }
    if (bright / samples > BRIGHT_COLUMN_RATIO) {
      if (left < 0) left = x
      right = x
    }
  }

  if (left < 0 || right - left < width * MIN_TICKET_WIDTH_RATIO) return { left: 0, right: width - 1 }

  const margin = Math.round(width * 0.01)
  return { left: Math.max(0, left - margin), right: Math.min(width - 1, right + margin) }
}

/** Copie d'une zone rectangulaire d'un tableau de gris. */
export function cropGray(gray, width, left, right, height) {
  const cropWidth = right - left + 1
  const out = new Uint8Array(cropWidth * height)
  for (let y = 0; y < height; y++) {
    out.set(gray.subarray(y * width + left, y * width + left + cropWidth), y * cropWidth)
  }
  return out
}

/**
 * Binarisation adaptative (seuil local, image intégrale) : un pixel devient noir
 * s'il est plus sombre que la moyenne de sa fenêtre, diminuée de `darkness`.
 * @param {Uint8Array} gray
 * @param {number} width
 * @param {number} height
 * @param {{ windowSize?: number, darkness?: number }} [options]
 * @returns {Uint8Array}  0 = encre, 255 = papier
 */
export function adaptiveBinarize(gray, width, height, { windowSize, darkness = DARKNESS_RATIO } = {}) {
  const size = windowSize ?? defaultWindowSize(width)
  const half = size >> 1
  const stride = width + 1
  // Uint32 suffit jusqu'à environ 16 millions de pixels ; au-delà, Float64.
  const Integral = width * height > 16_000_000 ? Float64Array : Uint32Array
  const integral = new Integral(stride * (height + 1))

  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum
    }
  }

  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height - 1, y + half)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width - 1, x + half)
      const sum =
        integral[(y1 + 1) * stride + x1 + 1] -
        integral[y0 * stride + x1 + 1] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0]
      const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1))
      out[y * width + x] = gray[y * width + x] < mean * (1 - darkness) ? 0 : 255
    }
  }
  return out
}

/** Fenêtre impaire proportionnelle à la largeur : environ 3,7 % de la largeur du papier par défaut. */
export function defaultWindowSize(width, ratio = WINDOW_WIDTH_RATIO) {
  const size = Math.max(MIN_WINDOW, Math.round(width * ratio))
  return size % 2 === 0 ? size + 1 : size
}

/**
 * Chaîne complète sur un tableau de gris : recadrage puis binarisation locale.
 * @param {Uint8Array} gray
 * @param {number} width
 * @param {number} height
 * @param {{ windowRatio?: number, darkness?: number }} [variant]  réglages de binarisation
 * @returns {{ binary: Uint8Array, width: number, height: number, crop: { left: number, right: number } }}
 */
export function cleanGrayImage(gray, width, height, variant = {}) {
  const crop = findTicketColumns(gray, width, height)
  const cropped = cropGray(gray, width, crop.left, crop.right, height)
  const cropWidth = crop.right - crop.left + 1
  const binary = binarizeVariant(cropped, cropWidth, height, variant)
  return { binary, width: cropWidth, height, crop }
}

/**
 * Binarisation d'une image déjà recadrée selon un réglage : `windowRatio` (fenêtre en part de la largeur)
 * et `darkness` (écart sous la moyenne locale qui rend un pixel noir).
 */
export function binarizeVariant(cropped, width, height, { windowRatio = WINDOW_WIDTH_RATIO, darkness = DARKNESS_RATIO } = {}) {
  return adaptiveBinarize(cropped, width, height, { windowSize: defaultWindowSize(width, windowRatio), darkness })
}

/**
 * Réglages de binarisation essayés tour à tour : l'écart d'une lecture à l'autre est assez grand
 * pour que la combinaison de plusieurs réglages donne le meilleur résultat.
 */
export const CLEAN_VARIANTS = [
  { id: 'clean-wide', label: 'Recadré, fenêtre large', windowRatio: 0.05, darkness: 0.08 },
  { id: 'clean', label: 'Recadré, fenêtre standard', windowRatio: 0.037, darkness: 0.1 },
]

/**
 * Dessine un tableau binaire (0 / 255) dans un canvas.
 * @param {Uint8Array} binary
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
export function drawBinaryToCanvas(binary, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(width, height)
  const pixels = imageData.data
  for (let i = 0, p = 0; i < binary.length; i++, p += 4) {
    const v = binary[i]
    pixels[p] = v
    pixels[p + 1] = v
    pixels[p + 2] = v
    pixels[p + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * Charge une photo de ticket : image d'origine remise à l'endroit, niveaux de gris et recadrage sur le papier.
 * Le navigateur applique l'orientation EXIF (photo prise en portrait), que Tesseract ignore.
 * Le résultat sert ensuite à produire plusieurs variantes sans relire le fichier.
 *
 * @param {File | Blob} file
 * @param {{ maxSide?: number }} [options]
 * @returns {Promise<{
 *   original: HTMLCanvasElement,
 *   cropped: Uint8Array,
 *   width: number,
 *   height: number,
 * }>}
 */
export async function loadReceiptPhoto(file, { maxSide = DEFAULT_MAX_SIDE } = {}) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const original = document.createElement('canvas')
  original.width = width
  original.height = height
  const ctx = original.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const { data } = ctx.getImageData(0, 0, width, height)
  const gray = grayFromRgba(data, width, height)
  const crop = findTicketColumns(gray, width, height)
  return {
    original,
    cropped: cropGray(gray, width, crop.left, crop.right, height),
    width: crop.right - crop.left + 1,
    height,
  }
}

/**
 * Canvas d'une variante binarisée de la photo chargée.
 * @param {Awaited<ReturnType<typeof loadReceiptPhoto>>} photo
 * @param {{ windowRatio?: number, darkness?: number }} variant
 * @returns {HTMLCanvasElement}
 */
export function renderCleanVariant(photo, variant) {
  const binary = binarizeVariant(photo.cropped, photo.width, photo.height, variant)
  return drawBinaryToCanvas(binary, photo.width, photo.height)
}
