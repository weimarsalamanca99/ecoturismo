<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from './stores/auth';
import { useToast } from './stores/toast';

const auth = useAuth();
const toast = useToast();
const router = useRouter();

const links = computed(() => {
  const l = [{ to: '/', text: 'Explorar' }, { to: '/comercio-local', text: 'Comercio local' }];
  if (auth.rol === 'turista') l.push({ to: '/mis-reservas', text: 'Mis reservas' });
  if (auth.rol === 'anfitrion') l.push({ to: '/anfitrion', text: 'Mi panel' });
  if (auth.rol === 'negocio') l.push({ to: '/negocio', text: 'Mi negocio' });
  if (auth.rol === 'administrador') l.push({ to: '/admin', text: 'Administración' });
  return l;
});
const bottom = computed(() => {
  const l = [{ to: '/', text: 'Explorar' }];
  if (auth.rol === 'turista') l.push({ to: '/mis-reservas', text: 'Reservas' });
  else if (auth.rol === 'anfitrion') l.push({ to: '/anfitrion', text: 'Mi panel' });
  else if (auth.rol === 'negocio') l.push({ to: '/negocio', text: 'Mi negocio' });
  else if (auth.rol === 'administrador') l.push({ to: '/admin', text: 'Admin' });
  else l.push({ to: '/comercio-local', text: 'Comercio' });
  l.push(auth.token ? { to: '/perfil', text: 'Perfil' } : { to: '/login', text: 'Ingresar' });
  return l;
});

function salir() {
  auth.logout();
  toast.ok('Sesión cerrada');
  router.push('/');
}
</script>

<template>
  <header class="appbar">
    <div class="inner">
      <router-link to="/" class="brand">🌿 Eco Turismo</router-link>
      <nav aria-label="Principal">
        <router-link v-for="l in links" :key="l.to" :to="l.to">{{ l.text }}</router-link>
      </nav>
      <div class="row" style="margin-left:auto">
        <template v-if="auth.token">
          <router-link to="/perfil" class="small">{{ auth.user?.nombre?.split(' ')[0] }}</router-link>
          <button class="btn small outline" style="color:#fff;border-color:#fff" @click="salir">Salir</button>
        </template>
        <template v-else>
          <router-link to="/login">Ingresar</router-link>
          <router-link to="/registro" class="btn small accent">Registrarse</router-link>
        </template>
      </div>
    </div>
  </header>
  <main class="container with-bottom">
    <router-view />
  </main>
  <nav class="bottom-nav" aria-label="Navegación móvil">
    <router-link v-for="l in bottom" :key="l.to" :to="l.to">{{ l.text }}</router-link>
  </nav>
  <div class="toasts" aria-live="polite">
    <div v-for="t in toast.items" :key="t.id" class="toast" :class="t.type">{{ t.text }}</div>
  </div>
</template>
