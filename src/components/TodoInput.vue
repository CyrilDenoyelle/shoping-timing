<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  suggestions: {
    type: Array,
    default: () => [],
  },
})

const input = ref('')
const searchQuery = ref('')
const emit = defineEmits(['add', 'navigate'])
const activeIndex = ref(-1)
const showDropdown = ref(false)
let blurTimer = null

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return props.suggestions.filter((s) => s.text.toLowerCase().includes(q))
})

const visibleSuggestions = computed(() => {
  return showDropdown.value && searchQuery.value.trim() && filtered.value.length > 0
    ? filtered.value.slice(0, 8)
    : []
})

const submit = () => {
  const text = (input.value || searchQuery.value).trim()
  if (text) {
    emit('add', text)
    input.value = ''
    searchQuery.value = ''
    activeIndex.value = -1
    showDropdown.value = false
  }
}

const selectSuggestion = (suggestion) => {
  input.value = suggestion.text
  searchQuery.value = suggestion.text
  showDropdown.value = false
  activeIndex.value = -1
  submit()
}

const goToItem = (suggestion) => {
  emit('navigate', suggestion.listId, suggestion.todoId)
  input.value = ''
  searchQuery.value = ''
  showDropdown.value = false
  activeIndex.value = -1
}

const cancelBlurTimer = () => {
  if (blurTimer != null) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
}

const onInput = (e) => {
  cancelBlurTimer()
  searchQuery.value = e.target.value
  showDropdown.value = true
  activeIndex.value = -1
}

const onKeydown = (e) => {
  const list = visibleSuggestions.value

  if (e.key === 'ArrowDown' && list.length) {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % list.length
  } else if (e.key === 'ArrowUp' && list.length) {
    e.preventDefault()
    activeIndex.value = activeIndex.value <= 0 ? list.length - 1 : activeIndex.value - 1
  } else if (e.key === 'Enter') {
    if (activeIndex.value >= 0 && list.length) {
      e.preventDefault()
      selectSuggestion(list[activeIndex.value])
    } else {
      submit()
    }
  } else if (e.key === 'Escape') {
    showDropdown.value = false
    activeIndex.value = -1
  }
}

const onBlur = () => {
  cancelBlurTimer()
  blurTimer = setTimeout(() => {
    showDropdown.value = false
    activeIndex.value = -1
    blurTimer = null
  }, 150)
}

const onCompositionUpdate = (e) => {
  cancelBlurTimer()
  searchQuery.value = e.target.value
  showDropdown.value = true
}

const onFocus = (e) => {
  cancelBlurTimer()
  searchQuery.value = e.target.value
  if (searchQuery.value.trim()) showDropdown.value = true
}

const highlight = (text, query) => {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    text.slice(0, idx) +
    '<mark>' +
    text.slice(idx, idx + query.length) +
    '</mark>' +
    text.slice(idx + query.length)
  )
}
</script>

<template>
  <div class="item">
    <span class="icon" @click="submit">
      <svg
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
        @input="onInput"
        @compositionupdate="onCompositionUpdate"
        @keydown="onKeydown"
        @blur="onBlur"
        @focus="onFocus"
      />
      <Transition name="dropdown">
        <div v-if="visibleSuggestions.length" class="dropdown">
          <div
            v-for="(s, i) in visibleSuggestions"
            :key="s.listId + '-' + s.todoId"
            class="dropdown-row"
            :class="{ active: i === activeIndex }"
          >
            <button
              class="dropdown-item"
              @mousedown.prevent="selectSuggestion(s)"
            >
              <span v-html="highlight(s.text, searchQuery.trim())" />
              <span class="dropdown-list-name">{{ s.listName }}</span>
            </button>
            <button
              class="goto-btn"
              aria-label="Aller à l'élément"
              @mousedown.prevent="goToItem(s)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 4 17 12 9 20" />
              </svg>
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0;
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
  position: relative;
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

.dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 30;
  padding: 0.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  transform-origin: top;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scaleY(0.9) translateY(-4px);
}

.dropdown-row {
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: background 0.12s;
}

.dropdown-row:hover,
.dropdown-row.active {
  background: var(--color-border);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  font-family: inherit;
  background: none;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.dropdown-row:hover .dropdown-item,
.dropdown-row.active .dropdown-item {
  color: var(--color-heading);
}

.dropdown-list-name {
  margin-left: auto;
  font-size: 0.65rem;
  color: var(--color-text-muted);
  opacity: 0.6;
  white-space: nowrap;
  flex-shrink: 0;
}

.goto-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  padding: 0;
  margin-right: 0.25rem;
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--color-text-muted);
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s, color 0.15s;
}

.dropdown-row:hover .goto-btn,
.dropdown-row.active .goto-btn {
  opacity: 0.5;
}

.goto-btn:hover {
  opacity: 1 !important;
  color: var(--accent);
}

.dropdown-row :deep(mark) {
  background: none;
  color: var(--accent);
  font-weight: 600;
}
</style>
