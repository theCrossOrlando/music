<script setup>
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
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
import { normalize, looksLikeChordPro, parseSections } from '@/lib/lyricsFormat.js'

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
  ccliNumber: '',
  copyright: '',
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

// Paste is where the structural clean-up happens, and it always reports itself.
// Silently rewriting Mike's formatting is how he stops trusting the tool.
const pasteChanges = ref([])
const beforePaste = ref(null)
const showPreview = ref(false)

// Everything imported lands here, whether it arrived by paste, clipboard button
// or dropped file — one place that decides how a normalize() result fills the form.
function applyImport(result, previous) {
  const { text, changes, ccliNumber, copyright, title, artist } = result
  beforePaste.value = previous
  edit.value.lyrics = text
  if (ccliNumber && !edit.value.ccliNumber) edit.value.ccliNumber = ccliNumber
  if (copyright && !edit.value.copyright) edit.value.copyright = copyright
  if (title && !edit.value.song) edit.value.song = title
  if (artist && !edit.value.artist) edit.value.artist = artist
  pasteChanges.value = changes.length ? changes : ['Already tidy — nothing to change']
}

// SongSelect's Export → Copy puts the song on the clipboard; this reads it back.
// The app never talks to SongSelect itself — automating their site would breach
// the terms the church's licence depends on.
const importError = ref('')

async function importFromClipboard() {
  importError.value = ''
  try {
    const clip = await navigator.clipboard.readText()
    if (!clip.trim()) { importError.value = 'The clipboard is empty.'; return }
    applyImport(normalize(clip, { structural: true }), edit.value.lyrics)
  } catch {
    importError.value = 'Could not read the clipboard — paste into the box instead.'
  }
}

// Export → Download gives a file; accept it dropped or picked.
async function importFile(file) {
  if (!file) return
  importError.value = ''
  applyImport(normalize(await file.text(), { structural: true }), edit.value.lyrics)
}

function onDrop(event) {
  const file = event.dataTransfer?.files?.[0]
  if (file) { event.preventDefault(); importFile(file) }
}

function onLyricsPaste(event) {
  const pasted = event.clipboardData?.getData('text')
  if (!pasted) return

  const field = event.target
  const merged = field.value.slice(0, field.selectionStart) + pasted + field.value.slice(field.selectionEnd)
  const { text, changes, ccliNumber, copyright } = normalize(merged, { structural: true })
  if (!changes.length) return

  event.preventDefault()
  beforePaste.value = field.value
  edit.value.lyrics = text
  if (ccliNumber && !edit.value.ccliNumber) edit.value.ccliNumber = ccliNumber
  if (copyright && !edit.value.copyright) edit.value.copyright = copyright
  pasteChanges.value = changes
}

function undoPaste() {
  if (beforePaste.value === null) return
  edit.value.lyrics = beforePaste.value
  beforePaste.value = null
  pasteChanges.value = []
}

function tidyNow() {
  applyImport(normalize(edit.value.lyrics, { structural: true }), edit.value.lyrics)
}

// We can start the search here and hand off, but the app never queries
// SongSelect itself — automating their service would breach the terms the
// church's licence rests on. Mike searches, hits Export → Copy, comes back.
const songSelectUrl = computed(() => {
  const query = [edit.value.song, edit.value.artist].filter(Boolean).join(' ').trim()
  return `https://songselect.ccli.com/search/results?search=${encodeURIComponent(query)}`
})

// parse.js appends rather than reconciles, so duplicates are easy to create.
const duplicateOf = computed(() => {
  const title = edit.value.song.trim().toLowerCase()
  if (!title) return null
  return store.lyrics.find(
    (l) => l.id !== edit.value.id && (l.song ?? '').trim().toLowerCase() === title) ?? null
})

// Same parser the public page uses, so this preview cannot drift from it.
const previewSections = computed(() => parseSections(edit.value.lyrics))
const isChordPro = computed(() => looksLikeChordPro(edit.value.lyrics))

