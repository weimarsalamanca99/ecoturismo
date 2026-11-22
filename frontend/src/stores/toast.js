import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useToast = defineStore('toast', () => {
  const items = ref([]);
  let n = 0;
  function show(text, type = 'ok') {
    n += 1;
    const id = n;
    items.value.push({ id, text, type });
    setTimeout(() => { items.value = items.value.filter((t) => t.id !== id); }, 4500);
  }
  return { items, show, ok: (t) => show(t, 'ok'), error: (t) => show(t, 'error') };
});
