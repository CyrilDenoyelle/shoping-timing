<script setup>
import TodoList from './components/TodoList.vue'
import ConfettiCelebration from './components/ConfettiCelebration.vue'
import IconCart from './components/icons/IconCart.vue'
import IconRefresh from './components/icons/IconRefresh.vue'
import IconUndo from './components/icons/IconUndo.vue'
import IconRedo from './components/icons/IconRedo.vue'
import IconSort from './components/icons/IconSort.vue'
import { useTodoStorage } from './composables/useTodoStorage'

const {
  shoppingMode, manualSort, confettiTrigger,
  canUndo, canRedo,
  toggleShoppingMode, toggleManualSort, refreshNow,
  undoLastAction, redoLastAction,
} = useTodoStorage()
</script>

<template>
  <ConfettiCelebration :trigger="confettiTrigger" />
  <span class="app-label">ShopingTiming</span>
  <div class="toolbar">
    <button
      class="tool-btn"
      :class="{ disabled: !canUndo }"
      :disabled="!canUndo"
      aria-label="Annuler"
      @click="undoLastAction"
    >
      <IconUndo />
    </button>
    <button
      class="tool-btn"
      :class="{ disabled: !canRedo }"
      :disabled="!canRedo"
      aria-label="Rétablir"
      @click="redoLastAction"
    >
      <IconRedo />
    </button>
    <button
      class="tool-btn"
      aria-label="Rafraîchir les progressions"
      @click="refreshNow"
    >
      <IconRefresh />
    </button>
    <button
      class="tool-btn"
      :class="{ active: manualSort }"
      aria-label="Tri manuel"
      @click="toggleManualSort"
    >
      <IconSort />
    </button>
    <button
      class="tool-btn"
      :class="{ active: shoppingMode }"
      aria-label="Mode courses"
      @click="toggleShoppingMode"
    >
      <IconCart />
    </button>
  </div>
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

.toolbar {
  position: fixed;
  top: 0.5rem;
  right: 0.75rem;
  z-index: 10;
  display: flex;
  gap: 0.25rem;
}

.tool-btn {
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

.tool-btn:hover:not(.disabled) {
  opacity: 1;
  border-color: var(--color-border-hover);
}

.tool-btn.disabled {
  opacity: 0.2;
  cursor: default;
}

.tool-btn.active {
  opacity: 1;
  color: var(--accent);
  border-color: transparent;
  background: transparent;
}
</style>
