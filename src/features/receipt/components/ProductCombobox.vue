<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { matchProducts, searchCandidates, scoreNames, normalizeName } from '@/utils/receipt/matchProducts.js'
import { newTarget, targetFromCandidate } from '@/utils/receipt/reviewLines.js'

/**
 * Champ produit d'une ligne de ticket : saisie libre (nouveau produit) ou choix d'un produit existant.
 * Le visuel reprend la barre d'ajout de la page de liste (TodoInput).
 */
const props = defineProps({
  line: { type: Object, required: true },
  candidates: { type: Array, required: true },
  defaultListId: { type: String, default: null },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
})

const MAX_OPTIONS = 8
const MAX_SEARCH = 50

const rootRef = ref(null)
const open = ref(false)
const dirty = ref(false)
const activeIndex = ref(-1)

const isNew = computed(() => props.line.target?.type === 'new')
const text = computed(() => props.line.target?.text ?? '')
const matchedListName = computed(() => {
  const target = props.line.target
  if (target?.type !== 'existing') return ''
  return props.candidates.find((c) => c.id === target.todoId && c.listId === target.listId)?.listName ?? ''
})

/**
 * Avant toute frappe : produits les plus proches du libellé du ticket, y compris les brouillons
 * saisis sur d’autres lignes (« sandwich triangle » créé plus haut apparaît ici).
 * Ensuite : produits contenant la saisie, puis produits qui lui ressemblent.
 */
