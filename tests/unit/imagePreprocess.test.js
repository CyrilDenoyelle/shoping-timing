import { describe, it, expect } from 'vitest'
import {
  grayFromRgba,
  otsuThreshold,
  findTicketColumns,
  cropGray,
  adaptiveBinarize,
  defaultWindowSize,
  cleanGrayImage,
} from '@/utils/receipt/imagePreprocess.js'

/** Image de gris uniforme avec un rectangle clair (le « papier ») au centre. */
function paperOnDarkTable({ width = 200, height = 100, left = 50, right = 149, table = 20, paper = 200 } = {}) {
  const gray = new Uint8Array(width * height).fill(table)
  for (let y = 0; y < height; y++) {
    for (let x = left; x <= right; x++) gray[y * width + x] = paper
  }
  return { gray, width, height }
}

describe('grayFromRgba', () => {
  it('pondère les canaux selon la luminance', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
    expect(Array.from(grayFromRgba(rgba, 4, 1))).toEqual([76, 149, 29, 255])
  })
})

describe('otsuThreshold', () => {
  it('place le seuil entre le fond sombre et le papier clair', () => {
    const { gray } = paperOnDarkTable()
    const threshold = otsuThreshold(gray)
    expect(threshold).toBeGreaterThanOrEqual(20)
    expect(threshold).toBeLessThan(200)
  })
})

describe('findTicketColumns', () => {
  it('repère le papier sur un fond sombre avec une petite marge', () => {
    const { gray, width, height } = paperOnDarkTable()
    const { left, right } = findTicketColumns(gray, width, height)
    expect(left).toBeLessThanOrEqual(50)
    expect(left).toBeGreaterThanOrEqual(46)
    expect(right).toBeGreaterThanOrEqual(149)
    expect(right).toBeLessThanOrEqual(153)
  })

  it('garde toute la largeur quand aucun papier ne se détache', () => {
    const width = 100
    const height = 50
    const gray = new Uint8Array(width * height).fill(30)
    expect(findTicketColumns(gray, width, height)).toEqual({ left: 0, right: width - 1 })
  })

  it('garde toute la largeur quand le papier est trop étroit pour être un ticket', () => {
    const { gray, width, height } = paperOnDarkTable({ left: 90, right: 99 })
    expect(findTicketColumns(gray, width, height)).toEqual({ left: 0, right: width - 1 })
  })
})

describe('cropGray', () => {
  it('extrait les colonnes demandées sur toute la hauteur', () => {
    const gray = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(Array.from(cropGray(gray, 4, 1, 2, 2))).toEqual([2, 3, 6, 7])
  })
})

describe('defaultWindowSize', () => {
  it('renvoie une taille impaire proportionnelle à la largeur', () => {
    expect(defaultWindowSize(1644) % 2).toBe(1)
    expect(defaultWindowSize(1644)).toBe(61)
    expect(defaultWindowSize(100)).toBe(15)
  })
})

describe('adaptiveBinarize', () => {
  it('noircit l’encre malgré un éclairage qui varie le long de la page', () => {
    const width = 120
    const height = 40
    const gray = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      // Papier de 110 à 230 de gauche à droite (ombre à gauche).
      for (let x = 0; x < width; x++) gray[y * width + x] = 110 + Math.round((x * 120) / (width - 1))
    }
    // Deux traits d'encre : l'un dans la zone sombre, l'autre dans la zone claire.
    for (let y = 15; y < 25; y++) {
      gray[y * width + 20] = 40
      gray[y * width + 100] = 120
    }

    const binary = adaptiveBinarize(gray, width, height, { windowSize: 21 })

    expect(binary[20 * width + 20]).toBe(0)
    expect(binary[20 * width + 100]).toBe(0)
    expect(binary[5 * width + 20]).toBe(255)
    expect(binary[5 * width + 100]).toBe(255)
    expect(binary[20 * width + 60]).toBe(255)
  })

  it('ne produit que du noir et du blanc', () => {
    const width = 30
    const height = 30
    const gray = new Uint8Array(width * height).map((_, i) => (i * 37) % 256)
    const binary = adaptiveBinarize(gray, width, height, { windowSize: 9 })
    expect(Array.from(new Set(binary)).sort((a, b) => a - b)).toEqual([0, 255])
  })
})

describe('cleanGrayImage', () => {
  it('recadre sur le papier puis binarise', () => {
    const { gray, width, height } = paperOnDarkTable({ width: 400, height: 60, left: 100, right: 299 })
    const cleaned = cleanGrayImage(gray, width, height)
    expect(cleaned.height).toBe(height)
    expect(cleaned.width).toBeGreaterThanOrEqual(200)
    expect(cleaned.width).toBeLessThanOrEqual(208)
    expect(cleaned.binary).toHaveLength(cleaned.width * cleaned.height)
  })
})
