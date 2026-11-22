<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { useToast } from '../stores/toast';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const password = ref('');
const error = ref('');
async function guardar() {
  error.value = '';
  try {
    const r = await api('/auth/restablecer', { method: 'POST', body: { token: route.query.token || '', password: password.value } });
    toast.ok(r.mensaje);
    router.push('/login');
  } catch (e) { error.value = e.message; }
}
</script>

<template>
  <form class="card stack" style="max-width:420px;margin:24px auto" @submit.prevent="guardar">
    <h1>Nueva contraseña</h1>
    <label class="field">Contraseña nueva<input v-model="password" type="password" autocomplete="new-password" required minlength="8" />
      <span class="small muted">Mínimo 8 caracteres, una mayúscula y un número.</span></label>
    <div v-if="error" class="error-box">{{ error }}</div>
    <button class="btn block">Guardar contraseña</button>
  </form>
</template>
