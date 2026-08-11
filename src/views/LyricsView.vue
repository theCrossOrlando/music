<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useStore } from '@/stores/lyrics';
import draggable from 'vuedraggable'
import {
  DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle,
  DialogDescription, DialogClose,
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal,
  DropdownMenuContent, DropdownMenuItem,
  ToastProvider, ToastRoot, ToastTitle, ToastDescription, ToastClose,
  ToastViewport,
  VisuallyHidden,
} from 'reka-ui'

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

// Reka drives the toast's lifetime; routing its close back through the store
// means auto-dismiss and the close button clear the error by the same path.
function setToastOpen(open) {
  if (!open) store.error = ''
}

// The modal is opened from a menu item that unmounts with its menu, so Reka has
// nothing to hand focus back to on close and it lands on <body>. Name the
// control that stands in for the origin and restore to that instead.
const returnFocusTo = ref(null)

function restoreFocus(event) {
  // Queried by data attribute, not id: DropdownMenuTrigger assigns its own id
  // and silently overrides any we set, so getElementById never matched.
  const target = returnFocusTo.value
    && document.querySelector(`[data-focus-key="${returnFocusTo.value}"]`)
  if (target) {
    event.preventDefault()
    target.focus()
  }
}

// Choosing "Edit" opens the dialog, but the menu closes a beat later and its
// own focus restoration yanks focus back out to the trigger. Suppress it only
// when the dialog is taking over; "Enable"/"Disable" still restore normally.
function onMenuCloseAutoFocus(event) {
  if (showModal.value) event.preventDefault()
}

function displayModal(id) {
  formError.value = ''
  returnFocusTo.value = id ? `row-menu-${id}` : 'add-song'
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
  <ToastProvider>
  <main>
    <div class="level">
      <div class="level-left">
        <span v-if="store.isLoading" class="has-text-grey">Loading…</span>
      </div>
      <div class="level-right">
        <span class="mr-3">{{ store.authedUser.email }}</span>
        <button class="button is-small" @click="signOut">Sign out</button>
      </div>
    </div>
    <ToastRoot
      class="notification is-danger toast-root"
      :open="!!store.error"
      :duration="8000"
      @update:open="setToastOpen"
    >
      <ToastClose class="delete" aria-label="dismiss" />
      <ToastTitle class="has-text-weight-bold">Something went wrong</ToastTitle>
      <ToastDescription>{{ store.error }}</ToastDescription>
    </ToastRoot>
    <ToastViewport class="toast-viewport" />
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
    <DialogRoot v-model:open="showModal">
      <DialogPortal>
        <div v-if="showModal" class="modal is-active">
          <DialogOverlay class="modal-background" />
          <DialogContent class="modal-content" @close-auto-focus="restoreFocus">
            <div class="container box p-6 has-background-light">
              <DialogTitle class="is-size-4 mb-4">
                {{ edit.id ? 'Edit song' : 'Add a song' }}
              </DialogTitle>
              <VisuallyHidden as-child>
                <DialogDescription>
                  Enter the artist, song title and lyrics, then save.
                </DialogDescription>
              </VisuallyHidden>
              <input type="text" class="input m-2" v-model="edit.artist" placeholder="Artist" aria-label="Artist">
              <input type="text" class="input m-2" v-model="edit.song" placeholder="Song title" aria-label="Song title">
              <textarea class="textarea m-2" v-model="edit.lyrics" placeholder="Insert lyrics here" rows="20"
                aria-label="Lyrics"></textarea>
              <p v-if="formError" class="help is-danger m-2">{{ formError }}</p>
              <div class="m-2">
                <button class="button is-primary" @click="updateLyrics">Save</button>
                <DialogClose as="button" class="button ml-2">Cancel</DialogClose>
              </div>
            </div>
          </DialogContent>
          <DialogClose as="button" class="modal-close is-large" aria-label="close" />
        </div>
      </DialogPortal>
    </DialogRoot>
    <div class="level">
      <div class="level-left">&nbsp;</div>
      <div class="level-right">
        <button data-focus-key="add-song" class="button" aria-label="Add a song" @click="displayModal()">
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
              <DropdownMenuRoot>
                <DropdownMenuTrigger as="button" class="button" :data-focus-key="`row-menu-${element.id}`"
                  :aria-label="`Actions for ${element.song}`">
                  <font-awesome-icon icon="ellipsis" />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent class="dropdown-content" align="end" :side-offset="4"
                    @close-auto-focus="onMenuCloseAutoFocus">
                    <DropdownMenuItem as="button" class="dropdown-item" @select="displayModal(element.id)">
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem as="button" class="dropdown-item" @select="store.disable(element.id)">
                      Disable
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
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
            <DropdownMenuRoot>
              <DropdownMenuTrigger as="button" class="button" :data-focus-key="`row-menu-${lyric.id}`"
                :aria-label="`Actions for ${lyric.song}`">
                <font-awesome-icon icon="ellipsis" />
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent class="dropdown-content" align="end" :side-offset="4"
                    @close-auto-focus="onMenuCloseAutoFocus">
                  <DropdownMenuItem as="button" class="dropdown-item" @select="displayModal(lyric.id)">
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem as="button" class="dropdown-item" @select="store.enable(lyric.id)">
                    Enable
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
          </td>
        </tr>
      </tbody>
    </table>
  </main>
  </ToastProvider>
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

/* Reka positions the menu with floating-ui, so Bulma's .dropdown-menu
   (position: absolute; top: 100%) is deliberately not used. .dropdown-content
   supplies only the panel look, and needs its own width floor. */
.dropdown-content {
  min-width: 10rem;
}

/* The artist cell is a row header for screen readers, but Bulma renders th
   bold and darker. Keep the semantics without restyling the column. */
tbody th {
  font-weight: normal;
  color: inherit;
}
</style>

<!-- Not scoped: ToastViewport renders through an internal Teleport, so Vue's
     scope id never reaches the element even though the class does. -->
<style>
.toast-viewport {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 24rem;
  max-width: calc(100vw - 2rem);
  margin: 0;
  padding: 0;
  list-style: none;
}

.toast-root {
  margin: 0;
}
</style>