function displayModal(id) {
  formError.value = ''
  pasteChanges.value = []
  beforePaste.value = null
  importError.value = ''
  showPreview.value = false
  returnFocusTo.value = id ? `row-menu-${id}` : 'add-song'
  edit.value = {
    artist: '',
    song: '',
    lyrics: '',
    ccliNumber: '',
    copyright: '',
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
      ccliNumber: editLyric.ccliNumber ?? '',
      copyright: editLyric.copyright ?? '',
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
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gold">
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
          <div class="flex items-center justify-between gap-4">
            <h2 class="section-title">Library</h2>
            <RouterLink to="/duplicates" class="text-xs text-gold underline underline-offset-2">
              Find duplicates
            </RouterLink>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gold">
                <font-awesome-icon icon="music" />
              </span>
              <input class="input pl-9" type="search" v-model="store.search.song" placeholder="Search song"
                aria-label="Search song">
            </div>
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gold">
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
            class="fixed inset-x-0 top-1/2 z-50 mx-auto w-[calc(100%-2rem)] max-w-2xl -translate-y-1/2 lg:max-w-5xl
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
              <div class="grid gap-3 sm:grid-cols-2">
                <input type="text" class="input" v-model="edit.artist" placeholder="Artist" aria-label="Artist">
                <div class="flex gap-2">
                  <input type="text" class="input" v-model="edit.song" placeholder="Song title"
                    aria-label="Song title">
                  <a class="btn shrink-0 whitespace-nowrap" :href="songSelectUrl" target="_blank" rel="noopener">
                    Find on SongSelect ↗
                  </a>
                </div>
              </div>

              <p v-if="duplicateOf" class="rounded-md border border-brass bg-brass-wash p-2 text-xs text-ink">
                “{{ duplicateOf.song }}” is already in the library{{ duplicateOf.artist ? ` by ${duplicateOf.artist}` : '' }}.
                Saving this will create a second copy.
              </p>
              <div class="grid gap-3 sm:grid-cols-2">
                <input type="text" class="input" v-model="edit.ccliNumber" placeholder="CCLI song number"
                  aria-label="CCLI song number">
                <input type="text" class="input" v-model="edit.copyright" placeholder="Copyright line"
                  aria-label="Copyright line">
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="font-label text-[11px] uppercase tracking-wider text-gold">Lyrics</p>
                <div class="flex items-center gap-3 text-xs">
                  <button type="button" class="btn btn-sm" @click="importFromClipboard">
                    Import from SongSelect
                  </button>
                  <label class="btn btn-sm cursor-pointer">
                    Open file
                    <input type="file" class="sr-only" accept=".txt,.pro,.cho,.chordpro,text/plain"
                      @change="importFile($event.target.files[0]); $event.target.value = ''">
                  </label>
                  <button type="button" class="text-gold underline underline-offset-2" @click="tidyNow">
                    Tidy formatting
                  </button>
                  <button type="button" class="text-gold underline underline-offset-2"
                    @click="showPreview = !showPreview">
                    {{ showPreview ? 'Hide preview' : 'Preview' }}
                  </button>
                </div>
              </div>

              <!-- Paste is cleaned up, but never silently. -->
              <div v-if="pasteChanges.length"
                class="rounded-md border border-brass bg-brass-wash p-3 text-xs text-ink">
                <div class="flex items-start justify-between gap-3">
                  <ul class="space-y-0.5">
                    <li v-for="change in pasteChanges" :key="change">• {{ change }}</li>
                  </ul>
                  <button v-if="beforePaste !== null" type="button"
                    class="shrink-0 text-gold underline underline-offset-2" @click="undoPaste">Undo</button>
                </div>
              </div>

              <p v-if="importError" class="text-xs text-red-800">{{ importError }}</p>

              <p v-if="isChordPro" class="text-xs text-red-800">
                This still looks like ChordPro. “Tidy formatting” will convert the sections and remove the chords.
              </p>

              <div class="grid gap-3" :class="showPreview ? 'lg:grid-cols-2' : ''">
                <textarea class="input font-mono text-xs leading-relaxed" v-model="edit.lyrics"
                  placeholder="Paste from SongSelect, drop an exported file, or type lyrics here"
                  rows="16" aria-label="Lyrics"
                  @paste="onLyricsPaste" @drop="onDrop" @dragover.prevent></textarea>

                <!-- Rendered by the same parser the public page uses. -->
                <div v-if="showPreview"
                  class="max-h-[26rem] overflow-y-auto rounded-md border border-brass-soft bg-paper p-4">
                  <p class="font-display text-2xl font-bold text-ink">{{ edit.song || 'Song title' }}</p>
                  <p v-if="edit.artist" class="mb-3 text-xs font-semibold text-ink-soft">by {{ edit.artist }}</p>
                  <template v-if="previewSections">
                    <div v-for="(section, i) in previewSections" :key="i" class="mt-4 first:mt-0">
                      <p v-if="section.label"
                        class="font-label text-[11px] uppercase tracking-wider text-gold">{{ section.label }}</p>
                      <p class="whitespace-pre-wrap text-sm text-ink">{{ section.body }}</p>
                    </div>
                  </template>
                  <p v-else class="whitespace-pre-wrap text-sm text-ink">{{ edit.lyrics }}</p>
                </div>
              </div>

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
