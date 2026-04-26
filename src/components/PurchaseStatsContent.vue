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
  TIMELINE_PERIODS,
} from '../utils/purchaseTimeline'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const props = defineProps({
  lists: { type: Array, required: true },
})

const periodId = ref(TIMELINE_PERIODS[1].id)
const nowMs = ref(Date.now())

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
  const tooltipLinesPerBucket = series.value.tooltipLinesPerBucket ?? []
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
        boxPadding: 6,
        displayColors: false,
        mode: 'index',
        axis: 'y',
        intersect: false,
        animation: { duration: 120 },
        callbacks: {
          title(items) {
            const row = items[0]
            if (!row) return ''
            return row.label
          },
          label(item) {
            const n = item.raw
            if (n === 0) return 'Aucun achat'
            return n === 1 ? '1 achat en tout' : `${n} achats en tout`
          },
          afterBody(items) {
            const row = items[0]
            if (!row) return []
            const n = row.raw
            if (n === 0) return []
            const lines = tooltipLinesPerBucket[row.dataIndex] ?? []
            if (!lines.length) return []
            return ['', 'Détail :', ...lines.map((line) => `  ${line}`)]
          },
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
    <h2 id="stats-title" class="stats-title">Achats dans le temps</h2>

    <p class="stats-hint">
      Chaque case cochée avec une date de fin dans l’historique compte pour un achat.
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
      Aucun achat sur cette période. Coche des produits pour enregistrer des achats dans l’historique.
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
