<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';
import { useToast } from '../stores/toast';

const toast = useToast();
const q = ref({ publicaciones: [], negocios: [], resenas: [] });
const loading = ref(true);

async function load() {
  loading.value = true;
  try { q.value = await api('/admin/moderacion'); } catch (e) { toast.error(e.message); } finally { loading.value = false; }
}
onMounted(load);

async function decidir(tipo, id, accion) {
  let motivo = '';
  if (accion !== 'aprobar') {
    motivo = prompt('Indica el motivo (se enviará al usuario):') || '';
    if (!motivo.trim()) return;
  }
  try { await api(`/admin/moderacion/${tipo}/${id}`, { method: 'PATCH', body: { accion, motivo } }); toast.ok('Decisión registrada'); load(); } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div class="row between"><h1>Moderación de contenido</h1><router-link class="btn small outline" to="/admin">Volver al panel</router-link></div>
  <div v-if="loading" class="spinner">Cargando…</div>
  <template v-else>
    <h2>Publicaciones pendientes ({{ q.publicaciones.length }})</h2>
    <p v-if="!q.publicaciones.length" class="muted">No hay publicaciones por revisar.</p>
    <div class="stack">
      <div v-for="p in q.publicaciones" :key="p.id_publicacion" class="card row between">
        <div><b>{{ p.titulo }}</b><div class="muted small">{{ p.tipo }} · {{ p.municipio }} · {{ p.anfitrion }} · {{ p.num_imagenes }} foto(s)</div>
          <router-link class="small" :to="`/publicaciones/${p.id_publicacion}`" target="_blank">Ver vista previa</router-link></div>
        <div class="row"><button class="btn small" @click="decidir('publicacion', p.id_publicacion, 'aprobar')">Aprobar</button><button class="btn small danger" @click="decidir('publicacion', p.id_publicacion, 'rechazar')">Rechazar</button></div>
      </div>
    </div>

    <h2 style="margin-top:20px">Negocios locales pendientes ({{ q.negocios.length }})</h2>
    <p v-if="!q.negocios.length" class="muted">No hay negocios por revisar.</p>
    <div class="stack">
      <div v-for="n in q.negocios" :key="n.id_negocio" class="card row between">
        <div><b>{{ n.nombre }}</b><div class="muted small">{{ n.categoria }} · {{ n.municipio }} · {{ n.responsable }}</div><div class="small">{{ n.descripcion }}</div></div>
        <div class="row"><button class="btn small" @click="decidir('negocio', n.id_negocio, 'aprobar')">Aprobar</button><button class="btn small danger" @click="decidir('negocio', n.id_negocio, 'rechazar')">Rechazar</button></div>
      </div>
    </div>

    <h2 style="margin-top:20px">Reseñas reportadas ({{ q.resenas.length }})</h2>
    <p v-if="!q.resenas.length" class="muted">No hay reseñas reportadas.</p>
    <div class="stack">
      <div v-for="r in q.resenas" :key="r.id_resena" class="card row between">
        <div><b>{{ r.titulo }}</b> <span class="stars">{{ '★'.repeat(r.calificacion) }}</span><div class="small">{{ r.comentario }}</div></div>
        <div class="row"><button class="btn small" @click="decidir('resena', r.id_resena, 'aprobar')">Mantener</button><button class="btn small danger" @click="decidir('resena', r.id_resena, 'retirar')">Retirar</button></div>
      </div>
    </div>
  </template>
</template>
