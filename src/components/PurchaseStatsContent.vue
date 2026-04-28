<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js'
import {
  collectPurchaseEvents,
  buildTimelineSeries,
  formatPurchaseQtyLabel,
  TIMELINE_PERIODS,
} from '../utils/purchaseTimeline'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const TOOLTIP_MARK = 'data-purchase-stats-tooltip'
const TOOLTIP_HIDE_DELAY_MS = 150

/** Dernier chart stats (pour la fermeture différée depuis le tooltip HTML) */
let purchaseStatsTooltipLastChart = null
let purchaseStatsTooltipHideTimer = null
let purchaseStatsTooltipPointerInside = false

function clearPurchaseStatsTooltipHideTimer() {
  if (purchaseStatsTooltipHideTimer != null) {
    clearTimeout(purchaseStatsTooltipHideTimer)
    purchaseStatsTooltipHideTimer = null
  }
}

function hidePurchaseStatsTooltipEl(el) {
  if (!el) return
  el.style.opacity = '0'
  el.style.visibility = 'hidden'
  el.style.pointerEvents = 'none'
}

/**
 * @param {HTMLElement} el
 * @param {import('chart.js').Chart | null} chart
 */
function scheduleHidePurchaseStatsTooltip(el, chart) {
  clearPurchaseStatsTooltipHideTimer()
  purchaseStatsTooltipHideTimer = setTimeout(() => {
    purchaseStatsTooltipHideTimer = null
    if (purchaseStatsTooltipPointerInside) return
    if (chart?.tooltip && chart.tooltip.opacity !== 0) return
    hidePurchaseStatsTooltipEl(el)
  }, TOOLTIP_HIDE_DELAY_MS)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
}

const TOOLTIP_UNLISTED_LABEL = 'Sans liste'

/**
 * Regroupe les lignes du tooltip par liste, trie les groupes et les lignes.
 * @param {Array<{ quantitySum: number, unit: string, text: string, list: string }>} items
 * @returns {Array<{ listName: string, items: typeof items }>}
 */
function groupTooltipDetailByList(items) {
  if (!items?.length) return []
  /** @type {Map<string, typeof items>} */
  const m = new Map()
  for (const it of items) {
    const key = String(it.list ?? '').trim()
    const label = key.length > 0 ? key : TOOLTIP_UNLISTED_LABEL
    if (!m.has(label)) m.set(label, [])
    m.get(label).push(it)
  }
  for (const arr of m.values()) {
    arr.sort(
      (a, b) =>
        b.quantitySum - a.quantitySum || a.text.localeCompare(b.text, 'fr', { sensitivity: 'base' })
    )
  }
  return [...m.entries()]
    .sort(([a], [b]) => {
      if (a === TOOLTIP_UNLISTED_LABEL) return 1
      if (b === TOOLTIP_UNLISTED_LABEL) return -1
      return a.localeCompare(b, 'fr', { sensitivity: 'base' })
    })
    .map(([listName, groupItems]) => ({ listName, items: groupItems }))
}

/**
 * @param {{ quantitySum: number, unit: string, text: string }} row — sans suffixe liste (affichée au-dessus)
 */
function tooltipRowHtml(row) {
  const label = escapeHtml(row.text || 'Sans titre')
  const u = String(row.unit ?? '').trim()
  const qtyLabel = formatPurchaseQtyLabel(row.quantitySum, u)
  const showQtyBadge = row.quantitySum !== 1 || u.length > 0
  if (showQtyBadge) {
    const badge = `<span class="pst-tooltip__badge" aria-label="Quantité : ${escapeAttr(qtyLabel)}">${escapeHtml(qtyLabel)}</span>`
    return `<div class="pst-tooltip__row">${badge}<span class="pst-tooltip__label">${label}</span></div>`
  }
  return `<div class="pst-tooltip__row"><span class="pst-tooltip__label">${label}</span></div>`
}

const props = defineProps({
  lists: { type: Array, required: true },
})

const periodId = ref(TIMELINE_PERIODS[1].id)
const nowMs = ref(Date.now())

const TOOLTIP_OFFSET_X = 12
const TOOLTIP_VIEWPORT_PAD = 8

/**
 * Point d’ancrage du tooltip en coordonnées viewport (préfère la barre active, pas caret animé).
 * @param {import('chart.js').Chart} chart
 * @param {import('chart.js').Tooltip} tooltip
 */