const options = computed(() => {
  if (!open.value) return []
  if (!dirty.value) {
    return matchProducts(props.line.name, props.candidates, {
      threshold: 0.25,
      limit: MAX_OPTIONS,
    }).map((m) => m.candidate)
  }
  const found = searchCandidates(text.value, props.candidates, MAX_SEARCH)
    .map((candidate) => ({ candidate, score: scoreNames(text.value, candidate.text) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate)
  const seen = new Set(found.map((c) => `${c.listId}:${c.id}`))
  const similar = matchProducts(text.value, props.candidates, { threshold: 0.3, limit: MAX_OPTIONS })
    .map((m) => m.candidate)
    .filter((c) => !seen.has(`${c.listId}:${c.id}`))
  return [...found, ...similar].slice(0, MAX_OPTIONS)
})

function isSelected(candidate) {
  const target = props.line.target
  if (!target) return false
  if (candidate.pending) {
    return (
      target.type === 'new' &&
      target.listId === candidate.listId &&
      normalizeName(target.text) === normalizeName(candidate.text)
    )
  }
  return target.type === 'existing' && target.todoId === candidate.id && target.listId === candidate.listId
}

const showCreateRow = computed(() => {
  if (!open.value || !dirty.value) return false
  const typed = normalizeName(text.value)
  return typed.length > 0 && !options.value.some((c) => normalizeName(c.text) === typed)
})

const hasMenu = computed(() => options.value.length > 0 || showCreateRow.value)

/** Découpe un nom pour surligner la saisie (même rendu que la page de liste). */
function highlightParts(name) {
  const query = dirty.value ? text.value.trim() : ''
  const index = query ? name.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (index === -1) return [{ text: name, hit: false }]
  return [
    { text: name.slice(0, index), hit: false },
    { text: name.slice(index, index + query.length), hit: true },
    { text: name.slice(index + query.length), hit: false },
  ].filter((part) => part.text)
}

function onInput(event) {
  dirty.value = true
  open.value = true
  activeIndex.value = -1
  const value = event.target.value
  const previous = props.line.target
  if (previous?.type === 'new') {
    previous.text = value
  } else {
    props.line.target = newTarget(previous?.listId ?? props.defaultListId, value)
  }
}

function onFocus(event) {
  dirty.value = false
  open.value = true
  const input = event.target
  requestAnimationFrame(() => input.select())
}

function pick(candidate) {
  props.line.target = targetFromCandidate(candidate)
  close()
}

function close() {
  open.value = false
  dirty.value = false
  activeIndex.value = -1
}

function toggle() {
  if (props.disabled) return
  if (open.value) close()
  else {
    dirty.value = false
    open.value = true
  }
}

function onKeydown(event) {
  const list = options.value
  if (event.key === 'ArrowDown' && list.length) {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % list.length
  } else if (event.key === 'ArrowUp' && list.length) {
    event.preventDefault()
    activeIndex.value = activeIndex.value <= 0 ? list.length - 1 : activeIndex.value - 1
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (activeIndex.value >= 0 && list[activeIndex.value]) pick(list[activeIndex.value])
    else close()
  } else if (event.key === 'Escape') {
    close()
  }
}

function onDocumentPointerDown(event) {
  if (!open.value) return
  const path = event.composedPath?.() ?? [event.target]
  if (!path.includes(rootRef.value)) close()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true))
</script>

<template>
  <div ref="rootRef" class="product-combobox" :class="{ focused: open, created: isNew, invalid }">
    <input
      type="text"
      class="input"
      :value="text"
      :disabled="disabled"
      placeholder="Produit"
      aria-label="Produit"
      aria-autocomplete="list"
      autocomplete="off"
      @input="onInput"
      @focus="onFocus"
      @keydown="onKeydown"
    />
    <span v-if="isNew && text.trim()" class="tag tag-new">nouveau</span>
    <span v-else-if="matchedListName" class="tag">{{ matchedListName }}</span>
    <button
      type="button"
      class="chevron-btn"
      tabindex="-1"
      aria-label="Afficher les produits"
      :disabled="disabled"
      @mousedown.prevent
      @click="toggle"
    >
      <svg
        class="chevron"
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

    <Transition name="dropdown">
      <div v-if="hasMenu" class="dropdown" role="listbox" @mousedown.prevent>
        <div
          v-for="(candidate, i) in options"
          :key="`${candidate.listId}-${candidate.id}`"
          class="dropdown-row"
          :class="{ active: i === activeIndex, done: candidate.done, selected: isSelected(candidate) }"
        >
          <button type="button" class="dropdown-item" role="option" @click="pick(candidate)">
            <span>
              <template v-for="(part, k) in highlightParts(candidate.text)" :key="k">
                <mark v-if="part.hit">{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </template>
            </span>
          </button>
          <span class="dropdown-list-name">
            <template v-if="candidate.pending">nouveau</template>
            <template v-else>{{ candidate.listName }}</template>
          </span>
        </div>
        <div v-if="showCreateRow" class="dropdown-row create-row">
          <button type="button" class="dropdown-item create" @click="close">
            Créer « {{ text.trim() }} »
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.product-combobox {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.15rem 0;
  border-bottom: 1px solid var(--color-border);
  transition: border-color 0.3s;
}

.product-combobox.focused {
  border-bottom-color: var(--accent);
}

.product-combobox.invalid {
  border-bottom-color: var(--danger);
}

.product-combobox.invalid .input::placeholder {
  color: var(--danger);
}

.input {
  flex: 1;
  min-width: 0;
  padding: 0.2rem 0;
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

.tag {
  flex-shrink: 0;
  max-width: 5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.65rem;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.tag-new {
  color: var(--accent);
  opacity: 1;
}

.chevron-btn {
  display: flex;
  align-items: center;
  padding: 0.25rem;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}

.chevron {
  opacity: 0.5;
  transition: transform 0.15s ease, opacity 0.15s;
}

.chevron.open {
  transform: rotate(180deg);
  opacity: 0.85;
}

.dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  max-height: 16rem;
  overflow-y: auto;
  padding: 0.2rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
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
  align-items: stretch;
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
  flex: 1;
  min-width: 0;
  min-height: 2.5rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  font-family: inherit;
  background: none;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.dropdown-row:hover .dropdown-item,
.dropdown-row.active .dropdown-item {
  color: var(--color-heading);
}

.dropdown-row.done .dropdown-item {
  opacity: 0.55;
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, currentColor 80%, transparent);
}

.dropdown-row.selected .dropdown-item {
  color: var(--accent);
}

.dropdown-item.create {
  color: var(--accent);
}

.dropdown-list-name {
  display: flex;
  align-items: center;
  padding: 0.35rem 0.65rem;
  font-size: 0.65rem;
  color: var(--color-text-muted);
  opacity: 0.6;
  white-space: nowrap;
}

.dropdown-row:hover .dropdown-list-name,
.dropdown-row.active .dropdown-list-name {
  opacity: 0.85;
}

.dropdown mark {
  background: none;
  color: var(--accent);
  font-weight: 600;
}
</style>
