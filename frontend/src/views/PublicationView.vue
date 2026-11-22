<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { useAuth } from '../stores/auth';
import { useToast } from '../stores/toast';
import { money, fdate, imgUrl, today, addDays, nights } from '../utils';
import MapView from '../components/MapView.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const toast = useToast();

const pub = ref(null);
const resenas = ref([]);
const disp = ref([]);
const error = ref('');
const loading = ref(true);
const foto = ref(0);
const enviando = ref(false);
const f = reactive({ fecha_inicio: '', fecha_fin: '', num_personas: 1 });

async function load() {
  loading.value = true;
  try {
    const id = route.params.id;
    pub.value = await api(`/publicaciones/${id}`);
    resenas.value = await api(`/publicaciones/${id}/resenas`);
    disp.value = await api(`/publicaciones/${id}/disponibilidad`, { query: { desde: today(), hasta: addDays(today(), 28) } });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => route.params.id, load);

const esAloj = computed(() => pub.value && pub.value.tipo === 'alojamiento');
const total = computed(() => {
  if (!pub.value) return 0;
  if (esAloj.value) {
    const n = f.fecha_inicio && f.fecha_fin ? nights(f.fecha_inicio, f.fecha_fin) : 0;
    return n > 0 ? n * pub.value.precio_base : 0;
  }
  return f.fecha_inicio ? f.num_personas * pub.value.precio_base : 0;
});
const dias = computed(() => {
  const map = new Map(disp.value.map((d) => [d.fecha, d]));
  return Array.from({ length: 28 }, (_, i) => {
    const fecha = addDays(today(), i);
    const d = map.get(fecha);
    const libre = d && !d.bloqueado && d.cupos_disponibles > 0;
    return { fecha, n: Number(fecha.slice(8)), libre, bloqueado: d && d.bloqueado };
  });
});

function elegirDia(d) {
  if (!d.libre) return;
  if (!esAloj.value || !f.fecha_inicio || f.fecha_fin) { f.fecha_inicio = d.fecha; f.fecha_fin = ''; return; }
  if (d.fecha > f.fecha_inicio) f.fecha_fin = d.fecha; else f.fecha_inicio = d.fecha;
}

async function reservar() {
  if (!auth.token) return router.push({ name: 'login', query: { redirect: route.fullPath } });
  if (auth.rol !== 'turista') return toast.error('Para reservar debes ingresar con una cuenta de turista.');
  if (!f.fecha_inicio || (esAloj.value && !f.fecha_fin)) return toast.error('Selecciona las fechas de tu reserva.');
  enviando.value = true;
  try {
    const body = { id_publicacion: pub.value.id_publicacion, fecha_inicio: f.fecha_inicio, num_personas: f.num_personas };
    if (esAloj.value) body.fecha_fin = f.fecha_fin;
    const r = await api('/reservas', { method: 'POST', body });
    toast.ok('Reserva creada. Completa el pago para confirmarla.');
    router.push(`/reservas/${r.id_reserva}/pago`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    enviando.value = false;
  }
}
async function reportar(r) {
  if (!auth.token) return router.push({ name: 'login', query: { redirect: route.fullPath } });
  try { const x = await api(`/resenas/${r.id_resena}/reportar`, { method: 'POST' }); toast.ok(x.mensaje); resenas.value = resenas.value.filter((y) => y.id_resena !== r.id_resena); } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div v-if="loading" class="spinner">Cargando…</div>
  <div v-else-if="error" class="error-box">{{ error }} <router-link to="/">Volver al inicio</router-link></div>
  <div v-else class="grid sidebar" style="align-items:start">
    <div class="stack">
      <div class="gallery">
        <img v-if="pub.imagenes.length" class="main" :src="imgUrl(pub.imagenes[foto])" :alt="pub.titulo" />
        <div v-else class="main"></div>
        <div v-if="pub.imagenes.length > 1" class="thumbs">
          <img v-for="(im, i) in pub.imagenes" :key="im" :src="imgUrl(im)" :class="{ active: i === foto }" :alt="`Foto ${i + 1}`" @click="foto = i" />
        </div>
      </div>
      <div>
        <div class="row">
          <span class="chip">{{ esAloj ? 'Alojamiento' : 'Actividad' }}</span>
          <span v-if="pub.estado !== 'publicada'" class="chip amber">Vista previa ({{ pub.estado }})</span>
          <span v-if="pub.num_resenas" class="stars">★ {{ Number(pub.promedio).toFixed(1) }} <span class="muted small">({{ pub.num_resenas }} reseñas)</span></span>
        </div>
        <h1 style="margin-top:8px">{{ pub.titulo }}</h1>
        <div class="muted">{{ pub.municipio }} · Anfitrión: {{ pub.anfitrion_nombre }}</div>
      </div>
      <p style="white-space:pre-line">{{ pub.descripcion }}</p>
      <div class="card flat">
        <h3>Detalles</h3>
        <ul v-if="esAloj" style="margin:0;padding-left:18px">
          <li>{{ pub.num_habitaciones }} habitación(es) · capacidad para {{ pub.capacidad }} personas</li>
          <li v-if="pub.servicios && pub.servicios.length">Servicios: {{ pub.servicios.join(', ') }}</li>
        </ul>
        <ul v-else style="margin:0;padding-left:18px">
          <li>Duración: {{ pub.duracion_horas }} horas · dificultad {{ pub.dificultad }}</li>
          <li>Cupo máximo: {{ pub.capacidad }} personas</li>
          <li>Punto de encuentro: {{ pub.punto_encuentro }}</li>
        </ul>
      </div>
      <MapView :markers="[{ lat: pub.lat, lng: pub.lng, title: pub.titulo, sub: pub.municipio }]" height="260px" :zoom="13" />
      <div>
        <h2>Reseñas</h2>
        <p v-if="!resenas.length" class="muted">Aún no hay reseñas.</p>
        <div v-for="r in resenas" :key="r.id_resena" class="card flat" style="margin-bottom:8px">
          <div class="row between"><b>{{ r.autor }}</b><span class="stars">{{ '★'.repeat(r.calificacion) }}<span class="muted">{{ '★'.repeat(5 - r.calificacion) }}</span></span></div>
          <p style="margin:6px 0">{{ r.comentario }}</p>
          <div class="row between small muted"><span>{{ fdate(r.fecha) }}</span><a href="#" @click.prevent="reportar(r)">Reportar</a></div>
        </div>
      </div>
    </div>

    <aside class="card stack" style="position:sticky;top:76px">
      <div><b style="font-size:1.4rem">{{ money(pub.precio_base) }}</b> <span class="muted">/ {{ esAloj ? 'noche' : 'persona' }}</span></div>
      <div>
        <div class="small muted" style="margin-bottom:6px">Disponibilidad (próximos 28 días)</div>
        <div class="days">
          <div v-for="d in dias" :key="d.fecha" class="day" :class="{ ok: d.libre, blocked: d.bloqueado, sel: d.fecha === f.fecha_inicio || d.fecha === f.fecha_fin }"
            :title="d.libre ? 'Disponible' : 'No disponible'" @click="elegirDia(d)">{{ d.n }}</div>
        </div>
      </div>
      <label class="field">{{ esAloj ? 'Llegada' : 'Fecha' }}<input v-model="f.fecha_inicio" type="date" :min="today()" /></label>
      <label v-if="esAloj" class="field">Salida<input v-model="f.fecha_fin" type="date" :min="f.fecha_inicio || today()" /></label>
      <label class="field">Personas (máx. {{ pub.capacidad }})<input v-model.number="f.num_personas" type="number" min="1" :max="pub.capacidad" /></label>
      <div class="row between"><span>Total estimado</span><b>{{ money(total) }}</b></div>
      <button class="btn block" :disabled="enviando || pub.estado !== 'publicada'" @click="reservar">{{ enviando ? 'Reservando…' : 'Reservar' }}</button>
      <p class="muted small" style="margin:0">Tu cupo se retiene unos minutos mientras completas el pago.</p>
    </aside>
  </div>
</template>
