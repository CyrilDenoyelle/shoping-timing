<script setup>
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import ProductRhythmChart from '@/features/stats/components/ProductRhythmChart.vue'
import { buildProductRhythms, filterGroupsByPointCount, filterProductGroups } from '@/utils/stats/productRhythm.js'
import { balancedRows, cardSpansAround } from '@/utils/stats/gridLayout.js'
import { useContainerColumns } from '@/composables/useContainerColumns.js'
import { readChartTheme } from '@/features/stats/chart/theme.js'
import { STORAGE_KEYS, defaultStorage } from '@/services/storage'

const props = defineProps({
  lists: { type: Array, required: true },
})

const plural = (n, one, many) => (n > 1 ? many : one)

// Mode avancé : détails du calcul et axe logarithmique. Décoché (par défaut) : vue simple. Le choix est mémorisé.
const advanced = ref(defaultStorage.getString(STORAGE_KEYS.RHYTHM_ADVANCED) === '1')
watch(advanced, (value) => {
  defaultStorage.setString(STORAGE_KEYS.RHYTHM_ADVANCED, value ? '1' : '0')
})

// Recherche : filtre en direct les cartes par nom de produit ou de liste
const query = ref('')
const searchInput = ref(null)
const isFiltering = computed(() => query.value.trim() !== '')

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

// Échap vide d'abord la recherche ; une recherche vide laisse Échap quitter la page.
function onSearchEscape(event) {
  if (!query.value) return
  event.stopPropagation()
  query.value = ''
}

// Une courbe à un seul point est peu lisible : seuls les produits avec au moins deux intervalles sont affichés.
const MIN_POINTS = 2
const groups = computed(() => filterGroupsByPointCount(buildProductRhythms(props.lists), MIN_POINTS))
const productCount = computed(() => groups.value.reduce((sum, g) => sum + g.products.length, 0))

const visibleGroups = computed(() => filterProductGroups(groups.value, query.value))
const visibleCount = computed(() => visibleGroups.value.reduce((sum, g) => sum + g.products.length, 0))

// Mise en page : rangées équilibrées selon la largeur disponible (7 cartes sur 3 colonnes → 3, 2, 2)
const groupsEl = ref(null)
const columns = useContainerColumns(groupsEl, { minColumnWidth: 320, gap: 10 })

// Carte agrandie (double-clic ou bouton) : une seule à la fois, sur sa propre rangée pleine largeur.
// Les cartes qui la précèdent et celles qui la suivent gardent la répartition équilibrée, et la page défile.
const expandedKey = ref(null)
const scroller = ref(null)
const toolbarEl = ref(null)
const viewportHeight = ref(0)
const toolbarHeight = ref(0)
const EXPANDED_MARGIN_PX = 8
const EXPANDED_MIN_HEIGHT_PX = 320

function measureViewport() {
  viewportHeight.value = scroller.value?.clientHeight ?? 0
  toolbarHeight.value = toolbarEl.value?.offsetHeight ?? 0
}

// Hauteur de la zone visible sous la barre d'outils collée : la carte agrandie la remplit.
const expandedHeight = computed(() =>
  Math.max(EXPANDED_MIN_HEIGHT_PX, viewportHeight.value - toolbarHeight.value - EXPANDED_MARGIN_PX),
)

function toggleExpanded(key) {
  measureViewport()
  expandedKey.value = expandedKey.value === key ? null : key
}

// À l'agrandissement, la carte vient se placer sous la barre d'outils collée. Le défilement vise uniquement
// la zone des cartes : `scrollIntoView` ferait aussi défiler le document (sur mobile, `100vh` dépasse la
// hauteur visible) et pousserait l'en-tête de la page hors de l'écran.
// La réduction ne défile pas : lors d'un passage d'une carte à une autre, elle écraserait le défilement
// de la carte qui s'agrandit.
const cardComponents = new Map()
function setCardRef(key, component) {
  if (component) cardComponents.set(key, component)
  else cardComponents.delete(key)
}
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

