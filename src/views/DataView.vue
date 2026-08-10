<script setup>
import { useStore } from '@/stores/lyrics';

const store = useStore();
store.init()
</script>

<template>
  {{ store.activeLyrics }}
</template>
