import { describe, it, expect } from 'vitest'
import {
  formatDurationWords,
  formatEvery,
  formatShortDate,
  forecastNextPurchase,
  describeForecast,
  countOutOfRhythm,
  SOON_RATIO,
} from '@/utils/stats/rhythmSummary.js'
import { DAY } from '@/utils/time.js'

const HOUR = 3_600_000
const MINUTE = 60_000

describe('rhythmSummary', () => {
  describe('formatDurationWords', () => {
    it('writes durations in full words with the right plural', () => {
      expect(formatDurationWords(30_000)).toBe('30 secondes')
      expect(formatDurationWords(5 * MINUTE)).toBe('5 minutes')
      expect(formatDurationWords(1 * HOUR)).toBe('1 heure')
      expect(formatDurationWords(3 * HOUR)).toBe('3 heures')
      expect(formatDurationWords(1 * DAY)).toBe('1 jour')
      expect(formatDurationWords(5 * DAY)).toBe('5 jours')
      expect(formatDurationWords(14 * DAY)).toBe('2 semaines')
      expect(formatDurationWords(30 * DAY)).toBe('1 mois')
      expect(formatDurationWords(90 * DAY)).toBe('3 mois')
    })

    it('rounds up to the next unit when rounding reaches it', () => {
      expect(formatDurationWords(59.7 * MINUTE)).toBe('1 heure')
      expect(formatDurationWords(23.8 * HOUR)).toBe('1 jour')
      expect(formatDurationWords(6.8 * DAY)).toBe('1 semaine')
      expect(formatDurationWords(29.9 * DAY)).toBe('4 semaines')
      expect(formatDurationWords(30.2 * DAY)).toBe('1 mois')
    })

    it('returns null for unusable durations', () => {
      expect(formatDurationWords(0)).toBeNull()
      expect(formatDurationWords(-5)).toBeNull()
      expect(formatDurationWords(Infinity)).toBeNull()
      expect(formatDurationWords(NaN)).toBeNull()
    })
  })

  describe('formatEvery', () => {
    it('agrees the article with the unit gender', () => {
      expect(formatEvery(5 * DAY)).toBe('tous les 5 jours')
      expect(formatEvery(14 * DAY)).toBe('toutes les 2 semaines')
      expect(formatEvery(3 * HOUR)).toBe('toutes les 3 heures')
      expect(formatEvery(90 * DAY)).toBe('tous les 3 mois')
    })

    it('uses the short form for a single unit', () => {
      expect(formatEvery(1 * DAY)).toBe('tous les jours')
      expect(formatEvery(7 * DAY)).toBe('toutes les semaines')
      expect(formatEvery(30 * DAY)).toBe('tous les mois')
      expect(formatEvery(1 * HOUR)).toBe('toutes les heures')
    })

    it('returns null for unusable durations', () => {
      expect(formatEvery(Infinity)).toBeNull()
    })
  })

  describe('formatShortDate', () => {
    const now = new Date(2026, 10, 23).getTime()

    it('omits the year within the current year', () => {
      const text = formatShortDate(new Date(2026, 10, 28).getTime(), now)
      expect(text).toContain('28')
      expect(text).not.toContain('2026')
    })

    it('adds the year when it differs from the current one', () => {
      expect(formatShortDate(new Date(2027, 0, 5).getTime(), now)).toContain('2027')
    })

    it('adds the weekday on request', () => {
      const withDay = formatShortDate(new Date(2026, 10, 28).getTime(), now, { weekday: true })
      expect(withDay.length).toBeGreaterThan(formatShortDate(new Date(2026, 10, 28).getTime(), now).length)
    })
  })

  describe('forecastNextPurchase', () => {
    const now = 100 * DAY
    const make = (overrides = {}) => ({
      lastPurchaseAt: now - 2 * DAY,
      done: true,
      stats: { averageMs: 10 * DAY },
      ...overrides,
    })

    it('estimates the next purchase as last purchase + retained rhythm', () => {
      const forecast = forecastNextPurchase(make(), now)
      expect(forecast.dueAt).toBe(now + 8 * DAY)
      expect(forecast.remainingMs).toBe(8 * DAY)
      expect(forecast.status).toBe('ok')
    })

    it('flags a product as soon once most of the rhythm has elapsed', () => {
      const atThreshold = make({ lastPurchaseAt: now - SOON_RATIO * 10 * DAY })
      expect(forecastNextPurchase(atThreshold, now).status).toBe('soon')
      expect(forecastNextPurchase(make({ lastPurchaseAt: now - 9.9 * DAY }), now).status).toBe('soon')
    })

    it('flags a product as late once the estimated date has passed', () => {
      const forecast = forecastNextPurchase(make({ lastPurchaseAt: now - 13 * DAY }), now)
      expect(forecast.status).toBe('late')
      expect(forecast.remainingMs).toBe(-3 * DAY)
    })

    it('reports a product already on the shopping list as listed', () => {
      expect(forecastNextPurchase(make({ done: false }), now).status).toBe('listed')
      expect(forecastNextPurchase(make({ done: false, lastPurchaseAt: now - 30 * DAY }), now).status).toBe('listed')
    })

    it('returns null without a last purchase or a usable rhythm', () => {
      expect(forecastNextPurchase(make({ lastPurchaseAt: null }), now)).toBeNull()
      expect(forecastNextPurchase(make({ stats: { averageMs: Infinity } }), now)).toBeNull()
      expect(forecastNextPurchase(make({ stats: { averageMs: 0 } }), now)).toBeNull()
      expect(forecastNextPurchase({ lastPurchaseAt: now, done: true }, now)).toBeNull()
    })
  })

  describe('describeForecast', () => {
    const now = new Date(2026, 10, 23).getTime()
    const forecastOf = (status, remainingMs) => ({ dueAt: now + remainingMs, remainingMs, status })

    it('describes a comfortable margin with a neutral badge', () => {
      const { badge, text } = describeForecast(forecastOf('ok', 12 * DAY), now)
      expect(badge).toBe('Dans 2 semaines')
      expect(text).toMatch(/^Prochain achat vers le /)
    })

    it('describes an approaching purchase', () => {
      expect(describeForecast(forecastOf('soon', 2 * DAY), now).badge).toBe('Bientôt · dans 2 jours')
      expect(describeForecast(forecastOf('soon', 5 * HOUR), now).badge).toBe('Bientôt · dans 5 heures')
    })

    it('describes a late purchase with the overdue time and an expected date', () => {
      const { badge, text } = describeForecast(forecastOf('late', -3 * DAY), now)
      expect(badge).toBe('En retard de 3 jours')
      expect(text).toMatch(/^Prochain achat attendu le /)
    })

    it('describes a product already on the list', () => {
      expect(describeForecast(forecastOf('listed', -DAY), now)).toEqual({
        badge: 'À acheter',
        text: 'Déjà sur la liste de courses',
      })
    })
  })

  describe('countOutOfRhythm', () => {
    it('sums every kind of excluded interval', () => {
      expect(countOutOfRhythm({ 'too-long': 1, 'too-short': 2, trimmed: 3 })).toBe(6)
      expect(countOutOfRhythm({ 'too-long': 0, 'too-short': 0, trimmed: 0 })).toBe(0)
      expect(countOutOfRhythm(undefined)).toBe(0)
    })
  })
})
