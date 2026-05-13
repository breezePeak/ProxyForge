import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import ProviderDetailView from '../views/ProviderDetailView.vue';
import ProxyView from '../views/ProxyView.vue';
import TokenStatsView from '../views/TokenStatsView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView
    },
    {
      path: '/provider/:id',
      name: 'provider-detail',
      component: ProviderDetailView
    },
    {
      path: '/proxy',
      name: 'proxy',
      component: ProxyView
    },
    {
      path: '/token-stats',
      name: 'token-stats',
      component: TokenStatsView
    }
  ]
});

export default router;
