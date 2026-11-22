<script setup>
import { ref, onMounted, watch } from 'vue';
import { api } from '../api';
import { useToast } from '../stores/toast';
import { money, fdate, imgUrl, estadoLabel, estadoColor } from '../utils';

const toast = useToast();
const tab = ref('publicaciones');
const pubs = ref([]);
const reservas = ref([]);
const filtro = ref('');
const loading = ref(true);

async function loadPubs() { pubs.value = await api('/publicaciones/mias'); }
async function loadRes() { reservas.value = await api('/reservas/recibidas', { query: { estado: filtro.value } }); }
async function load() {
  loading.value = true;
  try { await Promise.all([loadPubs(), loadRes()]); } catch (e) { toast.error(e.message); } finally { loading.value = false; }
}
onMounted(load);
watch(filtro, () => loadRes().catch((e) => toast.error(e.message)));

async function accion(p, ruta, texto) {
  try { await api(`/publicaciones/${p.id_publicacion}/${ruta}`, { method: 'POST' }); toast.ok(texto); loadPubs(); } catch (e) { toast.error(e.message); }
}
async function eliminar(p) {
  if (!confirm(`¿Eliminar "${p.titulo}"?`)) return;
  try { await api(`/publicaciones/${p.id_publicacion}`, { method: 'DELETE' }); toast.ok('Publicación eliminada'); loadPubs(); } catch (e) { toast.error(e.message); }
}
async function cancelar(r) {
  if (!confirm('¿Cancelar esta reserva? El turista recibirá el reembolso completo.')) return;
  try { await api(`/reservas/${r.id_reserva}/cancelar`, { method: 'POST' }); toast.ok('Reserva cancelada'); loadRes(); } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div class="row between">
    <h1>Panel del anfitrión</h1>
    <router-link class="btn" to="/anfitrion/publicaciones/nueva">+ Nueva publicación</router-link>
  </div>
  <div class="row" style="margin:8px 0 16px">
    <button class="chip" :class="{ active: tab === 'publicaciones' }" @click="tab = 'publicaciones'">Mis publicaciones ({{ pubs.length }})</button>
    <button class="chip" :class="{ active: tab === 'reservas' }" @click="tab = 'reservas'">Reservas recibidas</button>
  </div>
  <div v-if="loading" class="spinner">Cargando…</div>

  <template v-else-if="tab === 'publicaciones'">
    <div v-if="!pubs.length" class="card flat">Aún no tienes publicaciones. Crea tu primer alojamiento o actividad para aparecer en la plataforma.</div>
    <div class="stack">
      <div v-for="p in pubs" :key="p.id_publicacion" class="card">
        <div class="row" style="align-items:flex-start">
          <img v-if="p.imagen_principal" :src="imgUrl(p.imagen_principal)" :alt="p.titulo" style="width:110px;height:80px;object-fit:cover;border-radius:8px" />
          <div class="grow">
            <div class="row between"><b>{{ p.titulo }}</b><span class="chip" :class="estadoColor(p.estado)">{{ estadoLabel(p.estado) }}</span></div>
            <div class="muted small">{{ p.tipo === 'alojamiento' ? 'Alojamiento' : 'Actividad' }} · {{ p.municipio }} · {{ money(p.precio_base) }} · {{ p.num_imagenes }} foto(s)</div>
            <div v-if="p.estado === 'rechazada' && p.motivo_rechazo" class="error-box small" style="margin-top:6px">Motivo del rechazo: {{ p.motivo_rechazo }}</div>
            <div class="row" style="margin-top:8px">
              <router-link class="btn small outline" :to="`/anfitrion/publicaciones/${p.id_publicacion}`">Editar</router-link>
              <button v-if="['borrador', 'rechazada'].includes(p.estado)" class="btn small" @click="accion(p, 'enviar', 'Enviada a moderación')">Enviar a moderación</button>
              <button v-if="p.estado === 'publicada'" class="btn small outline" @click="accion(p, 'pausar', 'Publicación pausada')">Pausar</button>
              <button v-if="p.estado === 'pausada'" class="btn small" @click="accion(p, 'reanudar', 'Publicación reanudada')">Reanudar</button>
              <router-link v-if="p.estado === 'publicada'" class="btn small outline" :to="`/publicaciones/${p.id_publicacion}`">Ver</router-link>
              <button class="btn small danger" @click="eliminar(p)">Eliminar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>

  <template v-else>
    <div class="row" style="margin-bottom:12px">
      <label class="field">Estado
        <select v-model="filtro"><option value="">Todos</option><option value="pendiente_pago">Pendiente de pago</option><option value="confirmada">Confirmada</option><option value="finalizada">Finalizada</option><option value="cancelada">Cancelada</option><option value="expirada">Expirada</option></select>
      </label>
    </div>
    <div v-if="!reservas.length" class="card flat">No hay reservas para mostrar.</div>
    <div v-else class="card table-wrap">
      <table>
        <thead><tr><th>Servicio</th><th>Fechas</th><th>Turista</th><th>Personas</th><th>Total</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in reservas" :key="r.id_reserva">
            <td>{{ r.titulo }}</td>
            <td>{{ fdate(r.fecha_inicio) }}<template v-if="r.tipo === 'alojamiento'"><br />{{ fdate(r.fecha_fin) }}</template></td>
            <td>{{ r.turista }}<div v-if="r.turista_correo" class="small muted">{{ r.turista_correo }}<br />{{ r.turista_telefono }}</div></td>
            <td>{{ r.num_personas }}</td><td>{{ money(r.total) }}</td>
            <td><span class="chip" :class="estadoColor(r.estado)">{{ estadoLabel(r.estado) }}</span></td>
            <td><button v-if="['pendiente_pago', 'confirmada'].includes(r.estado)" class="btn small outline" @click="cancelar(r)">Cancelar</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
