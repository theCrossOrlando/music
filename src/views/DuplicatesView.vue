<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useStore } from '@/stores/lyrics'
import { findDuplicateGroups, suggestKeeper, fillableFields } from '@/lib/duplicates.js'
import { diffLines, diffFields } from '@/lib/lineDiff.js'
import {
  AlertDialogRoot, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction,
  ToastProvider, ToastRoot, ToastTitle, ToastDescription, ToastClose, ToastViewport,
} from 'reka-ui'

const store = useStore()
store.init()

const groups = computed(() => findDuplicateGroups(store.lyrics))

// Which row to keep, per group. Defaults to the suggestion but stays editable.
const chosen = ref({})
const keeperFor = (group) => chosen.value[group.key] ?? suggestKeeper(group.songs).id

const pending = ref(null)

function setToastOpen(open) {
  if (!open) store.error = ''
}

function planMerge(group) {
  const keepId = keeperFor(group)
  const keeper = group.songs.find((s) => s.id === keepId)
  const others = group.songs.filter((s) => s.id !== keepId)
  pending.value = { group, keeper, others, fields: fillableFields(keeper, others) }
}

async function confirmMerge() {
  const plan = pending.value
  pending.value = null
  if (!plan) return
  await store.mergeSongs({
    keepId: plan.keeper.id,
    fields: plan.fields,
    deleteIds: plan.others.map((s) => s.id),
  })
}

const summary = computed(() => ({
  groups: groups.value.length,
  rows: groups.value.reduce((n, g) => n + g.songs.length, 0),
  removable: groups.value.reduce((n, g) => n + g.songs.length - 1, 0),
}))

const confidenceLabel = (c) => (c >= 0.8 ? 'Very likely' : c >= 0.5 ? 'Likely' : 'Check carefully')
const confidenceClass = (c) =>
  c >= 0.8 ? 'bg-brass text-white' : c >= 0.5 ? 'bg-brass-wash text-ink' : 'bg-red-50 text-red-800'

// Compared against whichever row is currently selected to keep, so switching
// the radio re-frames the diff rather than forcing a re-read.
function comparison(group, song) {
  const keeper = group.songs.find((s) => s.id === keeperFor(group))
  if (!keeper || keeper.id === song.id) return null
  const lyrics = diffLines(keeper.lyrics, song.lyrics)
  return {
    lyrics,
    // Lines present here and absent from the keeper: exactly what deleting
    // this row would throw away.
    unique: lyrics.rows.filter((r) => r.status === 'added' && r.text.trim()).length,
    fields: diffFields(keeper, song),
  }
}

// The decision is "what do I lose if I delete this row", so the emphasis goes
// on lines unique to this copy. Lines only in the keeper are muted — they are
// not at risk.
const rowClass = (status) => ({
  same: 'text-ink-faint',
  added: 'bg-amber-100 font-medium text-amber-950',
  removed: 'text-ink-faint/60 line-through',
}[status])

