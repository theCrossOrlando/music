<script setup>
import { onBeforeUnmount, ref } from "vue";
import firebase from '../firebaseInit.js'
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import "firebaseui/dist/firebaseui.css"
import { useStore } from '@/stores/lyrics';
import draggable from 'vuedraggable'

const store = useStore();
store.init()

const auth = getAuth(firebase)

const loggedinUser = ref(null)

const authListener = onAuthStateChanged(auth, user => loggedinUser.value = user)

onBeforeUnmount(() => authListener())

const edit = ref({
  id: '',
  lyrics: '',
})
const showModal = ref(false)

function displayModal(id) {
  showModal.value = true
  edit.value = {
    id: id,
    lyrics: store.getLyric(id).lyrics
  }
}

function saveLyrics() {
  store.saveLyrics(edit.value.id, edit.value.lyrics)
  showModal.value = false
}
</script>

<template>
  <main>
    <div :class="['modal', { 'is-active': showModal }]">
      <div class="modal-background"></div>
      <div class="modal-content">
        <textarea class="textarea" v-model="edit.lyrics" placeholder="Insert lyrics here" rows="20"></textarea>
        <button class="button is-primary" @click="saveLyrics">Save</button>
      </div>
      <button class="modal-close is-large" @click="showModal = false" aria-label="close"></button>
    </div>
    <h1 class="is-size-1">Active Lyrics</h1>
    <table class="table is-striped is-hoverable is-fullwidth">
      <thead>
        <tr>
          <th>Artist</th>
          <th>Song</th>
          <th>&nbsp;</th>
        </tr>
      </thead>
      <draggable
        v-model="store.activeLyrics"
        @end="store.saveOrder"
        tag="tbody"
        item-key="__id"
        >
        <template #item="{ element }">
          <tr>
            <td scope="row">{{ element.artist }}</td>
            <td>{{ element.song }}</td>
            <td class="has-text-right">
              <button class="button" v-on:click="displayModal(element.__id)">Edit</button>
              <button class="button is-primary" @click="store.disable(element.__id)">Remove</button>
            </td>
          </tr>
        </template>
      </draggable>
    </table>
    <h1 class="is-size-1">Library</h1>
    <div class="control">
      <input class="input" type="text" v-model="store.search.artist" placeholder="Search artist">
      <input class="input" type="text" v-model="store.search.song" placeholder="Search song">
    </div>
    <table class="table is-striped is-hoverable is-fullwidth">
      <thead>
        <tr>
          <th>Artist</th>
          <th>Song</th>
          <th>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="lyric in store.filteredLyrics" v-bind:key="lyric.id">
          <td>{{ lyric.artist }}</td>
          <td>{{ lyric.song }}</td>
          <td class="has-text-right">
            <button class="button" v-on:click="displayModal(lyric.__id)">Edit</button>
            <button class="button is-primary" @click="store.enable(lyric.__id)">Add</button>
          </td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style scoped>
a {
  font-size: 80px;
  height: 100px;
  width: 100%;
}

img {
  width: 100%;
}
</style>