watch(expandedKey, async (key) => {
  if (!key) return
  await nextTick()
  const card = cardComponents.get(key)?.$el
  const container = scroller.value
  if (!card || !container) return
  const offset = card.getBoundingClientRect().top - container.getBoundingClientRect().top - toolbarHeight.value
  container.scrollTo({
    top: container.scrollTop + offset,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
})

// Une carte filtrée n'est plus à l'écran : l'état agrandi retombe.
const visibleKeys = computed(() => new Set(visibleGroups.value.flatMap((g) => g.products.map((p) => p.key))))
watch(visibleKeys, (keys) => {
  if (expandedKey.value && !keys.has(expandedKey.value)) expandedKey.value = null
})

// Échap réduit d'abord la carte agrandie, avant de vider la recherche puis de quitter la page.
// Écouteur en phase de capture : il passe avant celui de la page, quel que soit l'ordre de montage.
function onEscapeCapture(event) {
  if (event.key !== 'Escape' || !expandedKey.value) return
  event.stopPropagation()
  expandedKey.value = null
}

// Un filtre qui ne laisse qu'une liste : ses cartes grandissent aussi en hauteur pour occuper l'écran.
const fillsScreen = computed(
  () => isFiltering.value && visibleGroups.value.length === 1 && !expandedKey.value,
)
const sections = computed(() =>
  visibleGroups.value.map((group) => ({
    ...group,
    spans: cardSpansAround(
      group.products.length,
      group.products.findIndex((p) => p.key === expandedKey.value),
      columns.value,
    ),
    rows: balancedRows(group.products.length, columns.value).length,
  })),
)

const resultLabel = computed(() => {
  const total = productCount.value
  if (isFiltering.value) {
    return `${visibleCount.value} ${plural(visibleCount.value, 'produit', 'produits')} sur ${total}`
  }
  return `${total} ${plural(total, 'produit mesuré', 'produits mesurés')}`
})

const theme = ref(readChartTheme())
const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
const refreshTheme = () => {
  theme.value = readChartTheme()
}

let viewportObserver = null

onMounted(() => {
  refreshTheme()
  colorScheme.addEventListener('change', refreshTheme)
  document.addEventListener('keydown', onEscapeCapture, true)
  measureViewport()
  if (typeof ResizeObserver !== 'undefined' && scroller.value) {
    viewportObserver = new ResizeObserver(measureViewport)
    viewportObserver.observe(scroller.value)
  }
})

onBeforeUnmount(() => {
  colorScheme.removeEventListener('change', refreshTheme)
  document.removeEventListener('keydown', onEscapeCapture, true)
  viewportObserver?.disconnect()
  viewportObserver = null
})
</script>

<template>
  <section ref="scroller" class="rhythm-stats" aria-labelledby="rhythm-title">
    <h2 id="rhythm-title" class="rhythm-title">Rythme de chaque produit</h2>

    <p v-if="advanced" class="rhythm-hint">
      Chaque point est un intervalle entre deux achats, ramené à la quantité du sélecteur. Les points pleins
      servent au calcul du rythme, les croix en sont écartées. L'axe vertical est logarithmique : un intervalle
      3 fois plus long et un intervalle 3 fois plus court sont à égale distance de la médiane. Chaque courbe se
      zoome séparément (boutons, Ctrl + molette ou pincement), puis se déplace en glissant. Un double-clic
      agrandit une courbe à tout l'écran.
    </p>
    <p v-else class="rhythm-hint">
      Chaque point est un intervalle entre deux achats. La zone verte indique le rythme habituel, et les ronds
      creux sont les intervalles hors habitude. Un double-clic agrandit une courbe à tout l'écran.
    </p>

    <ul v-if="advanced && productCount > 0" class="legend" aria-label="Légende">
      <li><span class="lg lg-used" aria-hidden="true" />Utilisé dans le calcul</li>
      <li><span class="lg lg-excluded" aria-hidden="true">✕</span>Trop long ou trop court</li>
      <li><span class="lg lg-trimmed" aria-hidden="true">✕</span>Hors des 2/3 les plus proches</li>
      <li><span class="lg lg-band" aria-hidden="true" />Plage retenue</li>
      <li><span class="lg lg-mean" aria-hidden="true" />Rythme retenu</li>
      <li>Taille du point : quantité achetée</li>
    </ul>

    <div v-if="productCount > 0" ref="toolbarEl" class="toolbar">
      <form class="search" role="search" @submit.prevent>
        <label class="sr-only" for="rhythm-search">Rechercher un produit ou une liste</label>
        <input
          id="rhythm-search"
          ref="searchInput"
          v-model="query"
          class="search-input"
          type="search"
          placeholder="Produit ou liste…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="search"
          @keydown.esc="onSearchEscape"
        />
        <button v-if="query" type="button" class="search-clear" aria-label="Effacer la recherche" @click="clearSearch">
          ✕
        </button>
      </form>
      <label class="advanced-toggle">
        <input v-model="advanced" type="checkbox" />
        Mode avancé
      </label>
    </div>

    <p v-if="productCount > 0" class="rhythm-total" role="status">{{ resultLabel }}</p>

    <div v-if="productCount === 0" class="rhythm-empty">
      Pas encore de courbe à afficher. Il faut au moins trois achats d’un même produit : coche-le sur tes
      listes à trois reprises pour voir sa courbe.
    </div>

    <div v-else-if="visibleCount === 0" class="rhythm-empty">
      Aucun produit ne correspond à « {{ query.trim() }} ».
      <button type="button" class="link-btn" @click="clearSearch">Effacer la recherche</button>
    </div>

    <div ref="groupsEl" class="groups" :class="{ 'groups-fill': fillsScreen }">
      <section
        v-for="section in sections"
        :key="section.listId"
        class="rhythm-group"
        :class="{ 'rhythm-group-fill': fillsScreen }"
        :style="fillsScreen ? { '--card-rows': section.rows } : undefined"
        :aria-labelledby="`rhythm-group-${section.listId}`"
      >
        <header class="group-header">
          <h3 :id="`rhythm-group-${section.listId}`" class="group-title">
            {{ section.listName || 'Liste sans nom' }}
          </h3>
          <span class="group-count">
            {{ section.products.length }} {{ plural(section.products.length, 'produit', 'produits') }}
          </span>
        </header>
        <div class="cards">
          <ProductRhythmChart
            v-for="(product, index) in section.products"
            :key="product.key"
            :ref="(component) => setCardRef(product.key, component)"
            :style="{
              gridColumn: `span ${section.spans[index]}`,
              height: product.key === expandedKey ? `${expandedHeight}px` : undefined,
            }"
            :product="product"
            :theme="theme"
            :expanded="product.key === expandedKey"
            :advanced="advanced"
            @toggle-expand="toggleExpanded(product.key)"
          />
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
/* Toute la section défile (titre, légende et cartes) : sur mobile, l'en-tête ne mange pas la hauteur des courbes. */
.rhythm-stats {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  /* Largeur stable avec ou sans barre de défilement : le nombre de colonnes ne bascule pas en boucle. */
  scrollbar-gutter: stable;
  padding-bottom: 0.5rem;
}

.rhythm-stats > * {
  flex-shrink: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.rhythm-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--color-heading);
  line-height: 1.25;
  flex-shrink: 0;
}

