<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import TodoInput from './TodoInput.vue'
import { STORAGE_KEYS, defaultStorage } from '@/services/storage'
import { useScrollListPicker, scrollToList } from '@/composables/useScrollListPicker'

const props = defineProps({
  lists: { type: Array, required: true },
  visibleListIds: { type: Array, default: () => [] },
  suggestions: { type: Array, default: () => [] },
})

const emit = defineEmits(['add', 'navigate'])

const selectedListId = defineModel('selectedListId', { type: String, default: null })

const readStoredListId = () =>
  defaultStorage.getString(STORAGE_KEYS.QUICK_ADD_LIST)

const resolveListId = (lists) => {
  const stored = readStoredListId()
  if (stored && lists.some((l) => l.id === stored)) return stored
  return lists[0]?.id ?? null
}

if (selectedListId.value == null) {
  selectedListId.value = resolveListId(props.lists)
}
const dropdownOpen = ref(false)
const userPinned = ref(false)
const scrollingToList = ref(false)
const pickerRef = ref(null)

const { sync: syncFromScroll } = useScrollListPicker(selectedListId, {
  isPaused: () => dropdownOpen.value || userPinned.value,
  onScrollStart: () => {
    if (!scrollingToList.value) userPinned.value = false
  },
})

watch(
  () => props.lists,
  (newLists) => {
    if (!newLists.some((l) => l.id === selectedListId.value)) {
      selectedListId.value = resolveListId(newLists)
    }
  },
  { deep: true },
)

watch(selectedListId, (id) => {
  if (!id) return
  defaultStorage.setString(STORAGE_KEYS.QUICK_ADD_LIST, id)
})

const selectedListName = computed(
  () => props.lists.find((l) => l.id === selectedListId.value)?.name ?? 'Liste',
)

const toggleDropdown = () => {
  dropdownOpen.value = !dropdownOpen.value
}

const selectList = (id) => {
  userPinned.value = true
  selectedListId.value = id
  dropdownOpen.value = false
  scrollingToList.value = true
  scrollToList(id, () => {
    scrollingToList.value = false
  })
}

const onAdd = (text) => {
  if (selectedListId.value && text.trim()) {
    emit('add', selectedListId.value, text.trim())
  }
}

const onDocumentPointerDown = (e) => {
  if (!pickerRef.value?.contains(e.target)) {
    dropdownOpen.value = false
  }
}

watch(
  () => props.visibleListIds,
  async () => {
    await nextTick()
    syncFromScroll()
  },
)

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div class="quick-add" data-scroll-list-picker-anchor>
    <div ref="pickerRef" class="list-picker">
      <button
        type="button"
        class="list-picker-btn"
        :aria-expanded="dropdownOpen"
        aria-haspopup="listbox"
        @click.stop="toggleDropdown"
      >
        <span class="list-picker-label">{{ selectedListName }}</span>
        <svg
          class="list-picker-chevron"
          :class="{ open: dropdownOpen }"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <Transition name="picker-dropdown">
        <ul
          v-if="dropdownOpen && lists.length"
          class="list-picker-menu"
          role="listbox"
        >
          <li
            v-for="list in lists"
            :key="list.id"
            role="option"
            :aria-selected="list.id === selectedListId"
          >
            <button
              type="button"
              class="list-picker-option"
              :class="{ active: list.id === selectedListId }"
              @click.stop="selectList(list.id)"
            >
              {{ list.name }}
            </button>
          </li>
        </ul>
      </Transition>
    </div>
    <TodoInput
      class="quick-input"
      placeholder="Ajouter une tâche…"
      :suggestions="suggestions"
      @add="onAdd"
      @navigate="(listId, todoId) => emit('navigate', listId, todoId)"
    />
  </div>
</template>

<style scoped>
.quick-add {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  position: sticky;
  top: 2.75rem;
  z-index: 8;
  margin: -0.25rem -0.5rem 0.75rem;
  padding: 0.35rem 0.5rem 0.65rem;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
}

.list-picker {
  position: relative;
  flex-shrink: 0;
  padding-top: 0.35rem;
}

.list-picker-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  max-width: 5.5rem;
  padding: 0.15rem 0.35rem;
  font-size: 0.62rem;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.list-picker-btn:hover,
.list-picker-btn[aria-expanded='true'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.list-picker-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-picker-chevron {
  flex-shrink: 0;
  opacity: 0.5;
  transition: transform 0.15s ease, opacity 0.15s;
}

.list-picker-chevron.open {
  transform: rotate(180deg);
  opacity: 0.85;
}

.list-picker-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  min-width: 8rem;
  max-width: 12rem;
  max-height: 12rem;
  overflow-y: auto;
  margin: 0;
  padding: 0.2rem;
  list-style: none;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 40;
}

.list-picker-option {
  display: block;
  width: 100%;
  padding: 0.4rem 0.55rem;
  font-size: 0.75rem;
  font-family: inherit;
  font-weight: 500;
  text-align: left;
  color: var(--color-text);
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.list-picker-option:hover,
.list-picker-option.active {
  background: var(--color-border);
  color: var(--color-heading);
}

.list-picker-option.active {
  color: var(--accent);
}

.picker-dropdown-enter-active,
.picker-dropdown-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.picker-dropdown-enter-from,
.picker-dropdown-leave-to {
  opacity: 0;
  transform: scaleY(0.92) translateY(-3px);
}

.quick-input {
  flex: 1;
  min-width: 0;
}
</style>
