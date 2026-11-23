import { DAY } from '@/utils/time.js'

const NOW = Date.now()

/**
 * Historique d'un produit de démo.
 * Chaque `steps[i]` est l'achat qui ouvre un intervalle : quantité achetée, puis jours jusqu'à l'achat suivant.
 * Le dernier achat terminé ferme le dernier intervalle et porte la quantité du sélecteur.
 * `agoFraction` le place dans le cycle (0 = vient d'être acheté, 1 = le cycle moyen est écoulé).
 */
function demoTodo({ steps, agoFraction, done, quantity, unit }) {
  const gaps = steps.map((step) => step.days * DAY)
  const typical = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
  const lastEnd = NOW - typical * agoFraction
  const ends = new Array(steps.length + 1)
  ends[ends.length - 1] = lastEnd
  for (let i = ends.length - 2; i >= 0; i--) ends[i] = ends[i + 1] - gaps[i]

  const timings = ends.map((end, i) => ({
    start: end - 5000,
    end,
    quantity: i < steps.length ? steps[i].qty : quantity,
    unit,
  }))
  if (!done) timings.push({ start: NOW - 3_600_000, quantity, unit })
  return { timings, quantity, unit, conversions: {} }
}

/** Incrémenter quand l'historique de démo change, pour rafraîchir un jeu encore intact. */
export const DEMO_REVISION = '2'

// Produits du jeu de démo. Un produit ajouté, retiré ou renommé bloque le remplacement.
const STOCK_DEMO = [
  ['demo-manger', ['Lait', 'Pain', 'Œufs', 'Beurre', 'Pâtes', 'Riz', 'Fruits']],
  ['demo-maison', ['Éponges', 'Lessive', 'Liquide vaisselle', 'Sacs poubelle', 'Sopalin']],
  ['demo-hygiene', ['Dentifrice', 'Shampooing', 'Savon']],
]

/** Vrai quand les listes sont encore exactement le catalogue de démo (mêmes ids, mêmes produits, même ordre). */
export function isStockCatalog(lists) {
  if (!Array.isArray(lists) || lists.length !== STOCK_DEMO.length) return false
  for (let i = 0; i < STOCK_DEMO.length; i++) {
    const [id, texts] = STOCK_DEMO[i]
    const list = lists[i]
    if (list?.id !== id) return false
    const todos = list.todos ?? []
    if (todos.length !== texts.length || todos.some((todo, j) => todo.text !== texts[j])) return false
  }
  return true
}

/**
 * Le jeu de démo est réinstallé tant que le catalogue d'origine est intact et que la révision
 * enregistrée n'est pas la révision courante. Une liste personnelle n'est pas touchée.
 */
export function shouldRefreshDemo(lists, revision) {
  if (revision === DEMO_REVISION) return false
  if (lists == null) return true
  return isStockCatalog(lists)
}

