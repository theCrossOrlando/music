<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useStore } from '@/stores/lyrics';
import draggable from 'vuedraggable'

const store = useStore();
const router = useRouter();
store.init()

async function signOut() {
  await store.signOut()
  router.push('/')
}

// draggable needs a writable binding, but activeLyrics is a derived getter.
// The setter persists the new order instead of mutating the source; Firestore's
// latency compensation re-emits the snapshot immediately, so the list does not
// snap back while the write is in flight.
const activeList = computed({
  get: () => store.activeLyrics,
  set: (ordered) => store.saveOrder(ordered),
})

const edit = ref({
  id: '',
  artist: '',
  song: '',
  lyrics: '',
  enabled: false
})
const showModal = ref(false)
const formError = ref('')
// One id at a time, so opening a row's menu closes any other.
const openMenu = ref(null)

function toggleMenu(id) {
  openMenu.value = openMenu.value === id ? null : id
}

function act(work) {
  openMenu.value = null
  work()
}

function displayModal(id) {
  formError.value = ''
  openMenu.value = null
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

async function updateLyrics() {
  formError.value = ''
  try {
    await store.updateLyrics(edit.value)
    showModal.value = false
  } catch (error) {
    formError.value = error.message
  }
}
</script>

<template>
  <main>
    <div class="level">
      <div class="level-left">&nbsp;</div>
      <div class="level-right">
        <span class="mr-3">{{ store.authedUser.email }}</span>
        <button class="button is-small" @click="signOut">Sign out</button>
      </div>
    </div>
    <div v-if="store.error" class="notification is-danger">
      <button class="delete" aria-label="dismiss" @click="store.error = ''"></button>
      {{ store.error }}
    </div>
    <h1 class="is-size-1">Scripture</h1>
    <div class="container" v-for="scripture in store.scripture" v-bind:key="scripture.id">
      <div class="field has-addons">
        <div class="control has-icons-left">
          <input type="text" class="input" v-model="scripture.verse" placeholder="Scripture"
            aria-label="Scripture">
          <span class="icon is-medium is-left">
            <font-awesome-icon icon="book" />
          </span>
        </div>
        <div class="control">
          <button class="button is-primary" @click="store.updateScripture(scripture.id)">Update</button>
        </div>
      </div>
    </div>
    <div :class="['modal', { 'is-active': showModal }]">
      <div class="modal-background"></div>
      <div class="modal-content">
        <div class="container box p-6 has-background-light">
          <input type="text" class="input m-2" v-model="edit.artist" placeholder="Artist" aria-label="Artist">
          <input type="text" class="input m-2" v-model="edit.song" placeholder="Song title" aria-label="Song title">
          <textarea class="textarea m-2" v-model="edit.lyrics" placeholder="Insert lyrics here" rows="20"
            aria-label="Lyrics"></textarea>
          <p v-if="formError" class="help is-danger m-2">{{ formError }}</p>
          <button class="button is-primary m-2" @click="updateLyrics">Save</button>
        </div>
      </div>
      <button class="modal-close is-large" @click="showModal = false" aria-label="close"></button>
    </div>
    <div class="level">
      <div class="level-left">&nbsp;</div>
      <div class="level-right">
        <button class="button" aria-label="Add a song" @click="displayModal()">
          <font-awesome-icon icon="plus" />
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
        v-model="activeList"
        tag="tbody"
        item-key="id"
        >
        <template #item="{ element }">
          <tr>
            <th scope="row">{{ element.artist }}</th>
            <td>{{ element.song }}</td>
            <td class="has-text-right">
              <div class="dropdown is-right" :class="{ 'is-active': openMenu === element.id }">
                <div class="dropdown-trigger">
                  <button class="button" aria-haspopup="true" :aria-expanded="openMenu === element.id"
                    :aria-controls="`dropdown-${element.id}`" @click="toggleMenu(element.id)">
                    <font-awesome-icon icon="ellipsis" />
                  </button>
                </div>
                <div class="dropdown-menu" :id="`dropdown-${element.id}`" role="menu">
                  <div class="dropdown-content">
                    <button class="dropdown-item" @click="displayModal(element.id)">Edit</button>
                    <button class="dropdown-item" @click="act(() => store.disable(element.id))">Disable</button>
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
          <input class="input" type="text" v-model="store.search.song" placeholder="Search song"
            aria-label="Search song">
          <span class="icon is-small is-left">
            <font-awesome-icon icon="music" />
          </span>
        </p>
      </div>
      <div class="field">
        <p class="control has-icons-left">
          <input class="input" type="text" v-model="store.search.artist" placeholder="Search artist"
            aria-label="Search artist">
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
          <th scope="row">{{ lyric.artist }}</th>
          <td>{{ lyric.song }}</td>
          <td class="has-text-right">
            <div class="dropdown is-right" :class="{ 'is-active': openMenu === lyric.id }">
              <div class="dropdown-trigger">
                <button class="button" aria-haspopup="true" :aria-expanded="openMenu === lyric.id"
                  :aria-controls="`dropdown-${lyric.id}`" @click="toggleMenu(lyric.id)">
                  <font-awesome-icon icon="ellipsis" />
                </button>
              </div>
              <div class="dropdown-menu" :id="`dropdown-${lyric.id}`" role="menu">
                <div class="dropdown-content">
                  <button class="dropdown-item" @click="displayModal(lyric.id)">Edit</button>
                  <button class="dropdown-item" @click="act(() => store.enable(lyric.id))">Enable</button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style scoped>
/* Bulma styles button.dropdown-item but does not strip the native button
   chrome, so without this the menu items render as grey boxes. */
button.dropdown-item {
  background: none;
  border: none;
  font-family: inherit;
  cursor: pointer;
}

/* The artist cell is a row header for screen readers, but Bulma renders th
   bold and darker. Keep the semantics without restyling the column. */
tbody th {
  font-weight: normal;
  color: inherit;
}
</style>
