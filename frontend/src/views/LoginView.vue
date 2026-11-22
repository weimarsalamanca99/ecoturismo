<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../stores/auth';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const correo = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function entrar() {
  loading.value = true;
  error.value = '';
  try {
    const u = await auth.login(correo.value, password.value);
    const dest = route.query.redirect && String(route.query.redirect).startsWith('/') ? String(route.query.redirect)
      : { anfitrion: '/anfitrion', administrador: '/admin', negocio: '/negocio' }[u.rol] || '/';
    router.push(dest);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <form class="card stack" style="max-width:420px;margin:24px auto" @submit.prevent="entrar">
    <h1>Iniciar sesión</h1>
    <div v-if="route.query.verificado === '1'" class="ok-box">Correo verificado. Ya puedes iniciar sesión.</div>
    <div v-if="route.query.expirada" class="error-box">Tu sesión expiró. Ingresa de nuevo.</div>
    <label class="field">Correo electrónico<input v-model="correo" type="email" autocomplete="username" required /></label>
    <label class="field">Contraseña<input v-model="password" type="password" autocomplete="current-password" required /></label>
    <div v-if="error" class="error-box">{{ error }}</div>
    <button class="btn block" :disabled="loading">{{ loading ? 'Ingresando…' : 'Entrar' }}</button>
    <div class="small"><router-link to="/recuperar">¿Olvidaste tu contraseña?</router-link></div>
    <div class="small">¿No tienes cuenta? <router-link to="/registro">Regístrate</router-link></div>
  </form>
</template>
