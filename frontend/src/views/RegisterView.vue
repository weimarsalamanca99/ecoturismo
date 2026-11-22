<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useToast } from '../stores/toast';

const router = useRouter();
const toast = useToast();
const f = reactive({ nombre: '', correo: '', telefono: '', password: '', rol: 'turista', acepta_datos: false });
const error = ref('');
const loading = ref(false);

async function registrar() {
  loading.value = true;
  error.value = '';
  try {
    await api('/auth/registro', { method: 'POST', body: { ...f } });
    toast.ok('Cuenta creada. Revisa tu correo para verificarla e inicia sesión.');
    router.push('/login');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <form class="card stack" style="max-width:460px;margin:24px auto" @submit.prevent="registrar">
    <h1>Crear cuenta</h1>
    <div class="row">
      <button v-for="o in [['turista', 'Turista'], ['anfitrion', 'Anfitrión'], ['negocio', 'Negocio local']]" :key="o[0]" type="button" class="chip" :class="{ active: f.rol === o[0] }" @click="f.rol = o[0]">{{ o[1] }}</button>
    </div>
    <label class="field">Nombre completo<input v-model="f.nombre" autocomplete="name" required minlength="2" /></label>
    <label class="field">Correo electrónico<input v-model="f.correo" type="email" autocomplete="email" required /></label>
    <label class="field">Teléfono (opcional)<input v-model="f.telefono" type="tel" autocomplete="tel" /></label>
    <label class="field">Contraseña<input v-model="f.password" type="password" autocomplete="new-password" required minlength="8" />
      <span class="small muted">Mínimo 8 caracteres, una mayúscula y un número.</span></label>
    <label class="check"><input v-model="f.acepta_datos" type="checkbox" required />
      <span>Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012, para gestionar mi cuenta y mis reservas.</span></label>
    <div v-if="error" class="error-box">{{ error }}</div>
    <button class="btn block" :disabled="loading">{{ loading ? 'Creando…' : 'Registrarme' }}</button>
    <div class="small">¿Ya tienes cuenta? <router-link to="/login">Inicia sesión</router-link></div>
  </form>
</template>
