<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: null },
  items: { type: Array, required: true }, // [{ id, name }]
  placeholder: { type: String, default: 'Liste' },
  disabled: { type: Boolean, default: false },
  menuAlign: { type: String, default: 'left' }, // 'left' | 'right'
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const rootRef = ref(null)

const selectedName = computed(
  () => props.items.find((item) => item.id === props.modelValue)?.name ?? props.placeholder,
)

function toggle() {
  if (!props.disabled) open.value = !open.value
}

function pick(id) {
  open.value = false
  emit('update:modelValue', id)
}

function onDocumentPointerDown(event) {
  if (!rootRef.value?.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="rootRef" class="list-picker">
    <button
      type="button"
      class="list-picker-btn"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click.stop="toggle"
    >
      <span class="list-picker-label">{{ selectedName }}</span>
      <svg
        class="list-picker-chevron"
        :class="{ open }"
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
        v-if="open && items.length"
        class="list-picker-menu"
        :class="{ right: menuAlign === 'right' }"
        role="listbox"
      >
        <li v-for="item in items" :key="item.id" role="option" :aria-selected="item.id === modelValue">
          <button
            type="button"
            class="list-picker-option"
            :class="{ active: item.id === modelValue }"
            @click.stop="pick(item.id)"
          >
            {{ item.name }}
          </button>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.list-picker {
  position: relative;
  flex-shrink: 0;
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

.list-picker-menu.right {
  left: auto;
  right: 0;
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
</style>
