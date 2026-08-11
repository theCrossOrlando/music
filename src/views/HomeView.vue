<script setup>
import { onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import firebase from '../firebaseInit.js'
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useStore } from '@/stores/lyrics';

const auth = getAuth(firebase)
const router = useRouter()
const store = useStore()

const loggedinUser = ref(null)
const error = ref('')

const authListener = onAuthStateChanged(auth, async user => {
  loggedinUser.value = user
  // Refresh the admin check, then send admins on to the app. Non-admins stay
  // here and get told why.
  await store.setCurrentUser()
  if (store.isAdmin) router.push('/lyrics')
})

async function signIn() {
  error.value = ''
  try {
    await signInWithPopup(auth, new GoogleAuthProvider())
  } catch (e) {
    // Dismissing the popup is a normal thing to do, not a failure to report.
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      return
    }
    error.value = e.code === 'auth/popup-blocked'
      ? 'Your browser blocked the sign-in window. Allow popups for this site and try again.'
      : `Sign-in failed: ${e.message}`
  }
}

onBeforeUnmount(() => authListener())
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-4 py-12">
    <div class="w-full max-w-sm space-y-6 text-center">
      <div class="space-y-1">
        <h1 class="font-display text-3xl font-bold tracking-tight text-ink">theCross Music</h1>
        <p class="font-label text-xs uppercase tracking-wider text-ink-soft">Worship set administration</p>
      </div>

      <div v-if="error" class="rounded-md border border-red-800/25 bg-red-50 p-3 text-left text-sm text-red-800">
        {{ error }}
      </div>

      <button v-if="!loggedinUser" class="btn btn-primary w-full justify-center py-2.5" @click="signIn">
        Sign in with Google
      </button>

      <template v-else>
        <div v-if="!store.isAdmin"
          class="space-y-2 rounded-md border border-brass bg-brass-wash p-4 text-left text-sm text-ink">
          <p>
            You are signed in as <strong class="font-semibold">{{ loggedinUser.email }}</strong>, but that
            account is not set up as an administrator of this site.
          </p>
          <p>Ask an existing administrator to add you, then sign in again.</p>
        </div>
        <button class="btn w-full justify-center" @click="store.signOut()">Sign out</button>
      </template>
    </div>
  </main>
</template>
