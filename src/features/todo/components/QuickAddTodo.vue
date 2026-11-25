<script setup>
import { computed } from 'vue'
import TodoInput from './TodoInput.vue'
import ListPicker from '@/components/ui/ListPicker.vue'
import { useSelectedList } from '@/composables/useSelectedList'

const props = defineProps({
  lists: { type: Array, required: true },
  suggestions: { type: Array, default: () => [] },
})

const emit = defineEmits(['add', 'navigate', 'toggle', 'go-to-list'])

const { selectedListId, selectList } = useSelectedList()

const pickerItems = computed(() => props.lists.map((list) => ({ id: list.id, name: list.name })))

const pickList = (id) => {
  selectList(id)
  emit('go-to-list', id)
}

const onAdd = (text) => {
  if (selectedListId.value && text.trim()) {
    emit('add', selectedListId.value, text.trim())
  }
}
</script>

<template>
  <div class="quick-add">
    <ListPicker
      class="quick-picker"
      :model-value="selectedListId"
      :items="pickerItems"
      @update:model-value="pickList"
    />
    <TodoInput
      class="quick-input"
      placeholder="Ajouter une tâche…"
      :suggestions="suggestions"
      @add="onAdd"
      @navigate="(listId, todoId) => emit('navigate', listId, todoId)"
      @toggle="(listId, todoId) => emit('toggle', listId, todoId)"
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
  /* Couche propre : le contenu défile derrière sans repeindre la barre à chaque frame. */
  transform: translateZ(0);
}

.quick-picker {
  padding-top: 0.35rem;
}

.quick-input {
  flex: 1;
  min-width: 0;
}
</style>