.rhythm-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  line-height: 1.4;
  flex-shrink: 0;
}

.rhythm-total {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  list-style: none;
  padding: 0;
  font-size: 0.72rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.lg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.lg-used {
  width: 10px;
  height: 10px;
  margin: 2px;
  border-radius: 50%;
  background: var(--accent);
}

.lg-excluded {
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1;
  color: var(--danger);
}

.lg-trimmed {
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-text-muted);
}

.lg-band {
  width: 16px;
  height: 10px;
  background: var(--accent-soft);
  border-radius: 2px;
}

.lg-mean {
  width: 18px;
  height: 0;
  border-top: 2px dashed var(--accent);
}

/* Barre d'outils collée en haut : la recherche reste accessible pendant le défilement. */
.toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  background: var(--color-background);
}

.search {
  position: relative;
  flex: 1 1 220px;
  min-width: 0;
  display: flex;
}

.search-input {
  width: 100%;
  min-width: 0;
  padding: 0.45rem 2.4rem 0.45rem 0.75rem;
  /* 16 px : iOS ne zoome pas la page au focus. */
  font-size: 1rem;
  font-family: inherit;
  color: var(--color-text);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  transition: border-color 0.2s;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.search-input:hover {
  border-color: var(--color-border-hover);
}

.search-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
}

.advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
  min-height: 2.25rem;
  font-size: 0.85rem;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
}

.advanced-toggle input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--accent);
  cursor: pointer;
}

.advanced-toggle:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 6px;
}

/* Le bouton d'effacement du champ est dessiné par le composant, identique sur tous les navigateurs. */
.search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 0.2rem;
  transform: translateY(-50%);
  width: 2.2rem;
  height: 2.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  line-height: 1;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.search-clear:hover {
  color: var(--color-text);
}

.search-clear:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Une seule liste après filtre : le bloc grandit pour remplir l'écran, et dépasse si les cartes
   ont besoin de plus que la hauteur visible (la page défile alors). */
.groups-fill {
  flex: 1 0 auto;
}

.rhythm-group-fill {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}

.rhythm-group-fill .cards {
  flex: 1 0 auto;
  grid-template-rows: repeat(var(--card-rows), minmax(17rem, 1fr));
}

.rhythm-group-fill :deep(.rhythm-card) {
  height: 100%;
}

.rhythm-group-fill :deep(.chart-box) {
  flex: 1 1 auto;
  height: auto;
  min-height: 180px;
}

/* Chaque liste est ouverte par un bandeau coloré : les catégories se distinguent d'un coup d'œil. */
.group-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
  padding: 0.5rem 0.85rem;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  border-left-width: 5px;
  border-radius: 8px;
}

.group-title {
  min-width: 0;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--color-heading);
  word-break: break-word;
}

.group-count {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
}

/* 12 colonnes : chaque carte en occupe 12 / (cartes de sa rangée), calculé par cardSpans. */
.cards {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.6rem;
}

.rhythm-empty {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  padding: 0.75rem 0;
  line-height: 1.5;
  flex-shrink: 0;
}

.link-btn {
  margin-left: 0.4rem;
  padding: 0.2rem 0;
  font-size: inherit;
  color: var(--accent);
  background: none;
  border: 0;
  text-decoration: underline;
  cursor: pointer;
}
</style>
