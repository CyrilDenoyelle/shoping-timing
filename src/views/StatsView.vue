<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import PurchaseStatsContent from '@/features/stats/components/PurchaseStatsContent.vue'
import { useTodoStorage } from '@/composables/useTodoStorage'

const router = useRouter()
const { lists } = useTodoStorage()

function goHome() {
  router.push({ name: 'home' })
}

function onKeydown(e) {
  if (e.key === 'Escape') goHome()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="stats-page">
    <span class="app-label">ShopingTiming</span>
    <header class="stats-top">
      <button type="button" class="back-btn" aria-label="Retour aux listes" @click="goHome">
        ← Listes
      </button>
    </header>
    <main class="stats-main">
      <PurchaseStatsContent :lists="lists" />
    </main>
  </div>
</template>

<style scoped>
.app-label {
  position: fixed;
  top: 0.6rem;
  left: 0.75rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  opacity: 0.35;
  pointer-events: none;
  z-index: 10;
}

.stats-page {
  height: 100dvh;
  max-height: 100dvh;
  width: 100%;
  margin: 0;
  padding: 2.65rem 0.75rem max(0.35rem, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: none;
}

.stats-top {
  flex-shrink: 0;
  margin-bottom: 0.5rem;
}

.back-btn {
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}

.back-btn:hover {
  color: var(--color-text);
  border-color: var(--color-border-hover);
}

.stats-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}
</style>
