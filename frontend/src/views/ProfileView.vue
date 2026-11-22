<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useAuth } from '../stores/auth';
import { useToast } from '../stores/toast';

const auth = useAuth();
const router = useRouter();
const toast = useToast();
const f = reactive({ nombre: '', telefono: '', descripcion: '' });
const correo = ref('');
const error = ref('');

onMounted(async () => {
  const u = await api('/usuarios/me');
  Object.assign(f, { nombre: u.nombre, telefono: u.telefono || '', descripcion: u.descripcion || '' });
  correo.value = u.correo;
});
async function guardar() {
  error.value = '';
  try { auth.user = { ...auth.user, ...(await api('/usuarios/me', { method: 'PUT', body: { ...f } })) }; toast.ok('Perfil actualizado'); } catch (e) { error.value = e.message; }
}
async function eliminar() {
  if (!confirm('Se anonimizarán tus datos personales y no podrás volver a ingresar con esta cuenta. ¿Continuar?')) return;
  try { await api('/usuarios/me', { method: 'DELETE' }); auth.logout(); toast.ok('Tu cuenta fue eliminada'); router.push('/'); } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <form class="card stack" style="max-width:520px;margin:0 auto" @submit.prevent="guardar">
    <h1>Mi perfil</h1>
    <p class="muted" style="margin:0">{{ correo }} · rol: {{ auth.rol }}</p>
    <label class="field">Nombre<input v-model="f.nombre" required minlength="2" /></label>
    <label class="field">Teléfono<input v-model="f.telefono" type="tel" /></label>
    <label class="field">Sobre mí<textarea v-model="f.descripcion" maxlength="500"></textarea></label>
    <div v-if="error" class="error-box">{{ error }}</div>
    <button class="btn">Guardar cambios</button>
    <hr style="border:0;border-top:1px solid var(--border);width:100%" />
    <div class="small muted">Derecho de supresión (Ley 1581 de 2012): puedes solicitar la eliminación de tu cuenta y de tus datos personales.</div>
    <button type="button" class="btn danger small" @click="eliminar">Eliminar mi cuenta</button>
  </form>
</template>
