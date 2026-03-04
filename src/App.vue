<script setup>
import TodoList from './components/TodoList.vue'
</script>

<template>
  <span class="app-label">ShopingTiming</span>
  <main>
    <TodoList />
  </main>
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
</style>
