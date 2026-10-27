<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
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
  AutocompleteRoot, AutocompleteAnchor, AutocompleteInput, AutocompletePortal,
  AutocompleteContent, AutocompleteViewport, AutocompleteItem,
  VisuallyHidden,
} from 'reka-ui'
import { normalize, looksLikeChordPro, parseSections } from '@/lib/lyricsFormat.js'
import { useConfirm } from '@/lib/useConfirm.js'
import { KIND, kindOf, isLiturgyItem } from '@/lib/kind.js'
import {
  suggestBooks, completeBook, splitReferences, unknownBooks, bibleGatewayUrl,
} from '@/lib/scripture.js'

const store = useStore();
const router = useRouter();
store.init()

async function signOut() {
  await store.signOut()
  router.push('/')
}

// Typing is debounced into the store at the same 200 ms the sermon search on
// the public site uses, so a long query does not re-rank the library on every
// keystroke.
const query = ref(store.search.query)
let queryTimer
watch(query, (value) => {
  clearTimeout(queryTimer)
  queryTimer = setTimeout(() => { store.search.query = value }, 200)
})
onUnmounted(() => clearTimeout(queryTimer))
const searchInput = ref(null)

// Adding is the end of one search and the start of the next, so clear the box
// and hand focus back to it once the menu has closed.
let focusSearchOnClose = false
function addToSetList(id) {
  clearTimeout(queryTimer)
  query.value = ''
  store.search.query = ''
  focusSearchOnClose = true
  store.enable(id)
}

// The site's phrasing, curly quotes and all — but counted in results rather
// than songs, because this list spans the liturgy too.
const searchStatus = computed(() => {
  const n = store.libraryRows.length
  const q = store.search.query.trim()
  return n
    ? `${n} result${n === 1 ? '' : 's'} match \u201C${q}\u201D`
    : `No results match \u201C${q}\u201D`
})

// draggable needs a writable binding, but the set list is a derived getter.
// The setter persists the new order instead of mutating the source; Firestore's
// latency compensation re-emits the snapshot immediately, so the list does not
// snap back while the write is in flight.
const setList = computed({
  get: () => store.activeLyrics,
  set: (ordered) => store.saveOrder(ordered),
})

// An artist left on a row since marked liturgy is suppressed here, as the
// public page and the modal preview suppress the byline.
const artistOf = (song) => (isLiturgyItem(song) ? '' : song.artist)

// The browse list splits by kind. A search does not: ranking across the whole
// library is the entire point of that list, and splitting it would bury the
// best match under a heading.
const libraryGroups = computed(() => {
  if (store.search.query.trim()) {
    // Results mix both kinds, so the artist column stays.
    return [{ key: 'results', label: null, heading: 'Song', liturgy: false, rows: store.libraryRows }]
  }
  const groups = [
    { key: 'songs', label: 'Songs', heading: 'Song', liturgy: false, rows: store.librarySongs },
    { key: 'liturgy', label: 'Liturgy', heading: 'Title', liturgy: true, rows: store.libraryLiturgy },
  ].filter((group) => group.rows.length)
  // Nothing to show at all still needs somewhere to say so.
  return groups.length ? groups : [{ key: 'songs', label: null, heading: 'Song', liturgy: false, rows: [] }]
})

const edit = ref({
  id: '',
  artist: '',
  song: '',
  kind: KIND.SONG,
  lyrics: '',
  ccliNumber: '',
  copyright: '',
  enabled: false
})
const showModal = ref(false)
const formError = ref('')