function getTooltipAnchorInViewport(chart, tooltip) {
  const canvas = chart.canvas
  const cr = canvas.getBoundingClientRect()
  const item = tooltip.dataPoints?.[0]
  const element = item?.element
  if (element && typeof element.tooltipPosition === 'function') {
    const p = element.tooltipPosition()
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return { x: cr.left + p.x, y: cr.top + p.y }
    }
  }
  const cx = tooltip.caretX
  const cy = tooltip.caretY
  if (Number.isFinite(cx) && Number.isFinite(cy)) {
    return { x: cr.left + cx, y: cr.top + cy }
  }
  const ca = chart.chartArea
  if (ca && Number.isFinite(ca.left)) {
    return {
      x: cr.left + (ca.left + ca.right) / 2,
      y: cr.top + (ca.top + ca.bottom) / 2,
    }
  }
  return { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 }
}

/**
 * @param {HTMLElement} el
 * @param {number} ax
 * @param {number} ay
 */
function clampTooltipInViewport(el, ax, ay) {
  const vv = window.visualViewport
  const vLeft = vv?.offsetLeft ?? 0
  const vTop = vv?.offsetTop ?? 0
  const vW = vv?.width ?? window.innerWidth
  const vH = vv?.height ?? window.innerHeight
  const pad = TOOLTIP_VIEWPORT_PAD
  const minX = vLeft + pad
  const maxX = vLeft + vW - pad
  const minY = vTop + pad
  const maxY = vTop + vH - pad

  const place = (left, top) => {
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }

  let left = ax + TOOLTIP_OFFSET_X
  let top = ay
  el.style.marginLeft = '0'
  el.style.marginTop = '0'
  el.style.transform = 'translateY(-50%)'
  place(left, top)

  const adjust = () => {
    let r = el.getBoundingClientRect()

    if (r.right > maxX) {
      left = ax - TOOLTIP_OFFSET_X - r.width
      place(left, top)
      r = el.getBoundingClientRect()
    }
    if (r.left < minX) {
      left = minX
      place(left, top)
      r = el.getBoundingClientRect()
    }
    if (r.right > maxX) {
      left = Math.max(minX, maxX - r.width)
      place(left, top)
      r = el.getBoundingClientRect()
    }

    if (r.top < minY) {
      top += minY - r.top
      place(left, top)
      r = el.getBoundingClientRect()
    }
    if (r.bottom > maxY) {
      top -= r.bottom - maxY
      place(left, top)
    }
  }

  requestAnimationFrame(() => {
    adjust()
    requestAnimationFrame(adjust)
  })
}

function setPeriod(id) {
  periodId.value = id
}

function readChartTheme() {
  const root = document.documentElement
  const style = getComputedStyle(root)
  return {
    muted: style.getPropertyValue('--color-text-muted').trim() || '#888',
    text: style.getPropertyValue('--color-text').trim() || '#111',
    border: style.getPropertyValue('--color-border').trim() || '#e0e0e0',
    accent: style.getPropertyValue('--accent').trim() || 'hsla(160, 100%, 37%, 1)',
    accentSoft: style.getPropertyValue('--accent-soft').trim() || 'hsla(160, 100%, 37%, 0.15)',
  }
}

const theme = ref(readChartTheme())

const series = computed(() =>
  buildTimelineSeries(
    collectPurchaseEvents(props.lists),
    nowMs.value,
    periodId.value
  )
)

const chartData = computed(() => {
  const { labels, counts } = series.value
  const t = theme.value
  return {
    labels,
    datasets: [
      {
        label: 'Achats',
        data: counts,
        backgroundColor: t.accentSoft,
        borderColor: t.accent,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 28,
        categoryPercentage: 0.82,
        barPercentage: 0.9,
      },
    ],
  }
})

/** Hauteur mini du canvas : une ligne par période, lisible au doigt sur mobile */
const chartMinHeight = computed(() => {
  const n = series.value.labels.length
  if (n === 0) return 160
  return Math.max(160, n * 34 + 56)
})

