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
  artist: '',
  song: '',
  lyrics: '',
  enabled: false
})
const showModal = ref(false)

function displayModal(id) {
  edit.value = {
    artist: '',
    song: '',
    lyrics: '',
    enabled: false
  }
  showModal.value = true

  if (id) {
    const editLyric = store.getLyric(id)
    edit.value = {
      id: id,
      artist: editLyric.artist,
      song: editLyric.song,
      lyrics: editLyric.lyrics,
      enabled: editLyric.enabled
    }
  }
}

function updateLyrics() {
  store.updateLyrics(edit.value)
  showModal.value = false
}
</script>

<template>
  <main>
    <h1 class="is-size-1">Scripture</h1>
    <div class="container" v-for="(scripture, __id) in store.scripture" v-bind:key="__id">
      <div class="field has-addons">
        <div class="control has-icons-left">
          <input type="text" class="input" v-model="scripture.verse" placeholder="Scripture">
          <span class="icon is-medium is-left">
            <i class="fa fa-futbol-o"></i>
          </span>
        </div>
        <div class="control">
          <a class="button is-primary" @click="store.updateScripture(__id)">Update</a>
        </div>
      </div>
    </div>
    <div :class="['modal', { 'is-active': showModal }]">
      <div class="modal-background"></div>
      <div class="modal-content">
        <div class="container box p-6 has-background-light">
          <input type="text" class="input m-2" v-model="edit.artist" placeholder="Artist">
          <input type="text" class="input m-2" v-model="edit.song" placeholder="Song title">
          <textarea class="textarea m-2" v-model="edit.lyrics" placeholder="Insert lyrics here" rows="20"></textarea>
          <button class="button is-primary m-2" @click="updateLyrics">Save</button>
        </div>
      </div>
      <button class="modal-close is-large" @click="showModal = false" aria-label="close"></button>
    </div>
    <div class="level">
      <div class="level-left">&nbsp;</div>
      <div class="level-right">
        <button class="button">
          <font-awesome-icon icon="plus" @click="displayModal()" />
        </button>
      </div>
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
              <div class="dropdown is-right" @click="e => e.currentTarget.classList.toggle('is-active')">
                <div class="dropdown-trigger">
                  <button class="button" aria-haspopup="true" aria-controls="dropdown-menu">
                    <font-awesome-icon icon="ellipsis" />
                  </button>
                </div>
                <div class="dropdown-menu" id="dropdown-menu" role="menu">
                  <div class="dropdown-content">
                    <a class="dropdown-item" @click="displayModal(element.__id)">Edit</a>
                    <a class="dropdown-item" @click="store.disable(element.__id)">Disable</a>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </draggable>
    </table>
    <h1 class="is-size-1">Library</h1>
    <div class="control">
      <div class="field">
        <p class="control has-icons-left">
          <input class="input" type="text" v-model="store.search.song" placeholder="Search song">
          <span class="icon is-small is-left">
            <font-awesome-icon icon="music" />
          </span>
        </p>
      </div>
      <div class="field">
        <p class="control has-icons-left">
          <input class="input" type="text" v-model="store.search.artist" placeholder="Search artist">
          <span class="icon is-small is-left">
            <font-awesome-icon icon="user" />
          </span>
        </p>
      </div>
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
            <div class="dropdown is-right" @click="e => e.currentTarget.classList.toggle('is-active')">
              <div class="dropdown-trigger">
                <button class="button" aria-haspopup="true" aria-controls="dropdown-menu">
                  <font-awesome-icon icon="ellipsis" />
                </button>
              </div>
              <div class="dropdown-menu" id="dropdown-menu" role="menu">
                <div class="dropdown-content">
                  <a class="dropdown-item" @click="displayModal(lyric.__id)">Edit</a>
                  <a class="dropdown-item" @click="store.enable(lyric.__id)">Enable</a>
                </div>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
