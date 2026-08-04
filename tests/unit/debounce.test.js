import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from '@/utils/debounce.js'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls fn once after the delay with the latest args', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d('a')
    d('b')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('flush invokes pending call immediately', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d(1)
    d.flush()
    expect(fn).toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel drops the pending call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d(1)
    d.cancel()
    vi.advanceTimersByTime(300)
    expect(fn).not.toHaveBeenCalled()
  })
})
