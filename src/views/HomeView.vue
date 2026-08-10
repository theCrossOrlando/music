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
  <main>
    <div class="content">
      <div v-if="error" class="notification is-danger">{{ error }}</div>

      <button v-if="!loggedinUser" class="button is-primary is-medium" @click="signIn">
        Sign in with Google
      </button>

      <template v-else>
        <div v-if="!store.isAdmin" class="notification is-warning">
          <p>
            You are signed in as <strong>{{ loggedinUser.email }}</strong>, but that
            account is not set up as an administrator of this site.
          </p>
          <p>
            Ask an existing administrator to add you, then sign in again.
          </p>
        </div>
        <button class="button" @click="store.signOut()">Sign out</button>
      </template>
    </div>
  </main>
</template>
