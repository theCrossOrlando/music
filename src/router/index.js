import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LyricsView from '../views/LyricsView.vue'
import DataView from '../views/DataView.vue'
import DuplicatesView from '../views/DuplicatesView.vue'
import { useStore } from '@/stores/lyrics';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/lyrics',
      name: 'lyrics',
      component: LyricsView,
      meta: { requiresAuth: true }
    },
    {
      path: '/duplicates',
      name: 'duplicates',
      component: DuplicatesView,
      meta: { requiresAuth: true }
    },
    {
      path: '/data',
      name: 'data',
      component: DataView,
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach(async (to, from) => {
  const store = useStore();
  await store.setCurrentUser();

  // Send an admin landing on the login page straight to the app, but leave
  // them free to navigate to other authed routes (e.g. /data). The check is
  // on admin rather than merely signed-in: bouncing every signed-in user to
  // /lyrics would ping-pong a non-admin between the two redirects below.
  if (store.isAdmin && to.name === 'home') {
    return {
      path: '/lyrics'
    }
  }

  // Redirect to homepage if not an admin. The homepage explains why; the
  // Firestore rules are what actually protect the data.
  if (to.meta.requiresAuth && !store.isAdmin) {
    return {
      path: '/',
    }
  }
})

export default router
