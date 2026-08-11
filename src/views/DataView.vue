<script setup>
import { useStore } from '@/stores/lyrics';

const store = useStore();
store.init()
</script>

<template>
  <pre class="overflow-x-auto p-4 font-mono text-xs text-slate-700">{{ store.activeLyrics }}</pre>
</template>
