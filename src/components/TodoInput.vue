<script setup>
import { ref } from 'vue'

const input = ref('')
const emit = defineEmits(['add'])

const submit = () => {
  const text = input.value.trim()
  if (text) {
    emit('add', text)
    input.value = ''
  }
}
</script>

<template>
  <div class="item">
    <span class="icon" @click="submit">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
    <div class="body">
      <input
        v-model="input"
        type="text"
        placeholder="Ajouter une tâche…"
        class="input"
        @keydown.enter="submit"
      />
    </div>
  </div>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0;
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  min-width: 22px;
  color: var(--color-text-muted);
  opacity: 0.4;
  transition: opacity 0.3s, color 0.3s;
  cursor: pointer;
}

.item:focus-within .icon {
  opacity: 1;
  color: var(--accent);
}

.body {
  flex: 1;
  min-width: 0;
}

.input {
  display: block;
  width: 100%;
  padding: 0;
  font-size: 0.95rem;
  font-family: inherit;
  background: transparent;
  border: none;
  color: var(--color-heading);
  outline: none;
}

.input::placeholder {
  color: var(--color-text-muted);
}
</style>
