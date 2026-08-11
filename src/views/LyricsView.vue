<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useStore } from '@/stores/lyrics';
import draggable from 'vuedraggable'
import {
  DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle,
  DialogDescription, DialogClose,
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  AlertDialogRoot, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction,
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

function focusKey(key) {
  // Queried by data attribute, not id: DropdownMenuTrigger assigns its own id
  // and silently overrides any we set, so getElementById never matched.
  return key && document.querySelector(`[data-focus-key="${key}"]`)
}

function restoreFocus(event) {
  // After a delete the originating row is gone, so fall back to the one control
  // that always exists rather than dropping focus on <body>.
  const target = focusKey(returnFocusTo.value) || focusKey('add-song')
  if (target) {
    event.preventDefault()
    target.focus()
  }
}

// Choosing "Edit" or "Delete" opens an overlay, but the menu closes a beat
// later and its own focus restoration yanks focus back out to the trigger.
// Suppress it only when an overlay is taking over; the plain items still
// restore normally.
function onMenuCloseAutoFocus(event) {
  if (showModal.value || pendingDelete.value) event.preventDefault()
}

// Deleting is irreversible and there is no undo, so it is confirmed by name.
// pendingDelete drives what the dialog shows; deleteTarget is a plain variable
// holding what to actually delete. They are separate because confirming closes
// the dialog first, which clears pendingDelete before the click handler reads
// it — keeping only the ref made confirming a silent no-op.
const pendingDelete = ref(null)
let deleteTarget = null

function confirmDelete(lyric) {
  returnFocusTo.value = `row-menu-${lyric.id}`
  deleteTarget = lyric
  pendingDelete.value = lyric
}

async function reallyDelete() {
  const target = deleteTarget
  deleteTarget = null
  if (target) await store.deleteLyric(target.id)
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
    <div class="min-h-screen">
      <header class="sticky top-0 z-30 border-b border-brass-soft bg-paper/90 backdrop-blur">
        <div class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
          <h1 class="font-display text-base font-bold tracking-tight text-ink">theCross Music</h1>
          <span v-if="store.isLoading" class="text-xs text-ink-soft">Loading…</span>
          <div class="ml-auto flex items-center gap-3">
            <span class="hidden text-xs text-ink-soft sm:inline">{{ store.authedUser.email }}</span>
            <button class="btn btn-sm" @click="signOut">Sign out</button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
        <!-- Scripture -->
        <section class="space-y-3">
          <h2 class="section-title">Scripture</h2>
          <div v-for="scripture in store.scripture" :key="scripture.id" class="flex gap-2">
            <div class="relative flex-1">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-brass">
                <font-awesome-icon icon="book" />
              </span>
              <input type="text" class="input pl-9" v-model="scripture.verse" placeholder="Scripture"
                aria-label="Scripture">
            </div>
            <button class="btn btn-primary" @click="store.updateScripture(scripture.id)">Update</button>
          </div>
        </section>

        <!-- Active set list -->
        <section class="space-y-3">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="section-title">Set list</h2>
              <p class="text-xs text-ink-soft">Drag to reorder. This is the order they play in.</p>
            </div>
            <button data-focus-key="add-song" class="btn btn-primary shrink-0 whitespace-nowrap"
              @click="displayModal()">
              <font-awesome-icon icon="plus" />
              Add song
            </button>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Artist</th>
                  <th scope="col">Song</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <draggable v-model="activeList" tag="tbody" item-key="id" handle=".drag-handle">
                <template #item="{ element }">
                  <tr class="group">
                    <th scope="row">
                      <span class="drag-handle mr-2 cursor-grab text-brass-soft group-hover:text-brass"
                        aria-hidden="true">⠿</span>{{ element.artist }}
                    </th>
                    <td>{{ element.song }}</td>
                    <td class="w-px text-right">
                      <DropdownMenuRoot>
                        <DropdownMenuTrigger as="button" class="btn btn-sm btn-icon"
                          :data-focus-key="`row-menu-${element.id}`"
                          :aria-label="`Actions for ${element.song}`">
                          <font-awesome-icon icon="ellipsis" />
                        </DropdownMenuTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuContent class="menu-panel" align="end" :side-offset="4"
                            @close-auto-focus="onMenuCloseAutoFocus">
                            <DropdownMenuItem as="button" class="menu-item" @select="displayModal(element.id)">
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem as="button" class="menu-item" @select="store.disable(element.id)">
                              Remove from set list
                            </DropdownMenuItem>
                            <DropdownMenuSeparator class="my-1 h-px bg-brass-soft" />
                            <DropdownMenuItem as="button" class="menu-item menu-item-danger"
                              @select="confirmDelete(element)">
                              Delete song…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenuPortal>
                      </DropdownMenuRoot>
                    </td>
                  </tr>
                </template>
              </draggable>
            </table>
            <p v-if="!store.activeLyrics.length" class="px-4 py-8 text-center text-sm text-ink-soft">
              No songs in the set list yet. Add one from the library below.
            </p>
          </div>
        </section>

        <!-- Library -->
        <section class="space-y-3">
          <h2 class="section-title">Library</h2>
          <div class="grid gap-2 sm:grid-cols-2">
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-brass">
                <font-awesome-icon icon="music" />
              </span>
              <input class="input pl-9" type="search" v-model="store.search.song" placeholder="Search song"
                aria-label="Search song">
            </div>
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-brass">
                <font-awesome-icon icon="user" />
              </span>
              <input class="input pl-9" type="search" v-model="store.search.artist" placeholder="Search artist"
                aria-label="Search artist">
            </div>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Artist</th>
                  <th scope="col">Song</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="lyric in store.filteredLyrics" :key="lyric.id">
                  <th scope="row">{{ lyric.artist }}</th>
                  <td>{{ lyric.song }}</td>
                  <td class="w-px text-right">
                    <DropdownMenuRoot>
                      <DropdownMenuTrigger as="button" class="btn btn-sm btn-icon"
                        :data-focus-key="`row-menu-${lyric.id}`"
                        :aria-label="`Actions for ${lyric.song}`">
                        <font-awesome-icon icon="ellipsis" />
                      </DropdownMenuTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuContent class="menu-panel" align="end" :side-offset="4"
                          @close-auto-focus="onMenuCloseAutoFocus">
                          <DropdownMenuItem as="button" class="menu-item" @select="displayModal(lyric.id)">
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem as="button" class="menu-item" @select="store.enable(lyric.id)">
                            Add to set list
                          </DropdownMenuItem>
                          <DropdownMenuSeparator class="my-1 h-px bg-brass-soft" />
                          <DropdownMenuItem as="button" class="menu-item menu-item-danger"
                            @select="confirmDelete(lyric)">
                            Delete song…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenuPortal>
                    </DropdownMenuRoot>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!store.filteredLyrics.length" class="px-4 py-8 text-center text-sm text-ink-soft">
              {{ store.search.song || store.search.artist
                ? 'No songs match that search.'
                : 'The library is empty.' }}
            </p>
          </div>
        </section>
      </main>

      <!-- Edit / add song -->
      <DialogRoot v-model:open="showModal">
        <DialogPortal>
          <DialogOverlay class="fixed inset-0 z-40 bg-ink/50" />
          <DialogContent
            class="fixed inset-x-0 top-1/2 z-50 mx-auto w-[calc(100%-2rem)] max-w-2xl -translate-y-1/2
                   rounded-md border border-brass-soft bg-white p-6 shadow-xl focus:outline-none"
            @close-auto-focus="restoreFocus">
            <DialogTitle class="font-display text-xl font-bold text-ink">
              {{ edit.id ? 'Edit song' : 'Add a song' }}
            </DialogTitle>
            <VisuallyHidden as-child>
              <DialogDescription>
                Enter the artist, song title and lyrics, then save.
              </DialogDescription>
            </VisuallyHidden>

            <div class="mt-4 space-y-3">
              <input type="text" class="input" v-model="edit.artist" placeholder="Artist" aria-label="Artist">
              <input type="text" class="input" v-model="edit.song" placeholder="Song title" aria-label="Song title">
              <textarea class="input font-mono text-xs leading-relaxed" v-model="edit.lyrics"
                placeholder="Insert lyrics here" rows="16" aria-label="Lyrics"></textarea>
              <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
            </div>

            <div class="mt-5 flex justify-end gap-2">
              <DialogClose as="button" class="btn">Cancel</DialogClose>
              <button class="btn btn-primary" @click="updateLyrics">Save</button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>

      <!-- Delete confirmation. Irreversible, so it names the song. -->
      <AlertDialogRoot :open="!!pendingDelete" @update:open="open => { if (!open) pendingDelete = null }">
        <AlertDialogPortal>
          <AlertDialogOverlay class="fixed inset-0 z-40 bg-ink/50" />
          <AlertDialogContent
            class="fixed inset-x-0 top-1/2 z-50 mx-auto w-[calc(100%-2rem)] max-w-md -translate-y-1/2
                   rounded-md border border-brass-soft bg-white p-6 shadow-xl focus:outline-none"
            @close-auto-focus="restoreFocus">
            <AlertDialogTitle class="font-display text-xl font-bold text-ink">Delete this song?</AlertDialogTitle>
            <AlertDialogDescription class="mt-2 text-sm text-ink-soft">
              <strong class="font-semibold text-ink">{{ pendingDelete?.song }}</strong>
              <template v-if="pendingDelete?.artist"> by {{ pendingDelete.artist }}</template>
              will be removed from the library permanently, along with its lyrics.
              This cannot be undone.
            </AlertDialogDescription>
            <div class="mt-5 flex justify-end gap-2">
              <AlertDialogCancel as="button" class="btn">Cancel</AlertDialogCancel>
              <AlertDialogAction as="button" class="btn btn-danger" @click="reallyDelete">
                Delete permanently
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialogRoot>

      <!-- Background write failures -->
      <ToastRoot
        class="flex items-start gap-3 rounded-md border border-red-800/25 bg-red-50 p-4"
        :open="!!store.error"
        :duration="8000"
        @update:open="setToastOpen"
      >
        <div class="flex-1">
          <ToastTitle class="text-sm font-semibold text-red-900">Something went wrong</ToastTitle>
          <ToastDescription class="mt-0.5 text-sm text-red-800">{{ store.error }}</ToastDescription>
        </div>
        <ToastClose class="text-red-400 hover:text-red-600" aria-label="dismiss">✕</ToastClose>
      </ToastRoot>
      <ToastViewport
        class="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none" />
    </div>
  </ToastProvider>
</template>
