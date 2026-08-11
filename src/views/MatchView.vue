<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useStore } from '@/stores/lyrics'
import { normalize } from '@/lib/lyricsFormat.js'
import { STATUS, buildQueue, progress, decisionFields } from '@/lib/matching.js'
import {
  ToastProvider, ToastRoot, ToastTitle, ToastDescription, ToastClose, ToastViewport,
} from 'reka-ui'

const store = useStore()
store.init()

// Skipping is deliberately not persisted. Writing a 'skipped' status would
// mark the song reviewed and hide it from this queue for good, which is the
// opposite of "come back to it" — it would quietly strand songs unmatched.
const skipped = ref(new Set())
const queue = computed(() => buildQueue(store.lyrics).filter((q) => !skipped.value.has(q.song.id)))
const stats = computed(() => progress(store.lyrics))
const current = computed(() => queue.value[0] ?? null)

const pasted = ref('')
const parsed = ref(null)
const busy = ref(false)

// Multi-select for the mechanical buckets. Twenty liturgy rows should not cost
// twenty round trips.
const bulk = ref(new Set())
const bulkCandidates = computed(() => queue.value.filter((q) => q.suggestion))
const toggleBulk = (id) => {
  const next = new Set(bulk.value)
  next.has(id) ? next.delete(id) : next.add(id)
  bulk.value = next
}

const songSelectUrl = (song) => {
  const q = [song.song, song.artist].filter(Boolean).join(' ').trim()
  return `https://songselect.ccli.com/search/results?search=${encodeURIComponent(q)}`
}

function onPaste(event) {
  const text = event.clipboardData?.getData('text')
  if (!text?.trim()) return
  event.preventDefault()
  pasted.value = text
  const result = normalize(text, { structural: true })
  parsed.value = result.ccliNumber || result.copyright ? result : { ...result, empty: true }
}

function clearPaste() {
  pasted.value = ''
  parsed.value = null
}

async function decide(status, extra) {
  if (!current.value || busy.value) return
  busy.value = true
  const ok = await store.recordDecisions({
    [current.value.song.id]: decisionFields(status, extra),
  })
  busy.value = false
  if (ok) clearPaste()
}

// Session-only: the song reappears next time the queue is opened.
function skipCurrent() {
  if (!current.value) return
  skipped.value = new Set(skipped.value).add(current.value.song.id)
  clearPaste()
}

async function saveMatch() {
  await decide(STATUS.MATCHED, {
    ccliNumber: parsed.value?.ccliNumber,
    copyright: parsed.value?.copyright,
  })
}

async function applyBulk(status) {
  if (!bulk.value.size || busy.value) return
  busy.value = true
  const updates = {}
  for (const id of bulk.value) updates[id] = decisionFields(status)
  const ok = await store.recordDecisions(updates)
  busy.value = false
  if (ok) bulk.value = new Set()
}

function setToastOpen(open) {
  if (!open) store.error = ''
}
</script>

