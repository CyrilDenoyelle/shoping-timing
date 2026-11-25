<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { clampPan, zoomAt, distance, midpoint, MAX_SCALE } from '@/utils/receipt/imageZoom.js'

defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: 'Photo du ticket' },
})
const emit = defineEmits(['close'])

const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_ZOOM = 2.5
const TAP_MOVE_LIMIT = 8
const BUTTON_STEP = 1.5

const stage = ref(null)
const image = ref(null)
const view = ref({ scale: 1, tx: 0, ty: 0 })

const pointers = new Map() // pointerId -> { x, y } relatifs au centre de la zone
let pinch = null // { distance, scale }
let lastTap = null // { time, x, y }
let tapStart = null // { x, y, moved }

const imageStyle = computed(() => ({
  transform: `translate(${view.value.tx}px, ${view.value.ty}px) scale(${view.value.scale})`,
}))

const zoomed = computed(() => view.value.scale > 1.001)

function bounds() {
  const rect = stage.value.getBoundingClientRect()
  return {
    imageWidth: image.value.clientWidth,
    imageHeight: image.value.clientHeight,
    stageWidth: rect.width,
    stageHeight: rect.height,
  }
}

function toStage(event) {
  const rect = stage.value.getBoundingClientRect()
  return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
}

function setScale(next, point = { x: 0, y: 0 }) {
  view.value = zoomAt(view.value, next, point.x, point.y, bounds())
}

function reset() {
  view.value = { scale: 1, tx: 0, ty: 0 }
}

function onWheel(event) {
  event.preventDefault()
  setScale(view.value.scale * Math.exp(-event.deltaY * 0.0015), toStage(event))
}

function onPointerDown(event) {
  stage.value.setPointerCapture(event.pointerId)
  const point = toStage(event)
  pointers.set(event.pointerId, point)
  if (pointers.size === 1) {
    tapStart = { ...point, moved: false }
  } else {
    tapStart = null
    lastTap = null
  }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinch = { distance: distance(a, b), scale: view.value.scale }
  }
}

function onPointerMove(event) {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  const point = toStage(event)
  pointers.set(event.pointerId, point)

  if (pointers.size >= 2 && pinch) {
    const [a, b] = [...pointers.values()]
    const mid = midpoint(a, b)
    const next = pinch.scale * (distance(a, b) / pinch.distance)
    const moved = { ...view.value, tx: view.value.tx + (point.x - previous.x) / 2, ty: view.value.ty + (point.y - previous.y) / 2 }
    view.value = zoomAt(moved, next, mid.x, mid.y, bounds())
    return
  }

  if (tapStart && distance(tapStart, point) > TAP_MOVE_LIMIT) tapStart.moved = true
  if (zoomed.value) {
    const { tx, ty } = clampPan({
      tx: view.value.tx + (point.x - previous.x),
      ty: view.value.ty + (point.y - previous.y),
      scale: view.value.scale,
      ...bounds(),
    })
    view.value = { ...view.value, tx, ty }
  }
}

function onPointerUp(event) {
  const point = pointers.get(event.pointerId)
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinch = null

  if (point && tapStart && !tapStart.moved && pointers.size === 0) {
    const now = performance.now()
    if (lastTap && now - lastTap.time < DOUBLE_TAP_MS && distance(lastTap, point) < 30) {
      if (zoomed.value) reset()
      else setScale(DOUBLE_TAP_ZOOM, point)
      lastTap = null
    } else {
      lastTap = { time: now, x: point.x, y: point.y }
    }
  }
  tapStart = null
}

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
  else if (event.key === '+' || event.key === '=') setScale(view.value.scale * BUTTON_STEP)
  else if (event.key === '-') setScale(view.value.scale / BUTTON_STEP)
  else if (event.key === '0') reset()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="viewer" role="dialog" aria-modal="true" aria-label="Photo en grand">
    <div
      ref="stage"
      class="stage"
      :class="{ grab: zoomed }"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <img ref="image" :src="src" :alt="alt" class="photo" :style="imageStyle" draggable="false" />
    </div>

    <div class="toolbar">
      <button type="button" aria-label="Dézoomer" :disabled="!zoomed" @click="setScale(view.scale / BUTTON_STEP)">−</button>
      <button type="button" aria-label="Zoomer" :disabled="view.scale >= MAX_SCALE" @click="setScale(view.scale * BUTTON_STEP)">+</button>
      <button type="button" aria-label="Taille d’origine" :disabled="!zoomed" @click="reset">1:1</button>
    </div>
    <button type="button" class="close" aria-label="Fermer" @click="emit('close')">✕</button>
  </div>
</template>

<style scoped>
.viewer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.92);
}

.stage {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  place-items: center;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  cursor: zoom-in;
}

.stage.grab {
  cursor: grab;
}

.photo {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  will-change: transform;
  pointer-events: none;
}

.toolbar {
  position: absolute;
  left: 50%;
  bottom: max(1rem, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  gap: 0.5rem;
}

.toolbar button,
.close {
  min-width: 2.6rem;
  height: 2.6rem;
  padding: 0 0.7rem;
  font-size: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  background: rgba(30, 30, 30, 0.8);
  color: #fff;
  cursor: pointer;
}

.toolbar button:disabled {
  opacity: 0.4;
  cursor: default;
}

.close {
  position: absolute;
  top: max(0.75rem, env(safe-area-inset-top));
  right: 0.75rem;
}
</style>
