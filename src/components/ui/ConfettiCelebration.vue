<script setup>
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  trigger: { type: Number, default: 0 },
})

const particles = ref([])
let idCounter = 0

const COLORS = ['#00bd7e', '#42b883', '#35495e', '#f0db4f', '#e74c3c', '#9b59b6', '#3498db', '#ff6b6b']
const PARTICLE_COUNT = 80

function randomBetween(a, b) {
  return a + Math.random() * (b - a)
}

function spawnConfetti() {
  const batch = []
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = randomBetween(0, 2 * Math.PI)
    const velocity = randomBetween(250, 600)
    const vx = Math.cos(angle) * velocity
    const vy = Math.sin(angle) * velocity
    const duration = randomBetween(1.4, 2.6)

    batch.push({
      id: idCounter++,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx,
      vy,
      delay: randomBetween(0, 0.12),
      duration,
      gravity: randomBetween(500, 800),
      size: randomBetween(5, 10),
      spin: randomBetween(400, 900) * (Math.random() > 0.5 ? 1 : -1),
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    })
  }
  particles.value = batch
  setTimeout(() => {
    particles.value = []
  }, 3500)
}

watch(() => props.trigger, (val) => {
  if (val > 0) spawnConfetti()
})

onUnmounted(() => {
  particles.value = []
})
</script>

<template>
  <div v-if="particles.length" class="confetti-container" aria-hidden="true">
    <span
      v-for="p in particles"
      :key="p.id"
      class="confetti-wrapper"
      :style="{
        '--delay': `${p.delay}s`,
        '--duration': `${p.duration}s`,
        '--gravity': `${p.gravity}px`,
      }"
    >
      <span
        class="confetti-particle"
        :class="p.shape"
        :style="{
          '--vx': `${p.vx}px`,
          '--vy': `${p.vy}px`,
          '--delay': `${p.delay}s`,
          '--duration': `${p.duration}s`,
          '--size': `${p.size}px`,
          '--spin': `${p.spin}deg`,
          '--color': p.color,
        }"
      />
    </span>
  </div>
</template>

<style scoped>
.confetti-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}

/* Gravity layer: accelerates downward independently */
.confetti-wrapper {
  position: absolute;
  top: 0;
  left: 50%;
  animation: confetti-gravity var(--duration) cubic-bezier(0.4, 0, 1, 1) var(--delay) forwards;
}

/* Burst layer: linear ejection + spin + fade */
.confetti-particle {
  display: block;
  width: var(--size);
  height: var(--size);
  background: var(--color);
  opacity: 1;
  animation: confetti-burst var(--duration) cubic-bezier(0, 0, 0.2, 1) var(--delay) forwards;
}

.confetti-particle.rect {
  border-radius: 1px;
  width: var(--size);
  height: calc(var(--size) * 0.6);
}

.confetti-particle.circle {
  border-radius: 50%;
}

@keyframes confetti-burst {
  0% {
    transform: translate(0, 0) rotate(0deg) scale(1);
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--vx), var(--vy)) rotate(var(--spin)) scale(0.3);
    opacity: 0;
  }
}

@keyframes confetti-gravity {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(var(--gravity));
  }
}
</style>