<template>
  <ToastProvider>
    <div class="min-h-screen">
      <header class="sticky top-0 z-30 border-b border-brass-soft bg-paper/90 backdrop-blur">
        <div class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
          <h1 class="font-display text-base font-bold tracking-tight text-ink">theCross Music</h1>
          <RouterLink to="/lyrics" class="text-xs text-gold underline underline-offset-2">
            ← Back to songs
          </RouterLink>
          <div class="ml-auto text-xs text-ink-soft">
            {{ stats.reviewed }} of {{ stats.total }} reviewed
          </div>
        </div>
        <div class="h-1 bg-brass-soft/40">
          <div class="h-1 bg-brass transition-all"
            :style="{ width: `${stats.total ? (stats.reviewed / stats.total) * 100 : 0}%` }"></div>
        </div>
      </header>

      <main class="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div v-if="!current" class="card p-8 text-center">
          <p class="font-display text-xl font-bold text-ink">Nothing left to review</p>
          <p class="mt-1 text-sm text-ink-soft">
            All {{ stats.total }} songs have a CCLI decision recorded.
          </p>
        </div>

        <template v-else>
          <section class="card p-5">
            <p class="font-label text-[11px] uppercase tracking-wider text-gold">
              {{ stats.remaining }} left
            </p>
            <h2 class="mt-1 font-display text-2xl font-bold text-ink">
              {{ current.song.song || '(no title)' }}
            </h2>
            <p class="text-sm text-ink-soft">{{ current.song.artist || '(no artist)' }}</p>
            <p v-if="current.song.enabled"
              class="mt-2 inline-block rounded bg-ink px-2 py-0.5 text-[10px] font-medium text-white">
              In the set list
            </p>

            <p v-if="current.suggestion === STATUS.NOT_A_SONG"
              class="mt-3 rounded-md border border-brass bg-brass-wash p-2 text-xs text-ink">
              This looks like liturgy rather than a song — it won't be in SongSelect.
            </p>
            <p v-else-if="current.suggestion === STATUS.PUBLIC_DOMAIN"
              class="mt-3 rounded-md border border-brass bg-brass-wash p-2 text-xs text-ink">
              The author suggests this is public domain. Worth confirming — an arrangement
              can carry its own copyright.
            </p>

            <div class="mt-4 max-h-40 overflow-y-auto rounded border border-brass-soft/60 bg-paper/60 p-2">
              <p class="whitespace-pre-wrap font-mono text-[11px] leading-snug text-ink-soft">{{
                current.song.lyrics || '(no lyrics)' }}</p>
            </div>
          </section>

          <section class="card space-y-3 p-5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-label text-[11px] uppercase tracking-wider text-gold">Look it up</p>
              <a class="btn btn-sm" :href="songSelectUrl(current.song)" target="_blank" rel="noopener">
                Find on SongSelect ↗
              </a>
            </div>
            <p class="text-xs text-ink-soft">
              Open it there, use Export → Copy, then paste below. Only the CCLI number and
              copyright are taken — the lyrics here are left alone.
            </p>

            <textarea class="input font-mono text-xs" rows="4" :value="pasted"
              aria-label="Paste from SongSelect"
              placeholder="Paste the SongSelect export here" @paste="onPaste"></textarea>

            <div v-if="parsed && !parsed.empty"
              class="rounded-md border border-brass bg-brass-wash p-3 text-xs text-ink">
              <p v-if="parsed.ccliNumber">
                <span class="font-label uppercase tracking-wider text-gold">CCLI #</span>
                {{ parsed.ccliNumber }}
              </p>
              <p v-if="parsed.copyright">
                <span class="font-label uppercase tracking-wider text-gold">Copyright</span>
                {{ parsed.copyright }}
              </p>
            </div>
            <p v-else-if="parsed?.empty" class="text-xs text-red-800">
              No CCLI number or copyright found in that. Check you copied the whole export.
            </p>

            <div class="flex flex-wrap justify-end gap-2 pt-1">
              <button class="btn btn-sm" :disabled="busy" @click="skipCurrent">Skip for now</button>
              <button class="btn btn-sm" :disabled="busy" @click="decide(STATUS.NOT_A_SONG)">
                Not a song
              </button>
              <button class="btn btn-sm" :disabled="busy" @click="decide(STATUS.PUBLIC_DOMAIN)">
                Public domain
              </button>
              <button class="btn btn-sm btn-primary" :disabled="busy || !parsed || parsed.empty"
                @click="saveMatch">
                Save match
              </button>
            </div>
          </section>

          <section v-if="bulkCandidates.length" class="card p-5">
            <p class="font-label text-[11px] uppercase tracking-wider text-gold">
              Mechanical — {{ bulkCandidates.length }} suggested
            </p>
            <p class="mt-1 text-xs text-ink-soft">
              Liturgy and public-domain hymns need a decision, not a lookup. Tick and apply
              in one go.
            </p>
            <div class="mt-3 max-h-64 space-y-1 overflow-y-auto">
              <label v-for="item in bulkCandidates" :key="item.song.id"
                class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-brass-wash">
                <input type="checkbox" :checked="bulk.has(item.song.id)"
                  @change="toggleBulk(item.song.id)">
                <span class="flex-1 truncate text-ink">{{ item.song.song }}</span>
                <span class="truncate text-xs text-ink-soft">{{ item.song.artist }}</span>
                <span class="font-label text-[10px] uppercase tracking-wider text-gold">
                  {{ item.suggestion === STATUS.NOT_A_SONG ? 'liturgy' : 'public domain' }}
                </span>
              </label>
            </div>
            <div class="mt-3 flex flex-wrap justify-end gap-2">
              <button class="btn btn-sm" :disabled="!bulk.size || busy"
                @click="applyBulk(STATUS.NOT_A_SONG)">
                Mark {{ bulk.size }} as not a song
              </button>
              <button class="btn btn-sm" :disabled="!bulk.size || busy"
                @click="applyBulk(STATUS.PUBLIC_DOMAIN)">
                Mark {{ bulk.size }} as public domain
              </button>
            </div>
          </section>
        </template>
      </main>

      <ToastRoot class="flex items-start gap-3 rounded-md border border-red-800/25 bg-red-50 p-4"
        :open="!!store.error" :duration="8000" @update:open="setToastOpen">
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
