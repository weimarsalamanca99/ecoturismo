<script setup>
import { ref } from 'vue';
import { api } from '../api';

const correo = ref('');
const msg = ref('');
const error = ref('');
async function enviar() {
  error.value = ''; msg.value = '';
  try { msg.value = (await api('/auth/recuperar', { method: 'POST', body: { correo: correo.value } })).mensaje; } catch (e) { error.value = e.message; }
}
</script>

<template>
  <form class="card stack" style="max-width:420px;margin:24px auto" @submit.prevent="enviar">
    <h1>Recuperar contraseña</h1>
    <label class="field">Correo electrónico<input v-model="correo" type="email" required /></label>
    <div v-if="msg" class="ok-box">{{ msg }}</div>
    <div v-if="error" class="error-box">{{ error }}</div>
    <button class="btn block">Enviar instrucciones</button>
    <div class="small"><router-link to="/login">Volver a iniciar sesión</router-link></div>
  </form>
</template>