// What to call the thing being edited. "Liturgy" is the section; one of them is
// a liturgy item.
const nounFor = (kind) => (kind === KIND.LITURGY ? 'liturgy item' : 'song')
const bodyNounFor = (kind) => (kind === KIND.LITURGY ? 'text' : 'lyrics')
const editNoun = computed(() => nounFor(edit.value.kind))
const editBodyNoun = computed(() => bodyNounFor(edit.value.kind))
const editBodyLabel = computed(() => (edit.value.kind === KIND.LITURGY ? 'Text' : 'Lyrics'))
// Liturgy has no artist, no CCLI number and no copyright, and SongSelect has
// never heard of the Confession. The whole song-metadata block goes away rather
// than sitting there as four fields that will stay empty forever.
const isLiturgyEdit = computed(() => edit.value.kind === KIND.LITURGY)

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
  // After an archive the originating row is gone, so fall back to the one control
  // that always exists rather than dropping focus on <body>.
  const target = focusKey(returnFocusTo.value) || focusKey('add-song')
  if (target) {
    event.preventDefault()
    target.focus()
  }
}

// Choosing "Edit" or "Archive" opens an overlay, but the menu closes a beat
// later and its own focus restoration yanks focus back out to the trigger.
// Suppress it only when an overlay is taking over; the plain items still
// restore normally.
function onMenuCloseAutoFocus(event) {
  if (focusSearchOnClose) {
    focusSearchOnClose = false
    event.preventDefault()
    searchInput.value?.focus()
  } else if (showModal.value || del.shown.value) event.preventDefault()
}

// Confirm archiving by name so an accidental menu click cannot hide a song.
// useConfirm keeps the subject out of reactive state: confirming closes the
// dialog first, and anything held in a ref is already gone by the time the
// click handler runs.
const del = useConfirm()
const archiveNoun = computed(() => nounFor(kindOf(del.shown.value)))
const archiveBodyNoun = computed(() => bodyNounFor(kindOf(del.shown.value)))

function confirmArchive(lyric) {
  returnFocusTo.value = `row-menu-${lyric.id}`
  del.ask(lyric)
}

async function reallyArchive() {
  const target = del.take()
  if (target) await store.archiveLyric(target.id)
}

// Paste is where the structural clean-up happens, and it always reports itself.
// Silently rewriting Mike's formatting is how he stops trusting the tool.
const pasteChanges = ref([])
const beforePaste = ref(null)
const showPreview = ref(false)

// Hints so the normalizer can drop a title or artist line that only repeats
// fields the record already has.
const importHints = () => ({
  structural: true,
  knownTitle: edit.value.song,
  knownArtist: edit.value.artist,
})

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
    applyImport(normalize(clip, importHints()), edit.value.lyrics)
  } catch {
    importError.value = 'Could not read the clipboard — paste into the box instead.'
  }
}

// Export → Download gives a file; accept it dropped or picked.
async function importFile(file) {
  if (!file) return
  importError.value = ''
  applyImport(normalize(await file.text(), importHints()), edit.value.lyrics)
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
  const result = normalize(merged, importHints())
  if (!result.changes.length) return

  event.preventDefault()
  applyImport(result, field.value)
}

function undoPaste() {
  if (beforePaste.value === null) return
  edit.value.lyrics = beforePaste.value
  beforePaste.value = null
  pasteChanges.value = []
}

