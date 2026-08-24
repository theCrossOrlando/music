import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { library } from '@fortawesome/fontawesome-svg-core'
import { faEllipsis, faMagnifyingGlass, faPlus, faBook } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

library.add(faEllipsis)
library.add(faMagnifyingGlass)
library.add(faPlus)
library.add(faBook)

import App from './App.vue'
import router from './router'

import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app
  .component('font-awesome-icon', FontAwesomeIcon)
  .mount('#app')
