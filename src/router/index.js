import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import ProviderDetailView from '../views/ProviderDetailView.vue';

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
    }
  ]
});

export default router;
