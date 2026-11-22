<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue';
import { api } from '../api';
import { useAuth } from '../stores/auth';
import { useToast } from '../stores/toast';
import { fdate, estadoLabel, estadoColor } from '../utils';

const toast = useToast();
const auth = useAuth();
const f = reactive({ q: '', rol: '', estado: '' });
const data = ref({ datos: [], total: 0 });
const pagina = ref(1);
const paginas = computed(() => Math.max(1, Math.ceil(data.value.total / 25)));

async function load() {
  try { data.value = await api('/admin/usuarios', { query: { ...f, pagina: pagina.value } }); } catch (e) { toast.error(e.message); }
}
let t = null;
watch(f, () => { clearTimeout(t); t = setTimeout(() => { pagina.value = 1; load(); }, 300); });
function ir(n) { pagina.value = n; load(); }
onMounted(load);

async function cambiar(u, estado) {
  if (!confirm(`¿${estado === 'suspendido' ? 'Suspender' : 'Reactivar'} a ${u.nombre}?`)) return;
  try { await api(`/admin/usuarios/${u.id_usuario}/estado`, { method: 'PATCH', body: { estado } }); toast.ok('Estado actualizado'); load(); } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div class="row between"><h1>Usuarios</h1><router-link class="btn small outline" to="/admin">Volver al panel</router-link></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:12px">
    <label class="field">Buscar<input v-model="f.q" placeholder="Nombre o correo" /></label>
    <label class="field">Rol<select v-model="f.rol"><option value="">Todos</option><option value="turista">Turista</option><option value="anfitrion">Anfitrión</option><option value="negocio">Negocio</option><option value="administrador">Administrador</option></select></label>
    <label class="field">Estado<select v-model="f.estado"><option value="">Todos</option><option value="activo">Activo</option><option value="suspendido">Suspendido</option><option value="eliminado">Eliminado</option></select></label>
  </div>
  <div class="card table-wrap">
    <table>
      <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Registro</th><th></th></tr></thead>
      <tbody>
        <tr v-for="u in data.datos" :key="u.id_usuario">
          <td>{{ u.nombre }}</td><td>{{ u.correo }}</td><td>{{ u.rol }}</td>
          <td><span class="chip" :class="estadoColor(u.estado)">{{ estadoLabel(u.estado) }}</span></td><td>{{ fdate(u.creado_en) }}</td>
          <td>
            <template v-if="u.id_usuario !== auth.user?.id_usuario && u.estado !== 'eliminado'">
              <button v-if="u.estado === 'activo'" class="btn small danger" @click="cambiar(u, 'suspendido')">Suspender</button>
              <button v-else class="btn small" @click="cambiar(u, 'activo')">Reactivar</button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!data.datos.length" class="muted">No hay usuarios con esos filtros.</p>
  </div>
  <div v-if="paginas > 1" class="row" style="justify-content:center;margin-top:12px">
    <button class="btn small outline" :disabled="pagina <= 1" @click="ir(pagina - 1)">Anterior</button>
    <span class="muted">Página {{ pagina }} de {{ paginas }}</span>
    <button class="btn small outline" :disabled="pagina >= paginas" @click="ir(pagina + 1)">Siguiente</button>
  </div>
</template>