function tidyNow() {
  applyImport(normalize(edit.value.lyrics, importHints()), edit.value.lyrics)
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
  return store.availableLyrics.find(
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
    kind: KIND.SONG,
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
      // Resolved, not read raw: a row that predates the field shows the
      // classification it is already being filed under, so opening and saving
      // it cannot silently move it.
      kind: kindOf(editLyric),
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
          <div v-for="scripture in store.scripture" :key="scripture.id" class="space-y-2">
            <div class="flex gap-2">
              <AutocompleteRoot v-model="scripture.verse" ignore-filter class="relative flex-1">
                <AutocompleteAnchor>
                  <span class="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gold">
                    <font-awesome-icon icon="book" />
                  </span>
                  <AutocompleteInput class="input pl-9" placeholder="Scripture" aria-label="Scripture" />
                </AutocompleteAnchor>
                <AutocompletePortal>
                  <!-- The item's value is the whole field as it will read once
                       the book is filled in, so picking one leaves an earlier
                       reference and any chapter already typed alone. -->
                  <AutocompleteContent v-if="suggestBooks(scripture.verse).length" position="popper"
                    :side-offset="4" class="menu-panel">
                    <AutocompleteViewport>
                      <AutocompleteItem v-for="book in suggestBooks(scripture.verse)" :key="book"
                        :value="completeBook(scripture.verse, book)" class="menu-item">
                        {{ book }}
                      </AutocompleteItem>
                    </AutocompleteViewport>
                  </AutocompleteContent>
                </AutocompletePortal>
              </AutocompleteRoot>
              <button class="btn btn-primary" @click="store.updateScripture(scripture.id)">Update</button>
            </div>
            <!-- The same links the sermon pages render, so the reference can be
                 opened and checked before it is saved. -->
            <p v-if="splitReferences(scripture.verse).length" class="scripture text-xs text-ink-soft">
              <template v-for="(reference, i) in splitReferences(scripture.verse)" :key="reference">
                <span v-if="i">, </span>
                <a :href="bibleGatewayUrl(reference)" target="_blank" rel="noopener"
                  class="text-gold underline underline-offset-2">{{ reference }}</a>
              </template>
            </p>
            <p v-if="unknownBooks(scripture.verse).length" class="text-xs text-ink-soft">
              {{ unknownBooks(scripture.verse).join(', ') }} —
              {{ unknownBooks(scripture.verse).length === 1 ? 'not a book' : 'not books' }} I recognise.
              It will still save.
            </p>
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
              Add to library
            </button>
          </div>

          <!-- One table: a service interleaves songs and liturgy, and the order
               they are dragged into is the order they are played. Title first —
               it is the only column every row fills, so it is the row header and
               takes the handle. `.table tbody th` is styled as a td. -->
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Artist</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <draggable v-model="setList" tag="tbody" item-key="id" handle=".drag-handle">
                <template #item="{ element }">
                  <tr class="group">
                    <th scope="row">
                      <span class="drag-handle mr-2 cursor-grab text-brass-soft group-hover:text-brass"
                        aria-hidden="true">⠿</span>{{ element.song }}
                    </th>
                    <td>{{ artistOf(element) }}</td>
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
                            <DropdownMenuItem as="button" class="menu-item"
                              @select="confirmArchive(element)">
                              Archive…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenuPortal>
                      </DropdownMenuRoot>
                    </td>
                  </tr>
                </template>
              </draggable>
            </table>
            <p v-if="!setList.length" class="px-4 py-8 text-center text-sm text-ink-soft">
              Nothing in the set list yet. Add something from the library below.
            </p>
          </div>
        </section>

        <!-- Library -->
        <section class="space-y-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="section-title">Library</h2>
            <div class="flex gap-3 text-xs">
              <RouterLink to="/match" class="text-gold underline underline-offset-2">
                Match to CCLI
              </RouterLink>
              <RouterLink to="/duplicates" class="text-gold underline underline-offset-2">
                Find duplicates
              </RouterLink>
            </div>
          </div>
          <div class="relative">
            <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gold">
              <font-awesome-icon icon="magnifying-glass" />
            </span>
            <input ref="searchInput" class="input pl-9" type="search" v-model="query"
              placeholder="Search titles &amp; artists…" aria-label="Search the library"
              aria-controls="library-results">
          </div>
          <p v-if="store.search.query.trim()" class="text-xs text-ink-soft" aria-live="polite">
            {{ searchStatus }}
          </p>

          <div id="library-results" class="space-y-4">
            <div v-for="group in libraryGroups" :key="group.key" class="space-y-2">
              <h3 v-if="group.label && libraryGroups.length > 1"
                class="font-label text-[11px] uppercase tracking-wider text-gold">
                {{ group.label }} ({{ group.rows.length }})
              </h3>
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th v-if="!group.liturgy" scope="col">Artist</th>
                      <th scope="col">{{ group.heading }}</th>
                      <th scope="col"><span class="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="lyric in group.rows" :key="lyric.id">
                      <th v-if="!group.liturgy" scope="row">{{ lyric.artist }}</th>
                      <component :is="group.liturgy ? 'th' : 'td'" :scope="group.liturgy ? 'row' : undefined">
                        {{ lyric.song }}
                      </component>
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
                              <DropdownMenuItem as="button" class="menu-item" @select="addToSetList(lyric.id)">
                                Add to set list
                              </DropdownMenuItem>
                              <DropdownMenuSeparator class="my-1 h-px bg-brass-soft" />
                              <DropdownMenuItem as="button" class="menu-item"
                                @select="confirmArchive(lyric)">
                                Archive…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenuPortal>
                        </DropdownMenuRoot>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="!group.rows.length" class="px-4 py-8 text-center text-sm text-ink-soft">
                  {{ store.search.query.trim() ? searchStatus : 'The library is empty.' }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Archive -->
        <section v-if="store.archivedLyrics.length" class="space-y-3">
          <details class="card p-4">
            <summary class="cursor-pointer font-display font-bold text-ink">
              Archive ({{ store.archivedLyrics.length }})
            </summary>
            <p class="mt-1 text-xs text-ink-soft">Anything archived is hidden everywhere else in the app.</p>
            <ul class="mt-3 divide-y divide-brass-soft">
              <li v-for="lyric in store.archivedLyrics" :key="lyric.id"
                class="flex items-center gap-3 py-2 text-sm">
                <span class="min-w-0 flex-1 truncate">
                  <strong class="font-semibold text-ink">{{ lyric.song }}</strong>
                  <span v-if="lyric.artist" class="text-ink-soft"> — {{ lyric.artist }}</span>
                </span>
                <button class="btn btn-sm" @click="store.restoreLyric(lyric.id)">Restore</button>
              </li>
            </ul>
          </details>
        </section>
      </main>

      <!-- Edit / add -->
      <DialogRoot v-model:open="showModal">
        <DialogPortal>
          <DialogOverlay class="fixed inset-0 z-40 bg-ink/50" />
          <!-- Capped at the viewport with the fields scrolling between a fixed
               title and a fixed footer: uncapped, a phone-height stack hangs off
               both edges of a fixed box that nothing can scroll. -->
          <DialogContent
            class="fixed inset-x-0 top-1/2 z-50 mx-auto flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)]
                   max-w-2xl -translate-y-1/2 flex-col lg:max-w-5xl
                   rounded-md border border-brass-soft bg-white shadow-xl focus:outline-none"
            @close-auto-focus="restoreFocus">
            <DialogTitle class="shrink-0 px-6 pt-6 font-display text-xl font-bold text-ink">
              {{ edit.id ? `Edit ${editNoun}` : `Add a ${editNoun}` }}
            </DialogTitle>
            <VisuallyHidden as-child>
              <DialogDescription>
                Enter the title and the text, then save.
              </DialogDescription>
            </VisuallyHidden>

            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
              <!-- First, because it changes what everything below it means. A
                   two-way exclusive choice is what native radios are for; reka
                   is worth reaching for when it buys behaviour HTML lacks. -->
              <fieldset class="flex flex-wrap items-center gap-x-5 gap-y-1">
                <legend class="font-label text-[11px] uppercase tracking-wider text-gold">This is a</legend>
                <label class="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input type="radio" name="kind" class="accent-ink" :value="KIND.SONG" v-model="edit.kind">
                  Song
                </label>
                <label class="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input type="radio" name="kind" class="accent-ink" :value="KIND.LITURGY" v-model="edit.kind">
                  Liturgy
                </label>
                <p class="basis-full text-xs text-ink-soft">
                  Liturgy gets its own section on the lyrics page — no artist byline, no CCLI credit.
                </p>
              </fieldset>

              <!-- The title stays whatever the kind: it is required, and it is
                   what both lists show. Everything else here is about songs. -->
              <div class="grid gap-3" :class="isLiturgyEdit ? '' : 'sm:grid-cols-2'">
                <input v-if="!isLiturgyEdit" type="text" class="input" v-model="edit.artist"
                  placeholder="Artist" aria-label="Artist">
                <div class="flex gap-2">
                  <input type="text" class="input" v-model="edit.song" placeholder="Title"
                    aria-label="Title">
                  <a v-if="!isLiturgyEdit" class="btn shrink-0 whitespace-nowrap" :href="songSelectUrl"
                    target="_blank" rel="noopener">
                    Find on SongSelect ↗
                  </a>
                </div>
              </div>

              <p v-if="duplicateOf" class="rounded-md border border-brass bg-brass-wash p-2 text-xs text-ink">
                “{{ duplicateOf.song }}” is already in the library{{ duplicateOf.artist ? ` by ${duplicateOf.artist}` : '' }}.
                Saving this will create a second copy.
              </p>
              <div v-if="!isLiturgyEdit" class="grid gap-3 sm:grid-cols-2">
                <input type="text" class="input" v-model="edit.ccliNumber" placeholder="CCLI song number"
                  aria-label="CCLI song number">
                <input type="text" class="input" v-model="edit.copyright" placeholder="Copyright line"
                  aria-label="Copyright line">
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="font-label text-[11px] uppercase tracking-wider text-gold">
                  {{ editBodyLabel }}
                </p>
                <div class="flex items-center gap-3 text-xs">
                  <button v-if="!isLiturgyEdit" type="button" class="btn btn-sm" @click="importFromClipboard">
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
                <!-- rows=16 is most of a phone screen on its own, which buries
                     the title and the toolbar above it. -->
                <textarea class="input max-h-[50dvh] font-mono text-xs leading-relaxed pointer-coarse:text-base lg:max-h-none"
                  v-model="edit.lyrics"
                  :placeholder="`Paste from SongSelect, drop an exported file, or type the ${editBodyNoun} here`"
                  rows="16" :aria-label="editBodyLabel"
                  @paste="onLyricsPaste" @drop="onDrop" @dragover.prevent></textarea>

                <!-- Rendered by the same parser the public page uses. -->
                <div v-if="showPreview"
                  class="max-h-[26rem] overflow-y-auto rounded-md border border-brass-soft bg-paper p-4">
                  <p class="font-display text-2xl font-bold text-ink">{{ edit.song || 'Title' }}</p>
                  <!-- Suppressed for liturgy, as the public page suppresses it: a
                       preview that shows a byline the page will not render is worse
                       than no preview. -->
                  <p v-if="edit.artist && edit.kind !== KIND.LITURGY"
                    class="mb-3 text-xs font-semibold text-ink-soft">by {{ edit.artist }}</p>
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

            <div class="shrink-0 flex justify-end gap-2 px-6 pb-6 pt-4">
              <DialogClose as="button" class="btn">Cancel</DialogClose>
              <button class="btn btn-primary" @click="updateLyrics">Save</button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>

      <!-- Archive confirmation. -->
      <AlertDialogRoot :open="!!del.shown.value" @update:open="open => { if (!open) del.dismiss() }">
        <AlertDialogPortal>
          <AlertDialogOverlay class="fixed inset-0 z-40 bg-ink/50" />
          <AlertDialogContent
            class="fixed inset-x-0 top-1/2 z-50 mx-auto w-[calc(100%-2rem)] max-w-md -translate-y-1/2
                   rounded-md border border-brass-soft bg-white p-6 shadow-xl focus:outline-none"
            @close-auto-focus="restoreFocus">
            <AlertDialogTitle class="font-display text-xl font-bold text-ink">
              Archive this {{ archiveNoun }}?
            </AlertDialogTitle>
            <AlertDialogDescription class="mt-2 text-sm text-ink-soft">
              <strong class="font-semibold text-ink">{{ del.shown.value?.song }}</strong>
              <template v-if="del.shown.value?.artist"> by {{ del.shown.value.artist }}</template>
              will be removed from the library and set list. Its {{ archiveBodyNoun }} will be kept,
              and you can restore it later.
            </AlertDialogDescription>
            <div class="mt-5 flex justify-end gap-2">
              <AlertDialogCancel as="button" class="btn">Cancel</AlertDialogCancel>
              <AlertDialogAction as="button" class="btn btn-primary" @click="reallyArchive">
                Archive {{ archiveNoun }}
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
