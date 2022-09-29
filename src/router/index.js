import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LyricsView from '../views/LyricsView.vue'
import DataView from '../views/DataView.vue'
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
      path: '/data',
      name: 'data',
      component: DataView,
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach(async (to, from) => {
  const store = useStore();

  if (to.meta.requiresAuth && !await store.setCurrentUser()) {
    return {
      path: '/',
    }
  }
})

export default router
