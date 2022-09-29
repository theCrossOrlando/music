<script setup>
import { onBeforeUnmount, ref } from "vue";
import firebase from '../firebaseInit.js'
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import "firebaseui/dist/firebaseui.css"
import { useStore } from '@/stores/lyrics';

const store = useStore();
store.init()

</script>

<template>
  {{ store.activeLyrics }}
</template>