const FIELD_LABEL = {
  song: 'Title', artist: 'Artist', ccliNumber: 'CCLI #', copyright: 'Copyright',
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
          <div class="ml-auto text-xs text-ink-soft">{{ store.authedUser.email }}</div>
        </div>
      </header>

      <main class="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h2 class="section-title">Possible duplicates</h2>
          <p class="mt-1 text-sm text-ink-soft">
            <template v-if="summary.groups">
              {{ summary.groups }} groups covering {{ summary.rows }} songs —
              up to {{ summary.removable }} rows could be removed. Nothing is merged
              until you say so.
            </template>
            <template v-else-if="store.isLoading">Loading…</template>
            <template v-else>No duplicates found.</template>
          </p>
        </div>

        <section v-for="group in groups" :key="group.key" class="card p-4">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <span class="rounded px-2 py-0.5 font-label text-[10px] uppercase tracking-wider"
              :class="confidenceClass(group.confidence)">
              {{ confidenceLabel(group.confidence) }}
            </span>
            <span v-for="reason in group.reasons" :key="reason"
              class="rounded border border-brass-soft px-2 py-0.5 text-[11px] text-ink-soft">
              {{ reason }}
            </span>
          </div>

          <div class="grid gap-2" :class="group.songs.length > 2 ? 'lg:grid-cols-3' : 'sm:grid-cols-2'">
            <label v-for="song in group.songs" :key="song.id"
              class="cursor-pointer rounded-md border p-3 text-sm transition-colors"
              :class="keeperFor(group) === song.id
                ? 'border-brass bg-brass-wash'
                : 'border-brass-soft bg-white hover:border-brass'">
              <div class="flex items-start gap-2">
                <input type="radio" class="mt-1" :name="`keep-${group.key}`"
                  :value="song.id" :checked="keeperFor(group) === song.id"
                  @change="chosen[group.key] = song.id">
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-ink">{{ song.song || '(no title)' }}</p>
                  <p class="text-xs text-ink-soft">{{ song.artist || '(no artist)' }}</p>
                  <p class="mt-1 flex flex-wrap gap-1 text-[10px] text-ink-faint">
                    <span v-if="song.enabled"
                      class="rounded bg-ink px-1.5 py-0.5 font-medium text-white">In set list</span>
                    <span>{{ (song.lyrics || '').length }} chars</span>
                    <span v-if="song.ccliNumber">CCLI {{ song.ccliNumber }}</span>
                  </p>
                  <template v-if="comparison(group, song)">
                    <p v-if="comparison(group, song).lyrics.identical"
                      class="mt-2 text-[11px] font-medium text-ink-soft">
                      Lyrics identical — nothing lost by deleting this
                    </p>
                    <p v-else-if="comparison(group, song).unique"
                      class="mt-2 text-[11px] font-medium text-amber-800">
                      {{ comparison(group, song).unique }}
                      {{ comparison(group, song).unique === 1 ? 'line' : 'lines' }}
                      here {{ comparison(group, song).unique === 1 ? 'is' : 'are' }}
                      not in the one you're keeping
                    </p>
                    <p v-else class="mt-2 text-[11px] font-medium text-ink-soft">
                      Nothing here that the one you're keeping doesn't already have
                    </p>
                    <ul v-if="comparison(group, song).fields.length"
                      class="mt-1 space-y-0.5 text-[11px] text-ink-soft">
                      <li v-for="f in comparison(group, song).fields" :key="f.field">
                        <span class="font-label uppercase tracking-wider text-gold">{{ FIELD_LABEL[f.field] || f.field }}</span>
                        {{ f.b || '(blank)' }}
                      </li>
                    </ul>
                  </template>
                  <p v-else class="mt-2 text-[11px] font-medium text-ink-soft">Keeping this one</p>

                  <div class="mt-2 max-h-56 overflow-y-auto rounded border border-brass-soft/60 bg-paper/60 p-2">
                    <p v-if="!(song.lyrics || '').trim()" class="text-[11px] italic text-ink-faint">
                      (no lyrics)
                    </p>
                    <template v-else-if="comparison(group, song)">
                      <p v-for="(row, i) in comparison(group, song).lyrics.rows" :key="i"
                        class="whitespace-pre-wrap px-1 font-mono text-[11px] leading-snug"
                        :class="rowClass(row.status)">{{ row.text || ' ' }}</p>
                    </template>
                    <p v-else
                      class="whitespace-pre-wrap font-mono text-[11px] leading-snug text-ink">{{ song.lyrics }}</p>
                  </div>
                </div>
              </div>
            </label>
          </div>

          <div class="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button class="btn btn-sm" @click="store.dismissDuplicates(group.songs.map(s => s.id))">
              Not duplicates
            </button>
            <button class="btn btn-sm btn-danger" @click="planMerge(group)">
              Keep selected, delete {{ group.songs.length - 1 }}
            </button>
          </div>
        </section>
      </main>

      <AlertDialogRoot :open="!!pending" @update:open="open => { if (!open) pending = null }">
        <AlertDialogPortal>
          <AlertDialogOverlay class="fixed inset-0 z-40 bg-ink/50" />
          <AlertDialogContent
            class="fixed inset-x-0 top-1/2 z-50 mx-auto w-[calc(100%-2rem)] max-w-lg -translate-y-1/2
                   rounded-md border border-brass-soft bg-white p-6 shadow-xl focus:outline-none">
            <AlertDialogTitle class="font-display text-xl font-bold text-ink">Merge these songs?</AlertDialogTitle>
            <AlertDialogDescription as="div" class="mt-3 space-y-3 text-sm text-ink-soft">
              <p>
                Keeping <strong class="font-semibold text-ink">{{ pending?.keeper.song }}</strong>
                <template v-if="pending?.keeper.artist"> by {{ pending.keeper.artist }}</template>.
              </p>
              <div v-if="Object.keys(pending?.fields ?? {}).length">
                <p class="text-ink">Filling in blanks from the others:</p>
                <ul class="mt-1 space-y-0.5">
                  <li v-for="(value, field) in pending.fields" :key="field">
                    <span class="font-label text-[11px] uppercase tracking-wider text-gold">{{ field }}</span>
                    → {{ value }}
                  </li>
                </ul>
              </div>
              <div>
                <p class="text-red-800">Permanently deleting:</p>
                <ul class="mt-1 space-y-0.5">
                  <li v-for="other in pending?.others" :key="other.id">
                    • {{ other.song || '(no title)' }}
                    <template v-if="other.artist"> — {{ other.artist }}</template>
                    <span class="text-ink-faint">({{ (other.lyrics || '').length }} chars)</span>
                  </li>
                </ul>
              </div>
              <p>This cannot be undone.</p>
            </AlertDialogDescription>
            <div class="mt-5 flex justify-end gap-2">
              <AlertDialogCancel as="button" class="btn">Cancel</AlertDialogCancel>
              <AlertDialogAction as="button" class="btn btn-danger" @click="confirmMerge">
                Merge and delete
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialogRoot>

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
