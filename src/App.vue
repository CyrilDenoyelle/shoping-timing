<script setup>
import TodoList from './components/TodoList.vue'
import ConfettiCelebration from './components/ConfettiCelebration.vue'
import IconCart from './components/icons/IconCart.vue'
import IconRefresh from './components/icons/IconRefresh.vue'
import { useTodoStorage } from './composables/useTodoStorage'

const { shoppingMode, confettiTrigger, toggleShoppingMode, refreshNow } = useTodoStorage()
</script>

<template>
  <ConfettiCelebration :trigger="confettiTrigger" />
  <span class="app-label">ShopingTiming</span>
  <button
    class="refresh-btn"
    aria-label="Rafraîchir les progressions"
    @click="refreshNow"
  >
    <IconRefresh />
  </button>
  <button
    class="cart-toggle"
    :class="{ active: shoppingMode }"
    aria-label="Mode courses"
    @click="toggleShoppingMode"
  >
    <IconCart />
  </button>
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

.refresh-btn {
  position: fixed;
  top: 0.5rem;
  right: 3.25rem;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.3s;
}

.refresh-btn:hover {
  opacity: 1;
  border-color: var(--color-border-hover);
}

.refresh-btn:active {
  transform: rotate(180deg);
}

.cart-toggle {
  position: fixed;
  top: 0.5rem;
  right: 0.75rem;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.3s;
}

.cart-toggle:hover {
  opacity: 1;
  border-color: var(--color-border-hover);
}

.cart-toggle.active {
  opacity: 1;
  color: var(--accent);
  border-color: transparent;
  background: transparent;
}
</style>
