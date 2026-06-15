import { DAY } from './time.js'

const NOW = Date.now()

function demoTimings(intervalDays, count, agoFraction, done = true, quantity = 1, unit = '') {
  const interval = intervalDays * DAY
  const lastEnd = NOW - interval * agoFraction
  const timings = []
  for (let i = count; i >= 1; i--) {
    const end = lastEnd - interval * i
    timings.push({ start: end - 5000, end, quantity, unit })
  }
  if (done) {
    timings.push({ start: lastEnd - 5000, end: lastEnd, quantity, unit })
  } else {
    timings.push({ start: lastEnd - 5000 })
  }
  return { timings, quantity, unit, conversions: {} }
}

export const defaultLists = [
  { id: 'demo-manger', name: 'Manger', todos: [
    { id: 1, text: 'Lait', done: true, ...demoTimings(4, 5, 0.9, true, 2, 'L') },
    { id: 2, text: 'Pain', done: true, ...demoTimings(2, 6, 0.3, true, 1, '') },
    { id: 3, text: 'Œufs', done: true, ...demoTimings(7, 4, 0.6, true, 6, 'pcs') },
    { id: 4, text: 'Beurre', done: true, ...demoTimings(14, 3, 0.75, true, 250, 'g') },
    { id: 5, text: 'Pâtes', done: false, ...demoTimings(10, 3, 0.4, false, 500, 'g') },
    { id: 6, text: 'Riz', done: false, ...demoTimings(21, 2, 0.1, false, 1, 'kg') },
    { id: 7, text: 'Fruits', done: false, ...demoTimings(5, 4, 0.2, false, 1, 'kg') },
  ]},
  { id: 'demo-maison', name: 'Maison', todos: [
    { id: 8, text: 'Éponges', done: true, ...demoTimings(30, 3, 0.85, true, 3, 'pcs') },
    { id: 9, text: 'Lessive', done: false, ...demoTimings(21, 2, 0.5, false, 2, 'L') },
    { id: 10, text: 'Liquide vaisselle', done: true, ...demoTimings(25, 3, 0.15, true, 500, 'mL') },
    { id: 11, text: 'Sacs poubelle', done: false, ...demoTimings(30, 2, 0.7, false, 1, '') },
    { id: 12, text: 'Sopalin', done: true, ...demoTimings(14, 4, 0.5, true, 6, 'pcs') },
  ]},
  { id: 'demo-hygiene', name: 'Hygiène', todos: [
    { id: 13, text: 'Dentifrice', done: true, ...demoTimings(45, 2, 0.65, true, 1, '') },
    { id: 14, text: 'Shampooing', done: false, ...demoTimings(30, 3, 0.35, false, 250, 'mL') },
    { id: 15, text: 'Savon', done: true, ...demoTimings(20, 3, 0.95, true, 1, '') },
  ]},
]
