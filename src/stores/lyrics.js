import { defineStore } from 'pinia'
import firebase from '../firebaseInit.js'
import {
  collection,
  getFirestore,
  getDoc,
  doc,
  onSnapshot,
  updateDoc,
  writeBatch,
  deleteField,
  deleteDoc,
  addDoc
} from 'firebase/firestore'
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth'
import { normalize } from '@/lib/lyricsFormat.js'

const db = getFirestore(firebase)
const auth = getAuth(firebase)
const colRefLyrics = collection(db, 'lyrics')
const colRefScripture = collection(db, 'scripture')

// Snapshots hand back a fresh array every time rather than being patched in
// place. Splicing by docChanges() index — what pinia-firestore did — only holds
// while local array order matches query order, which drag-to-reorder breaks.
const toDocs = (snapshot) => snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

const byArtistThenSong = (a, b) =>
  (a.artist ?? '').localeCompare(b.artist ?? '') ||
  (a.song ?? '').localeCompare(b.song ?? '')

// Listeners live outside state: they are not data, and Pinia should not try to
// make an unsubscribe function reactive.
let unsubscribers = []

export const useStore = defineStore('lyrics', {
  state: () => ({
    authedUser: {
      uid: null,
      email: null
    },
    isAdmin: false,
    lyrics: [],
    isLoading: false,
    error: '',
    search: {
      artist: '',
      song: '',
    },
    scripture: []
  }),
  actions: {
    // Called from every view's setup, so it has to be safe to call repeatedly.
    init() {
      if (unsubscribers.length) return
      this.isLoading = true

      const onError = (error) => {
        this.isLoading = false
        this.error = `Could not load data: ${error.message}`
      }

      unsubscribers.push(
        onSnapshot(colRefLyrics, snapshot => {
          this.lyrics = toDocs(snapshot)
          this.isLoading = false
        }, onError),
        onSnapshot(colRefScripture, snapshot => {
          this.scripture = toDocs(snapshot)
        }, onError)
      )
    },
    teardown() {
      unsubscribers.forEach(unsub => unsub())
      unsubscribers = []
    },
    // Drop the listeners before signing out, otherwise they keep running
    // against rules that no longer admit the user and spray permission errors.
    async signOut() {
      this.teardown()
      await signOut(auth)
      this.$reset()
    },
    // Writes are wrapped so a rejected write surfaces instead of becoming an
    // unhandled rejection — non-admins now hit the rules on every one of these.
    async run(work, message) {
      this.error = ''
      try {
        await work()
        return true
      } catch (error) {
        this.error = `${message}: ${error.message}`
        return false
      }
    },
    enable(id) {
      return this.run(
        () => updateDoc(doc(db, 'lyrics', id), {
          enabled: true,
          order: this.activeLyrics.length
        }),
        'Could not add the song to the set list'
      )
    },
    disable(id) {
      return this.run(
        () => updateDoc(doc(db, 'lyrics', id), {
          enabled: false,
          order: deleteField()
        }),
        'Could not remove the song from the set list'
      )
    },
    // Irreversible, and the rules already cover it: `allow write` on /lyrics
    // spans create, update and delete. Callers are expected to confirm first.
    deleteLyric(id) {
      return this.run(
        () => deleteDoc(doc(db, 'lyrics', id)),
        'Could not delete the song'
      )
    },
    updateScripture(id) {
      const verse = this.scripture.find(s => s.id === id)?.verse
      return this.run(
        () => updateDoc(doc(db, 'scripture', id), { verse }),
        'Could not update the scripture'
      )
    },
    // Throws rather than routing to this.error: the caller is the edit modal,
    // which shows validation failures next to the fields that caused them.
    async updateLyrics(data) {
      const { id, ...rest } = data
      // Trim every field so a stray space never becomes a blank artist on the
      // public page, and require the fields the lyrics page actually renders.
      const lyrics = {
        ...rest,
        song: (rest.song ?? '').trim(),
        artist: (rest.artist ?? '').trim(),
        // Safe pass only — never structural. An ordinary save tidies whitespace
        // and quotes; it must not restructure lyrics someone laid out by hand.
        lyrics: normalize(rest.lyrics ?? '').text,
        // Legacy imports can lack this field entirely, and Firestore rejects a
        // write containing undefined.
        enabled: rest.enabled === true,
      }
      if (!lyrics.song || !lyrics.lyrics) {
        throw new Error('Song title and lyrics are both required.')
      }
      if (id) {
        await updateDoc(doc(db, 'lyrics', id), lyrics)
      }
      else {
        await addDoc(colRefLyrics, lyrics)
      }
    },
    // Takes the reordered list rather than reading store state, so the caller
    // can hand over vuedraggable's result directly.
    saveOrder(ordered) {
      return this.run(
        () => {
          const batch = writeBatch(db)
          ordered.forEach((lyric, i) => {
            batch.update(doc(db, 'lyrics', lyric.id), { order: i })
          })
          return batch.commit()
        },
        'Could not save the new set list order'
      )
    },
    setCurrentUser() {
      return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async user => {
          unsubscribe()

          if (user == null) {
            this.authedUser = { uid: null, email: null }
            this.isAdmin = false
            resolve(false)
            return
          }

          this.authedUser = {
            uid: user.uid,
            email: user.email
          }
          // The rules let a signed-in user read their own /admins doc and
          // nothing else, so this is the client's copy of the same check the
          // rules make. It gates the UI; the rules gate the data.
          try {
            const adminDoc = await getDoc(doc(db, 'admins', user.uid))
            this.isAdmin = adminDoc.exists()
          } catch {
            this.isAdmin = false
          }
          resolve(user)
        }, reject)
      })
    }
  },
  getters: {
    getLyric: (state) => {
      return (id) => state.lyrics.find(l => l.id === id)
    },
    // filter() already returns a new array, so sorting it in place is safe.
    activeLyrics: (state) =>
      state.lyrics
        .filter(l => l.enabled)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    // A falsy test rather than enabled === false, so songs imported without the
    // field still appear in the library instead of vanishing from both lists.
    inactiveLyrics: (state) =>
      state.lyrics
        .filter(l => !l.enabled)
        .sort(byArtistThenSong),
    filteredLyrics: (state) => {
      const artist = state.search.artist.toLowerCase()
      const song = state.search.song.toLowerCase()

      if (artist === '' && song === '') {
        return state.inactiveLyrics
      }

      return state.inactiveLyrics.filter(l =>
        (artist === '' || (l.artist ?? '').toLowerCase().includes(artist)) &&
        (song === '' || (l.song ?? '').toLowerCase().includes(song))
      )
    },
  }
})
