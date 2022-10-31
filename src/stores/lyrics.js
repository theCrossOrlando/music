import { defineStore, storeToRefs } from 'pinia'
import firebase from '../firebaseInit.js'
import { query, collection, getFirestore, doc, updateDoc, where, writeBatch, deleteField, addDoc } from '@firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { bind } from "pinia-firestore"

const db = getFirestore(firebase)
const auth = getAuth(firebase)
const colRefLyrics = collection(db, 'lyrics')
const allLyrics = query(colRefLyrics)
const activeLyrics = query(colRefLyrics, where("enabled", "==", true))
const inActiveLyrics = query(colRefLyrics, where("enabled", "==", false))

export const useStore = defineStore('lyrics', {
  state: () => ({
    authedUser: {
      uid: null,
      email: null
    },
    lyrics: [],
    inactiveLyrics: [],
    activeLyrics: [],
    isLoading: false,
    search: {
      artist: '',
      song: '',
    }
  }),
  actions: {
    async init() {
      this.isLoading = true
      await bind(this, 'lyrics', allLyrics)
      await bind(this, 'inactiveLyrics', inActiveLyrics)
      await bind(this, 'activeLyrics', activeLyrics)
      this.inactiveLyrics.sort((a, b) => {
        if (a.artist > b.artist) return 1
        if (a.artist < b.artist) return -1
        return 0
      })
      this.isLoading = false
    },
    enable(id) {
      updateDoc(doc(db, `lyrics/${id}`), {
        enabled: true,
        order: this.activeLyrics.length
      })
    },
    disable(id) {
      updateDoc(doc(db, `lyrics/${id}`), {
        enabled: false,
        order: deleteField()
      })
    },
    async updateLyrics(data) {
      const { id, ...lyrics } = data
      if (id) {
        updateDoc(doc(db, `lyrics/${id}`), lyrics)
      }
      else {
        const docRef = await addDoc(colRefLyrics, lyrics)
        console.log("Document written with ID: ", docRef.id)
      }
    },
    async saveOrder(evt) {
      const batch = writeBatch(db)
      this.activeLyrics.map((l, i) => {
        const lyricRef = doc(db, 'lyrics', l.__id)
        batch.update(lyricRef, { order: i })
      })
      await batch.commit()
    },
    setCurrentUser() {
      return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, user => {
          if (user != null) {
            this.authedUser = {
              uid: user.uid,
              email: user.email
            }
            resolve(user);
          }
          else {
            resolve(false)
          }
          unsubscribe();
        }, reject);
      })
    }
  },
  getters: {
    getLyric: (state) => {
      return (id) => state.lyrics.find(l => l.__id == id)
    },
    filteredLyrics: (state) => {
      if (state.search.artist === '' && state.search.song === '') {
        return state.inactiveLyrics
      }

      return state.inactiveLyrics.filter(l => {
        let artistIncluded = true
        let songIncluded = true

        if (state.search.artist !== '') {
          artistIncluded = l.artist.toLowerCase().includes(state.search.artist.toLowerCase())
        }

        if (state.search.song !== '') {
          songIncluded = l.song.toLowerCase().includes(state.search.song.toLowerCase())
        }

        return artistIncluded && songIncluded
      })
    },
  }
})
