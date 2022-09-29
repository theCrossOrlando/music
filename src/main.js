import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createPiniaFirestore } from "pinia-firestore"

import App from './App.vue'
import router from './router'

import './assets/main.css'
import './assets/main.scss'

const app = createApp(App)
const pinia = createPinia()
const piniaFirestore = createPiniaFirestore()

app.use(pinia)
app.use(piniaFirestore)
app.use(router)

app.mount('#app')
