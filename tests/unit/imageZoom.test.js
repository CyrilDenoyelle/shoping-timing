import { describe, it, expect } from 'vitest'
import { clampPan, zoomAt, distance, midpoint, MAX_SCALE } from '@/utils/receipt/imageZoom.js'

const bounds = { imageWidth: 400, imageHeight: 600, stageWidth: 400, stageHeight: 800 }

describe('clampPan', () => {
  it('garde l’image centrée quand elle tient dans la zone', () => {
    expect(clampPan({ tx: 50, ty: -30, scale: 1, ...bounds })).toEqual({ tx: 0, ty: 0 })
  })
  it('autorise un déplacement égal au débord de l’image zoomée', () => {
    // largeur affichée 800 pour une zone de 400 : débord de 200 de chaque côté
    expect(clampPan({ tx: 500, ty: 0, scale: 2, ...bounds }).tx).toBe(200)
    expect(clampPan({ tx: -500, ty: 0, scale: 2, ...bounds }).tx).toBe(-200)
  })
  it('traite chaque axe séparément', () => {
    // hauteur affichée 1200 pour une zone de 800 : débord de 200
    expect(clampPan({ tx: 0, ty: 900, scale: 2, ...bounds }).ty).toBe(200)
  })
})

describe('zoomAt', () => {
  it('garde fixe le point visé', () => {
    const view = { scale: 1, tx: 0, ty: 0 }
    const next = zoomAt(view, 2, 100, 0, bounds)
    // le point (100, 0) de la zone reste sous le curseur : tx = 100 - 100 * 2 = -100
    expect(next).toEqual({ scale: 2, tx: -100, ty: 0 })
  })
  it('limite le zoom maximal', () => {
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 50, 0, 0, bounds).scale).toBe(MAX_SCALE)
  })
  it('revient au centre en dézoomant à 1', () => {
    const next = zoomAt({ scale: 3, tx: 120, ty: -40 }, 1, 0, 0, bounds)
    expect(next).toEqual({ scale: 1, tx: 0, ty: 0 })
  })
  it('limite le zoom minimal à 1', () => {
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 0.2, 0, 0, bounds).scale).toBe(1)
  })
})

describe('géométrie des doigts', () => {
  it('calcule distance et milieu', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 })
  })
})
