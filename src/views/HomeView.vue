<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import firebase from '../firebaseInit.js'
import { getAuth, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth';
import { auth as firebaseuiAuth } from 'firebaseui'
import "firebaseui/dist/firebaseui.css"

const auth = getAuth(firebase)

const loggedinUser = ref(null)

onMounted(() => {
  let ui = firebaseui.auth.AuthUI.getInstance()

  if (!ui) {
    ui = new firebaseuiAuth.AuthUI(getAuth(firebase))
  }

  ui.start('#firebaseui-auth-container', {
    signInOptions: [
      GoogleAuthProvider.PROVIDER_ID,
    ],
  })
})

const authListener = onAuthStateChanged(auth, user => loggedinUser.value = user)

onBeforeUnmount(() => authListener())
</script>

<template>
  <main>
    <div class="content">
      <section v-show="!loggedinUser" id="firebaseui-auth-container"></section>
      <button v-show="loggedinUser" class="button" @click="getAuth(firebase).signOut()">Logout</button>
    </div>
  </main>
</template>

<style scoped>
a {
  font-size: 80px;
  height: 100px;
  width: 100%;
}

img {
  width: 100%;
}
</style>
