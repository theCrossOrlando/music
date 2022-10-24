import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createPiniaFirestore } from "pinia-firestore"
import { library } from '@fortawesome/fontawesome-svg-core'
import { faEllipsis, faUser, faMusic } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

library.add(faEllipsis)
library.add(faUser)
library.add(faMusic)

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

app
  .component('font-awesome-icon', FontAwesomeIcon)
  .mount('#app')
