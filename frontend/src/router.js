import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from './stores/auth';

const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/publicaciones/:id', name: 'publicacion', component: () => import('./views/PublicationView.vue') },
  { path: '/comercio-local', name: 'comercio', component: () => import('./views/BusinessesView.vue') },
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
  { path: '/registro', name: 'registro', component: () => import('./views/RegisterView.vue') },
  { path: '/recuperar', name: 'recuperar', component: () => import('./views/RecoverView.vue') },
  { path: '/restablecer', name: 'restablecer', component: () => import('./views/ResetView.vue') },
  { path: '/perfil', name: 'perfil', component: () => import('./views/ProfileView.vue'), meta: { auth: true } },
  { path: '/mis-reservas', name: 'mis-reservas', component: () => import('./views/MyBookingsView.vue'), meta: { auth: true, roles: ['turista'] } },
  { path: '/reservas/:id/pago', name: 'pago', component: () => import('./views/CheckoutView.vue'), meta: { auth: true, roles: ['turista'] } },
  { path: '/anfitrion', name: 'anfitrion', component: () => import('./views/HostDashboardView.vue'), meta: { auth: true, roles: ['anfitrion'] } },
  { path: '/anfitrion/publicaciones/nueva', name: 'nueva-publicacion', component: () => import('./views/PublicationFormView.vue'), meta: { auth: true, roles: ['anfitrion'] } },
  { path: '/anfitrion/publicaciones/:id', name: 'editar-publicacion', component: () => import('./views/PublicationFormView.vue'), meta: { auth: true, roles: ['anfitrion'] } },
  { path: '/negocio', name: 'negocio', component: () => import('./views/BusinessManageView.vue'), meta: { auth: true, roles: ['negocio'] } },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminDashboardView.vue'), meta: { auth: true, roles: ['administrador'] } },
  { path: '/admin/usuarios', name: 'admin-usuarios', component: () => import('./views/AdminUsersView.vue'), meta: { auth: true, roles: ['administrador'] } },
  { path: '/admin/moderacion', name: 'admin-moderacion', component: () => import('./views/AdminModerationView.vue'), meta: { auth: true, roles: ['administrador'] } },
  { path: '/:pathMatch(.*)*', name: 'no-encontrado', component: () => import('./views/NotFoundView.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  const auth = useAuth();
  if (to.meta.auth && !auth.token) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.roles && !to.meta.roles.includes(auth.rol)) return { name: 'home' };
  return true;
});

export default router;