const chartOptions = computed(() => {
  const t = theme.value
  const tooltipRowsPerBucket = series.value.tooltipRowsPerBucket ?? []
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    // Événements explicites : même défaut que Chart.js, utile pour le suivi tactile.
    events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
    // Avec barres horizontales, l’échelle catégorielle est sur Y : sans axis: 'y',
    // Chart.js cible le mauvais index (axe X = valeurs numériques).
    interaction: {
      mode: 'index',
      axis: 'y',
      intersect: false,
    },
    hover: {
      mode: 'index',
      axis: 'y',
      intersect: false,
    },
    layout: { padding: { left: 0, right: 8, top: 4, bottom: 4 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        displayColors: false,
        mode: 'index',
        axis: 'y',
        intersect: false,
        animation: { duration: 0 },
        external(context) {
          let el = document.querySelector(`[${TOOLTIP_MARK}]`)
          if (!el) {
            el = document.createElement('div')
            el.setAttribute(TOOLTIP_MARK, '')
            el.setAttribute('role', 'tooltip')
            document.body.appendChild(el)
            el.addEventListener('mouseenter', () => {
              purchaseStatsTooltipPointerInside = true
              clearPurchaseStatsTooltipHideTimer()
            })
            el.addEventListener('mouseleave', () => {
              purchaseStatsTooltipPointerInside = false
              scheduleHidePurchaseStatsTooltip(el, purchaseStatsTooltipLastChart)
            })
          }

          const { chart, tooltip } = context
          purchaseStatsTooltipLastChart = chart

          if (tooltip.opacity === 0) {
            scheduleHidePurchaseStatsTooltip(el, chart)
            return
          }

          const dp = tooltip.dataPoints?.[0]
          if (!dp) {
            scheduleHidePurchaseStatsTooltip(el, chart)
            return
          }

          clearPurchaseStatsTooltipHideTimer()

          const dataIndex = dp.dataIndex
          const periodLabel = chart.data.labels[dataIndex] ?? ''
          const n = Number(dp.raw) || 0
          const detail = tooltipRowsPerBucket[dataIndex] ?? { items: [] }

          const totalLine =
            n === 0 ? 'Aucun achat' : n === 1 ? '1 achat en tout' : `${n} achats en tout`

          const groups = groupTooltipDetailByList(detail.items)
          const hideGroupTitles =
            groups.length === 1 && groups[0].listName === TOOLTIP_UNLISTED_LABEL

          const rowsHtml = groups
            .map(({ listName, items: groupItems }) => {
              const inner = groupItems.map((row) => tooltipRowHtml(row)).join('')
              if (hideGroupTitles) return inner
              const title = `<div class="pst-tooltip__group-h">${escapeHtml(listName)}</div>`
              return `<div class="pst-tooltip__group">${title}<div class="pst-tooltip__group-rows">${inner}</div></div>`
            })
            .join('')

          const detailSection =
            n > 0 && detail.items.length > 0
              ? `<div class="pst-tooltip__section"><div class="pst-tooltip__detail-hint">Détail</div><div class="pst-tooltip__rows">${rowsHtml}</div></div>`
              : ''

          el.innerHTML = `<div class="pst-tooltip" style="--pst-muted:${t.muted};--pst-text:${t.text};--pst-border:${t.border};--pst-accent:${t.accent};--pst-accent-soft:${t.accentSoft}">
            <div class="pst-tooltip__title">${escapeHtml(periodLabel)}</div>
            <div class="pst-tooltip__total">${escapeHtml(totalLine)}</div>
            ${detailSection}
          </div>`

          el.style.opacity = '1'
          el.style.visibility = 'visible'
          el.style.position = 'fixed'
          el.style.pointerEvents = 'auto'
          el.style.zIndex = '10000'

          const { x: ax, y: ay } = getTooltipAnchorInViewport(chart, tooltip)
          clampTooltipInViewport(el, ax, ay)
        },
      },
    },
    scales: {
      x: {
        position: 'bottom',
        beginAtZero: true,
        grace: '12%',
        title: {
          display: true,
          text: 'Nombre d’achats',
          color: t.muted,
          font: { size: 11, weight: '500' },
        },
        ticks: {
          color: t.muted,
          precision: 0,
          stepSize: 1,
        },
        grid: { color: t.border },
      },
      y: {
        position: 'left',
        reverse: true,
        title: {
          display: true,
          text: 'Temps',
          color: t.muted,
          font: { size: 11, weight: '500' },
        },
        ticks: {
          color: t.muted,
          autoSkip: false,
          font: { size: 11 },
        },
        grid: { display: false, drawBorder: false },
      },
    },
  }
})

function refreshNow() {
  nowMs.value = Date.now()
}

function onThemeMedia() {
  theme.value = readChartTheme()
}

onMounted(() => {
  refreshNow()
  theme.value = readChartTheme()
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onThemeMedia)
  } catch {
    /* ignore */
  }
})

onBeforeUnmount(() => {
  clearPurchaseStatsTooltipHideTimer()
  purchaseStatsTooltipLastChart = null
  purchaseStatsTooltipPointerInside = false
  document.querySelector(`[${TOOLTIP_MARK}]`)?.remove()
  try {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', onThemeMedia)
  } catch {
    /* ignore */
  }
})

watch(periodId, refreshNow)
</script>

