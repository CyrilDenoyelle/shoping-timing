import { describe, expect, it } from 'vitest'
import { defaultLists, shouldRefreshDemo, DEMO_REVISION } from '@/utils/todo/demoData.js'
import { analyzeIntervals } from '@/utils/todo/todoIntervals.js'

function analyses() {
  return defaultLists.flatMap((list) =>
    list.todos.map((todo) => ({ text: todo.text, ...analyzeIntervals(todo) })),
  )
}

describe('demo data rhythms', () => {
  it('shows a wave, each exclusion kind, a band and a product too short to filter', () => {
    const all = analyses()
    const reasons = new Set(all.flatMap((a) => a.samples.map((s) => s.exclusion).filter(Boolean)))
    expect(reasons).toEqual(new Set(['too-long', 'too-short', 'trimmed']))

    const waved = all.filter((a) => {
      const used = a.samples.filter((s) => s.used)
      if (used.length < 3) return false
      const ys = used.map((s) => s.scaledMs)
      return Math.max(...ys) / Math.min(...ys) >= 1.5
    })
    expect(waved.length).toBeGreaterThanOrEqual(4)

    expect(all.some((a) => a.medianMs != null && a.lowerMs < a.medianMs && a.medianMs < a.upperMs)).toBe(true)
    expect(all.some((a) => a.samples.length === 2 && a.medianMs == null)).toBe(true)
    expect(all.find((a) => a.text === 'Miel').samples).toHaveLength(1)

    const lait = all.find((a) => a.text === 'Lait')
    const radii = new Set(lait.samples.map((s) => s.qty))
    expect(radii.size).toBeGreaterThanOrEqual(3)
  })

  it('refreshes an untouched demo catalog and keeps a list that was edited', () => {
    expect(shouldRefreshDemo(null, null)).toBe(true)
    expect(shouldRefreshDemo(defaultLists, null)).toBe(true)
    expect(shouldRefreshDemo(defaultLists, DEMO_REVISION)).toBe(false)

    const withExtra = structuredClone(defaultLists)
    withExtra[0].todos.push({ id: 99, text: 'Café', timings: [] })
    expect(shouldRefreshDemo(withExtra, null)).toBe(false)

    const renamed = structuredClone(defaultLists)
    renamed[0].todos[0].text = 'Lait entier'
    expect(shouldRefreshDemo(renamed, null)).toBe(false)
  })
})
