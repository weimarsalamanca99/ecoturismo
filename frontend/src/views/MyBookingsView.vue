<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api';
import { useToast } from '../stores/toast';
import { money, fdate, imgUrl, estadoLabel, estadoColor } from '../utils';

const toast = useToast();
const items = ref([]);
const loading = ref(true);
const review = reactive({ id: null, calificacion: 5, comentario: '' });

async function load() {
  loading.value = true;
  try { items.value = await api('/reservas/mias'); } catch (e) { toast.error(e.message); } finally { loading.value = false; }
}
onMounted(load);

const venceActivo = (r) => r.estado === 'pendiente_pago' && r.expira_en && new Date(r.expira_en) > new Date();
async function cancelar(r) {
  if (!confirm('¿Cancelar esta reserva? Si ya la pagaste, el reembolso depende de la política (total con 48 horas o más de anticipación).')) return;
  try {
    const x = await api(`/reservas/${r.id_reserva}/cancelar`, { method: 'POST' });
    toast.ok(x.reembolso ? `Reserva cancelada. Reembolso (simulado): ${money(x.monto_reembolsado)}` : 'Reserva cancelada');
    load();
  } catch (e) { toast.error(e.message); }
}
function abrirResena(r) { review.id = r.id_reserva; review.calificacion = 5; review.comentario = ''; }
async function enviarResena() {
  try {
    await api('/resenas', { method: 'POST', body: { id_reserva: review.id, calificacion: review.calificacion, comentario: review.comentario } });
    toast.ok('¡Gracias por tu reseña!');
    review.id = null;
    load();
  } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <h1>Mis reservas</h1>
  <div v-if="loading" class="spinner">Cargando…</div>
  <div v-else-if="!items.length" class="card flat">Aún no tienes reservas. <router-link to="/">Explora experiencias</router-link></div>
  <div v-else class="stack">
    <div v-for="r in items" :key="r.id_reserva" class="card">
      <div class="row" style="align-items:flex-start">
        <img v-if="r.imagen_principal" :src="imgUrl(r.imagen_principal)" :alt="r.titulo" style="width:110px;height:80px;object-fit:cover;border-radius:8px" loading="lazy" />
        <div class="grow">
          <div class="row between">
            <router-link :to="`/publicaciones/${r.id_publicacion}`"><b>{{ r.titulo }}</b></router-link>
            <span class="chip" :class="estadoColor(r.estado)">{{ estadoLabel(r.estado) }}</span>
          </div>
          <div class="muted small">{{ r.municipio }} · {{ fdate(r.fecha_inicio) }}<template v-if="r.tipo === 'alojamiento'"> → {{ fdate(r.fecha_fin) }}</template> · {{ r.num_personas }} persona(s)</div>
          <div><b>{{ money(r.total) }}</b></div>
          <div class="row" style="margin-top:8px">
            <router-link v-if="venceActivo(r)" class="btn small" :to="`/reservas/${r.id_reserva}/pago`">Pagar</router-link>
            <button v-if="['pendiente_pago', 'confirmada'].includes(r.estado)" class="btn small outline" @click="cancelar(r)">Cancelar</button>
            <button v-if="r.puede_resenar" class="btn small accent" @click="abrirResena(r)">Dejar reseña</button>
            <span v-if="r.tiene_resena" class="muted small">Ya reseñaste esta experiencia</span>
          </div>
        </div>
      </div>
      <form v-if="review.id === r.id_reserva" class="stack" style="margin-top:12px" @submit.prevent="enviarResena">
        <label class="field">Calificación
          <select v-model.number="review.calificacion"><option v-for="n in [5, 4, 3, 2, 1]" :key="n" :value="n">{{ n }} {{ '★'.repeat(n) }}</option></select>
        </label>
        <label class="field">Comentario<textarea v-model="review.comentario" maxlength="1000"></textarea></label>
        <div class="row"><button class="btn small">Publicar reseña</button><button type="button" class="btn small outline" @click="review.id = null">Cancelar</button></div>
      </form>
    </div>
  </div>
</template>