<template>
  <section class="purchase-stats" aria-labelledby="stats-title">
    <h2 id="stats-title" class="stats-title">Au fil de tes achats</h2>

    <p class="stats-hint">
      Quand tu coches des produits sur tes listes, chaque coche compte comme un achat et alimente ce graphique.
      <span v-if="series.total > 0" class="stats-total">{{ series.total }} sur la période</span>
    </p>

    <div class="period-row" role="group" aria-label="Période">
      <button
        v-for="p in TIMELINE_PERIODS"
        :key="p.id"
        type="button"
        class="period-btn"
        :class="{ active: periodId === p.id }"
        @click="setPeriod(p.id)"
      >
        {{ p.label }}
      </button>
    </div>

    <div v-if="series.total === 0" class="stats-empty">
      Pas encore d’achat sur cette période. Coche des articles sur tes listes pour voir la courbe se remplir.
    </div>
    <div v-else class="chart-wrap">
      <div class="chart-inner" :style="{ minHeight: `${chartMinHeight}px` }">
        <Bar :data="chartData" :options="chartOptions" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.purchase-stats {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow: hidden;
}

.stats-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--color-heading);
  line-height: 1.25;
  flex-shrink: 0;
}

.stats-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  line-height: 1.4;
  flex-shrink: 0;
}

.stats-total {
  display: block;
  margin-top: 0.35rem;
  font-weight: 600;
  color: var(--accent);
}

.period-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  flex-shrink: 0;
}

.period-btn {
  padding: 0.35rem 0.65rem;
  font-size: 0.78rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}

.period-btn:hover {
  border-color: var(--color-border-hover);
  color: var(--color-text);
}

.period-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.chart-wrap {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  margin-top: 0.15rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
}

.chart-inner {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  position: relative;
}

.chart-inner :deep(canvas) {
  display: block;
  -webkit-tap-highlight-color: transparent;
  touch-action: pan-y;
}

.stats-empty {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  padding: 0.75rem 0;
  line-height: 1.5;
  flex-shrink: 0;
}
</style>

<!-- Tooltip monté sur body : styles globaux (hors scope du SFC) -->
<style>
[data-purchase-stats-tooltip] .pst-tooltip {
  min-width: 10rem;
  max-width: min(22rem, calc(100vw - 2rem));
  padding: 0.55rem 0.65rem 0.6rem;
  border: 1px solid var(--pst-border);
  border-radius: 8px;
  background: var(--color-background, #fff);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--pst-text);
  pointer-events: auto;
}

[data-purchase-stats-tooltip] .pst-tooltip__title {
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--color-heading, var(--pst-text));
  margin-bottom: 0.2rem;
}

[data-purchase-stats-tooltip] .pst-tooltip__total {
  color: var(--pst-accent);
  font-weight: 600;
  font-size: 0.8rem;
}

[data-purchase-stats-tooltip] .pst-tooltip__section {
  margin-top: 0.45rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--pst-border);
}

[data-purchase-stats-tooltip] .pst-tooltip__detail-hint {
  font-size: 0.6rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--pst-muted);
  margin-bottom: 0.35rem;
}

[data-purchase-stats-tooltip] .pst-tooltip__rows {
  max-height: min(42vh, 14rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding-right: 0.15rem;
  margin-right: -0.15rem;
}

[data-purchase-stats-tooltip] .pst-tooltip__group {
  margin-top: 0.4rem;
}

[data-purchase-stats-tooltip] .pst-tooltip__group:first-child {
  margin-top: 0;
}

[data-purchase-stats-tooltip] .pst-tooltip__group-h {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.3;
  color: var(--color-heading, var(--pst-text));
  margin-bottom: 0.28rem;
  padding: 0.15rem 0 0.15rem 0.5rem;
  border-left: 2px solid var(--pst-accent);
  border-radius: 0 2px 2px 0;
}

[data-purchase-stats-tooltip] .pst-tooltip__group-rows {
  padding-left: 0.65rem;
}

[data-purchase-stats-tooltip] .pst-tooltip__group-rows .pst-tooltip__row {
  margin-top: 0.28rem;
}

[data-purchase-stats-tooltip] .pst-tooltip__group-rows .pst-tooltip__row:first-child {
  margin-top: 0;
}

[data-purchase-stats-tooltip] .pst-tooltip__row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin-top: 0.28rem;
}

[data-purchase-stats-tooltip] .pst-tooltip__rows > .pst-tooltip__row:first-child {
  margin-top: 0;
}

[data-purchase-stats-tooltip] .pst-tooltip__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 7.5rem;
  padding: 0.06rem 0.4rem;
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--pst-accent);
  background: var(--pst-accent-soft);
  border-radius: 999px;
  white-space: nowrap;
}

[data-purchase-stats-tooltip] .pst-tooltip__label {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

</style>
