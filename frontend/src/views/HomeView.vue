<script setup>
import { reactive, ref, watch, onMounted, computed } from 'vue';
import { api } from '../api';
import { useToast } from '../stores/toast';
import PubCard from '../components/PubCard.vue';
import MapView from '../components/MapView.vue';

const toast = useToast();
const f = reactive({ q: '', tipo: '', precio_max: '', desde: '', hasta: '', personas: 1, calificacion_min: '', orden: 'relevancia', lat: '', lng: '', radio_km: 50 });
const datos = ref([]);
const total = ref(0);
const pagina = ref(1);
const loading = ref(false);
const error = ref('');
const vista = ref('lista');
const filtros = ref(false);
const limite = computed(() => (vista.value === 'mapa' ? 50 : 12));
const paginas = computed(() => Math.max(1, Math.ceil(total.value / limite.value)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await api('/publicaciones', { query: { ...f, pagina: pagina.value, limite: limite.value } });
    datos.value = r.datos;
    total.value = r.total;
  } catch (e) {
    error.value = e.message;
    datos.value = [];
  } finally {
    loading.value = false;
  }
}
let t = null;
watch([f, vista], () => { clearTimeout(t); t = setTimeout(() => { pagina.value = 1; load(); }, 350); }, { deep: true });
onMounted(load);

function cerca() {
  if (!navigator.geolocation) return toast.error('Tu navegador no permite obtener la ubicación');
  navigator.geolocation.getCurrentPosition(
    (p) => { f.lat = +p.coords.latitude.toFixed(5); f.lng = +p.coords.longitude.toFixed(5); f.orden = 'cercania'; },
    () => toast.error('No pudimos obtener tu ubicación. Revisa los permisos del navegador.'),
  );
}
function limpiar() {
  Object.assign(f, { q: '', tipo: '', precio_max: '', desde: '', hasta: '', personas: 1, calificacion_min: '', orden: 'relevancia', lat: '', lng: '', radio_km: 50 });
}
function ir(n) { pagina.value = n; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
const markers = computed(() => datos.value.map((p) => ({ lat: p.lat, lng: p.lng, title: p.titulo, sub: p.municipio, to: `/publicaciones/${p.id_publicacion}` })));
</script>

<template>
  <section class="hero">
    <h1>Descubre experiencias de ecoturismo</h1>
    <p style="margin:0 0 12px">Hospedajes rurales, actividades de naturaleza y comercio local en un solo lugar.</p>
    <input v-model="f.q" class="input" type="search" placeholder="¿A dónde quieres ir? (municipio, finca, actividad...)" aria-label="Buscar" />
  </section>

  <div class="row" style="margin-bottom:12px">
    <button class="chip" :class="{ active: f.tipo === '' }" @click="f.tipo = ''">Todo</button>
    <button class="chip" :class="{ active: f.tipo === 'alojamiento' }" @click="f.tipo = 'alojamiento'">Alojamientos</button>
    <button class="chip" :class="{ active: f.tipo === 'actividad' }" @click="f.tipo = 'actividad'">Actividades</button>
    <button class="chip" @click="filtros = !filtros">{{ filtros ? 'Ocultar filtros' : 'Más filtros' }}</button>
    <button class="chip" :class="{ active: f.lat !== '' }" @click="cerca">📍 Cerca de mí</button>
    <span class="grow"></span>
    <button class="chip" :class="{ active: vista === 'lista' }" @click="vista = 'lista'">Lista</button>
    <button class="chip" :class="{ active: vista === 'mapa' }" @click="vista = 'mapa'">Mapa</button>
  </div>

  <div v-if="filtros" class="card flat stack" style="margin-bottom:16px">
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <label class="field">Desde<input v-model="f.desde" type="date" /></label>
      <label class="field">Hasta<input v-model="f.hasta" type="date" :min="f.desde" /></label>
      <label class="field">Personas<input v-model.number="f.personas" type="number" min="1" /></label>
      <label class="field">Precio máximo (COP)<input v-model="f.precio_max" type="number" min="0" step="10000" /></label>
      <label class="field">Calificación mínima
        <select v-model="f.calificacion_min"><option value="">Cualquiera</option><option value="3">3 o más</option><option value="4">4 o más</option><option value="4.5">4,5 o más</option></select>
      </label>
      <label class="field">Ordenar por
        <select v-model="f.orden">
          <option value="relevancia">Relevancia</option><option value="precio_asc">Precio: menor a mayor</option>
          <option value="precio_desc">Precio: mayor a menor</option><option value="calificacion">Calificación</option>
          <option v-if="f.lat !== ''" value="cercania">Cercanía</option>
        </select>
      </label>
      <label v-if="f.lat !== ''" class="field">Radio (km)<input v-model.number="f.radio_km" type="number" min="1" max="500" /></label>
    </div>
    <button class="btn outline small" @click="limpiar">Limpiar filtros</button>
  </div>

  <div v-if="error" class="error-box">{{ error }}</div>
  <div v-else-if="loading && !datos.length" class="spinner">Buscando experiencias…</div>
  <template v-else>
    <p class="muted small">{{ total }} resultado(s)</p>
    <div v-if="!datos.length" class="card flat">No encontramos resultados con esos filtros. Prueba ampliando las fechas, el precio o el radio de búsqueda.</div>
    <MapView v-else-if="vista === 'mapa'" :markers="markers" height="460px" />
    <div v-else class="grid"><PubCard v-for="p in datos" :key="p.id_publicacion" :pub="p" /></div>
    <div v-if="vista === 'lista' && paginas > 1" class="row" style="justify-content:center;margin-top:20px">
      <button class="btn outline small" :disabled="pagina <= 1" @click="ir(pagina - 1)">Anterior</button>
      <span class="muted">Página {{ pagina }} de {{ paginas }}</span>
      <button class="btn outline small" :disabled="pagina >= paginas" @click="ir(pagina + 1)">Siguiente</button>
    </div>
  </template>
</template>
