export function debounce(fn, ms) {
  let timer = null
  let lastArgs = null

  const debounced = (...args) => {
    lastArgs = args
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...lastArgs)
      lastArgs = null
    }, ms)
  }

  debounced.flush = () => {
    if (timer == null || lastArgs == null) return
    clearTimeout(timer)
    timer = null
    fn(...lastArgs)
    lastArgs = null
  }

  return debounced
}