export const defaultLists = [
  { id: 'demo-manger', name: 'Manger', todos: [
    // Quantités variables, un rachat le jour même et une pause : la courbe bouge, les croix apparaissent.
    { id: 1, text: 'Lait', done: true, ...demoTodo({
      agoFraction: 0.9, done: true, quantity: 2, unit: 'L',
      steps: [
        { qty: 2, days: 3 }, { qty: 2, days: 5 }, { qty: 6, days: 14 }, { qty: 2, days: 4 },
        { qty: 1, days: 2 }, { qty: 2, days: 6 }, { qty: 4, days: 7 }, { qty: 2, days: 3.5 },
        { qty: 2, days: 8 }, { qty: 2, days: 0.4 }, { qty: 3, days: 9 }, { qty: 2, days: 4.5 },
        { qty: 2, days: 22 },
      ],
    }) },
    // Rythme court, bruit d'une journée à l'autre, un oubli d'une semaine.
    { id: 2, text: 'Pain', done: true, ...demoTodo({
      agoFraction: 0.3, done: true, quantity: 1, unit: '',
      steps: [
        { qty: 1, days: 1.4 }, { qty: 1, days: 2.2 }, { qty: 2, days: 5 }, { qty: 1, days: 1.8 },
        { qty: 1, days: 2.6 }, { qty: 1, days: 1.2 }, { qty: 1, days: 3.4 }, { qty: 1, days: 2 },
        { qty: 1, days: 0.2 }, { qty: 1, days: 4 }, { qty: 2, days: 3 }, { qty: 1, days: 9 },
      ],
    }) },
    // La boîte de 12 dure plus longtemps au calendrier, le rythme par œuf reste proche.
    { id: 3, text: 'Œufs', done: true, ...demoTodo({
      agoFraction: 0.6, done: true, quantity: 6, unit: 'pcs',
      steps: [
        { qty: 6, days: 6 }, { qty: 6, days: 8 }, { qty: 12, days: 15 }, { qty: 6, days: 5 },
        { qty: 6, days: 9 }, { qty: 6, days: 7 }, { qty: 6, days: 50 },
      ],
    }) },
    // Quatre intervalles : assez pour la plage, un seul écart largement au-dessus.
    { id: 4, text: 'Beurre', done: true, ...demoTodo({
      agoFraction: 0.75, done: true, quantity: 250, unit: 'g',
      steps: [
        { qty: 250, days: 11 }, { qty: 250, days: 15 }, { qty: 250, days: 13 }, { qty: 250, days: 75 },
      ],
    }) },
    // Tout reste dans la plage : courbe douce, un achat groupé plus gros.
    { id: 5, text: 'Pâtes', done: false, ...demoTodo({
      agoFraction: 0.4, done: false, quantity: 500, unit: 'g',
      steps: [
        { qty: 500, days: 8 }, { qty: 500, days: 12 }, { qty: 1000, days: 18 },
        { qty: 500, days: 9 }, { qty: 500, days: 14 },
      ],
    }) },
    // Deux intervalles : les deux sont gardés, sans plage.
    { id: 6, text: 'Riz', done: false, ...demoTodo({
      agoFraction: 0.1, done: false, quantity: 1, unit: 'kg',
      steps: [
        { qty: 1, days: 18 }, { qty: 1, days: 45 },
      ],
    }) },
    // Saison serrée, puis une pause de six semaines qui sort de la plage.
    { id: 7, text: 'Fruits', done: false, ...demoTodo({
      agoFraction: 0.2, done: false, quantity: 1, unit: 'kg',
      steps: [
        { qty: 1, days: 4 }, { qty: 1, days: 5 }, { qty: 2, days: 11 }, { qty: 1, days: 6 },
        { qty: 1, days: 4.5 }, { qty: 1, days: 7 }, { qty: 1, days: 3.5 }, { qty: 1, days: 8 },
        { qty: 1, days: 42 }, { qty: 1, days: 5 }, { qty: 1, days: 6 }, { qty: 1, days: 4 },
      ],
    }) },
  ]},
  { id: 'demo-maison', name: 'Maison', todos: [
    { id: 8, text: 'Éponges', done: true, ...demoTodo({
      agoFraction: 0.85, done: true, quantity: 3, unit: 'pcs',
      steps: [
        { qty: 3, days: 24 }, { qty: 1, days: 10 }, { qty: 6, days: 40 },
        { qty: 3, days: 20 }, { qty: 3, days: 110 }, { qty: 2, days: 16 },
      ],
    }) },
    { id: 9, text: 'Lessive', done: false, ...demoTodo({
      agoFraction: 0.5, done: false, quantity: 2, unit: 'L',
      steps: [
        { qty: 2, days: 16 }, { qty: 4, days: 28 }, { qty: 2, days: 22 },
      ],
    }) },
    { id: 10, text: 'Liquide vaisselle', done: true, ...demoTodo({
      agoFraction: 0.15, done: true, quantity: 500, unit: 'mL',
      steps: [
        { qty: 500, days: 18 }, { qty: 500, days: 28 }, { qty: 1000, days: 40 },
        { qty: 250, days: 8 }, { qty: 500, days: 95 },
      ],
    }) },
    { id: 11, text: 'Sacs poubelle', done: false, ...demoTodo({
      agoFraction: 0.7, done: false, quantity: 1, unit: '',
      steps: [
        { qty: 1, days: 22 }, { qty: 1, days: 48 },
      ],
    }) },
    { id: 12, text: 'Sopalin', done: true, ...demoTodo({
      agoFraction: 0.5, done: true, quantity: 6, unit: 'pcs',
      steps: [
        { qty: 6, days: 10 }, { qty: 6, days: 16 }, { qty: 12, days: 22 },
        { qty: 6, days: 12 }, { qty: 3, days: 9 },
      ],
    }) },
  ]},
  { id: 'demo-hygiene', name: 'Hygiène', todos: [
    { id: 13, text: 'Dentifrice', done: true, ...demoTodo({
      agoFraction: 0.65, done: true, quantity: 1, unit: '',
      steps: [
        { qty: 1, days: 35 }, { qty: 1, days: 52 }, { qty: 2, days: 80 }, { qty: 1, days: 40 },
      ],
    }) },
    { id: 14, text: 'Shampooing', done: false, ...demoTodo({
      agoFraction: 0.35, done: false, quantity: 250, unit: 'mL',
      steps: [
        { qty: 250, days: 22 }, { qty: 500, days: 55 }, { qty: 250, days: 30 },
      ],
    }) },
    { id: 15, text: 'Savon', done: true, ...demoTodo({
      agoFraction: 0.95, done: true, quantity: 1, unit: '',
      steps: [
        { qty: 1, days: 14 }, { qty: 1, days: 22 }, { qty: 2, days: 30 },
        { qty: 1, days: 12 }, { qty: 1, days: 70 },
      ],
    }) },
  ]},
]
