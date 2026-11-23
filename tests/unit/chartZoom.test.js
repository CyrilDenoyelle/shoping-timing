import { describe, it, expect } from 'vitest'
import { DAY } from '@/utils/time.js'
import {
  LOG_PAD,
  ZOOM_STEP,
  clampRange,
  fitLogRange,
  isZoomed,
  minSpanFor,
  panRange,
  zoomRange,
} from '@/utils/stats/chartZoom.js'

const HOUR = 3_600_000
const full = { min: 0, max: 200 * DAY }

describe('chartZoom', () => {
  describe('minSpanFor', () => {
    it('is a twentieth of the full range', () => {
      expect(minSpanFor(full)).toBe(10 * DAY)
    })

    it('never goes below 12 hours', () => {
      expect(minSpanFor({ min: 0, max: 5 * DAY })).toBe(12 * HOUR)
    })

    it('never exceeds the full range', () => {
      expect(minSpanFor({ min: 0, max: 6 * HOUR })).toBe(6 * HOUR)
    })
  })

  describe('clampRange', () => {
    it('keeps a range already inside', () => {
      expect(clampRange({ min: 10 * DAY, max: 20 * DAY }, full)).toEqual({ min: 10 * DAY, max: 20 * DAY })
    })

    it('shifts a range back inside while keeping its span', () => {
      expect(clampRange({ min: -5 * DAY, max: 5 * DAY }, full)).toEqual({ min: 0, max: 10 * DAY })
      expect(clampRange({ min: 195 * DAY, max: 205 * DAY }, full)).toEqual({ min: 190 * DAY, max: 200 * DAY })
    })

    it('limits the span to the full range', () => {
      expect(clampRange({ min: -10 * DAY, max: 300 * DAY }, full)).toEqual(full)
    })
  })

  describe('isZoomed', () => {
    it('compares spans', () => {
      expect(isZoomed(full, full)).toBe(false)
      expect(isZoomed({ min: 0, max: 100 * DAY }, full)).toBe(true)
    })

    it('ignores sub-millisecond rounding', () => {
      expect(isZoomed({ min: 0.2, max: full.max - 0.2 }, full)).toBe(false)
    })
  })

  describe('zoomRange', () => {
    it('zooms around the center by default', () => {
      const next = zoomRange(full, full, 2)
      expect(next).toEqual({ min: 50 * DAY, max: 150 * DAY })
    })

    it('keeps the anchor at the same relative position', () => {
      const range = { min: 40 * DAY, max: 140 * DAY }
      const anchor = 60 * DAY // à 20 % de la vue
      const next = zoomRange(range, full, 2, anchor)
      const ratio = (anchor - next.min) / (next.max - next.min)
      expect(next.max - next.min).toBe(50 * DAY)
      expect(ratio).toBeCloseTo(0.2, 10)
    })

    it('stays inside the full range when the anchor is at an edge', () => {
      const next = zoomRange(full, full, 4, 0)
      expect(next).toEqual({ min: 0, max: 50 * DAY })
      const end = zoomRange(full, full, 4, full.max)
      expect(end).toEqual({ min: 150 * DAY, max: 200 * DAY })
    })

    it('stops at the tightest view', () => {
      let range = full
      for (let i = 0; i < 20; i++) range = zoomRange(range, full, ZOOM_STEP)
      expect(range.max - range.min).toBe(minSpanFor(full))
    })

    it('returns exactly the full range when zooming back out to it', () => {
      const zoomed = zoomRange(full, full, 3, 80 * DAY)
      expect(zoomRange(zoomed, full, 1 / 3, 80 * DAY)).toEqual(full)
      expect(zoomRange(zoomed, full, 0.01)).toEqual(full)
    })

    it('ignores invalid factors', () => {
      const range = { min: 10 * DAY, max: 50 * DAY }
      expect(zoomRange(range, full, 0)).toBe(range)
      expect(zoomRange(range, full, -2)).toBe(range)
      expect(zoomRange(range, full, Number.NaN)).toBe(range)
    })
  })

  describe('panRange', () => {
    const range = { min: 50 * DAY, max: 100 * DAY }

    it('shifts the range', () => {
      expect(panRange(range, full, 10 * DAY)).toEqual({ min: 60 * DAY, max: 110 * DAY })
      expect(panRange(range, full, -10 * DAY)).toEqual({ min: 40 * DAY, max: 90 * DAY })
    })

    it('stops at the edges of the full range', () => {
      expect(panRange(range, full, -500 * DAY)).toEqual({ min: 0, max: 50 * DAY })
      expect(panRange(range, full, 500 * DAY)).toEqual({ min: 150 * DAY, max: 200 * DAY })
    })
  })

  describe('fitLogRange', () => {
    const points = [
      { x: 10, y: 4 },
      { x: 20, y: 5 },
      { x: 30, y: 6 },
      { x: 40, y: 50 },
    ]

    it('fits all points with the log padding', () => {
      expect(fitLogRange(points, { min: 0, max: 50 })).toEqual({ min: 4 / LOG_PAD, max: 50 * LOG_PAD })
    })

    it('fits only the visible points', () => {
      expect(fitLogRange(points, { min: 0, max: 35 })).toEqual({ min: 4 / LOG_PAD, max: 6 * LOG_PAD })
      expect(fitLogRange(points, { min: 15, max: 25 })).toEqual({ min: 5 / LOG_PAD, max: 5 * LOG_PAD })
    })

    it('includes the extra values (retained rhythm)', () => {
      expect(fitLogRange(points, { min: 15, max: 25 }, [8])).toEqual({ min: 5 / LOG_PAD, max: 8 * LOG_PAD })
      expect(fitLogRange(points, { min: 15, max: 25 }, [null, undefined, Number.NaN, 0, -3])).toEqual({
        min: 5 / LOG_PAD,
        max: 5 * LOG_PAD,
      })
    })

    it('falls back to every point when none is visible', () => {
      expect(fitLogRange(points, { min: 100, max: 200 })).toEqual({ min: 4 / LOG_PAD, max: 50 * LOG_PAD })
    })

    it('always returns a positive range wide enough to draw', () => {
      const { min, max } = fitLogRange([{ x: 1, y: 7 }], { min: 0, max: 2 })
      expect(min).toBeGreaterThan(0)
      expect(max / min).toBeCloseTo(LOG_PAD * LOG_PAD, 10)
    })
  })

})
