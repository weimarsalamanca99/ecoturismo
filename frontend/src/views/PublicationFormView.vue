<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { useToast } from '../stores/toast';
import { imgUrl, today, addDays, estadoLabel, estadoColor } from '../utils';
import MapView from '../components/MapView.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const id = computed(() => route.params.id);
const nueva = computed(() => !id.value);

const f = reactive({ tipo: 'alojamiento', titulo: '', descripcion: '', municipio: '', precio_base: '', capacidad: '', lat: 4.9, lng: -74.0, num_habitaciones: 1, servicios: '', duracion_horas: 4, dificultad: 'media', punto_encuentro: '' });
const estado = ref('borrador');
const imagenes = ref([]);
const error = ref('');
const guardando = ref(false);
const loading = ref(false);
const archivos = ref(null);
const av = reactive({ desde: addDays(today(), 1), hasta: addDays(today(), 60), cupos_totales: '', bloqueado: false });
const disp = ref([]);

async function load() {
  if (nueva.value) return;
  loading.value = true;
  try {
    const p = await api(`/publicaciones/${id.value}`);
    Object.assign(f, { tipo: p.tipo, titulo: p.titulo, descripcion: p.descripcion, municipio: p.municipio, precio_base: p.precio_base, capacidad: p.capacidad, lat: p.lat, lng: p.lng,
      num_habitaciones: p.num_habitaciones || 1, servicios: (p.servicios || []).join(', '), duracion_horas: p.duracion_horas || 4, dificultad: p.dificultad || 'media', punto_encuentro: p.punto_encuentro || '' });
    estado.value = p.estado;
    imagenes.value = p.imagenes;
    await loadDisp();
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
async function loadDisp() { disp.value = await api(`/publicaciones/${id.value}/disponibilidad`, { query: { desde: today(), hasta: addDays(today(), 56) } }); }
onMounted(load);

const payload = () => ({ ...f, servicios: f.servicios.split(',').map((s) => s.trim()).filter(Boolean) });

async function guardar() {
  guardando.value = true;
  error.value = '';
  try {
    if (nueva.value) {
      const r = await api('/publicaciones', { method: 'POST', body: payload() });
      toast.ok('Borrador creado. Ahora carga las fotos y define la disponibilidad.');
      router.replace(`/anfitrion/publicaciones/${r.id_publicacion}`);
      setTimeout(load, 50);
    } else {
      await api(`/publicaciones/${id.value}`, { method: 'PUT', body: payload() });
      toast.ok('Cambios guardados');
    }
  } catch (e) { error.value = e.message; } finally { guardando.value = false; }
}
function pick(p) { f.lat = p.lat; f.lng = p.lng; }

async function subir() {
  const files = archivos.value && archivos.value.files;
  if (!files || !files.length) return toast.error('Selecciona al menos una imagen');
  const form = new FormData();
  for (const file of files) form.append('imagenes', file);
  try { await api(`/publicaciones/${id.value}/imagenes`, { method: 'POST', form }); toast.ok('Imágenes cargadas'); archivos.value.value = ''; await load(); } catch (e) { toast.error(e.message); }
}
async function quitar(im) {
  try { await api(`/publicaciones/${id.value}/imagenes/${im}`, { method: 'DELETE' }); imagenes.value = imagenes.value.filter((x) => x !== im); } catch (e) { toast.error(e.message); }
}
async function guardarDisp() {
  try { const r = await api(`/publicaciones/${id.value}/disponibilidad`, { method: 'PUT', body: { ...av } }); toast.ok(r.mensaje); await loadDisp(); } catch (e) { toast.error(e.message); }
}
async function accion(ruta, texto) {
  try { const r = await api(`/publicaciones/${id.value}/${ruta}`, { method: 'POST' }); estado.value = r.estado; toast.ok(texto); } catch (e) { toast.error(e.message); }
}
const dias = computed(() => {
  const m = new Map(disp.value.map((d) => [d.fecha, d]));
  return Array.from({ length: 56 }, (_, i) => {
    const fecha = addDays(today(), i);
    const d = m.get(fecha);
    return { fecha, n: Number(fecha.slice(8)), d };
  });
});
const marker = computed(() => [{ lat: Number(f.lat), lng: Number(f.lng), title: f.titulo || 'Ubicación' }]);
</script>

<template>
  <div class="row between">
    <h1>{{ nueva ? 'Nueva publicación' : 'Editar publicación' }}</h1>
    <span v-if="!nueva" class="chip" :class="estadoColor(estado)">{{ estadoLabel(estado) }}</span>
  </div>
  <div v-if="loading" class="spinner">Cargando…</div>
  <div v-else class="stack">
    <form class="card stack" @submit.prevent="guardar">
      <h2>Información</h2>
      <div v-if="nueva" class="row">
        <button type="button" class="chip" :class="{ active: f.tipo === 'alojamiento' }" @click="f.tipo = 'alojamiento'">Alojamiento</button>
        <button type="button" class="chip" :class="{ active: f.tipo === 'actividad' }" @click="f.tipo = 'actividad'">Actividad</button>
      </div>
      <label class="field">Título<input v-model="f.titulo" required minlength="5" maxlength="150" /></label>
      <label class="field">Descripción<textarea v-model="f.descripcion" required minlength="20" maxlength="3000"></textarea></label>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
        <label class="field">Municipio<input v-model="f.municipio" required /></label>
        <label class="field">Precio base (COP) {{ f.tipo === 'alojamiento' ? 'por noche' : 'por persona' }}<input v-model.number="f.precio_base" type="number" min="1" required /></label>
        <label class="field">{{ f.tipo === 'alojamiento' ? 'Capacidad (personas)' : 'Cupo máximo' }}<input v-model.number="f.capacidad" type="number" min="1" required /></label>
        <template v-if="f.tipo === 'alojamiento'">
          <label class="field">Habitaciones<input v-model.number="f.num_habitaciones" type="number" min="1" required /></label>
        </template>
        <template v-else>
          <label class="field">Duración (horas)<input v-model.number="f.duracion_horas" type="number" min="0.5" step="0.5" required /></label>
          <label class="field">Dificultad<select v-model="f.dificultad"><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></label>
        </template>
      </div>
      <label v-if="f.tipo === 'alojamiento'" class="field">Servicios (separados por coma)<input v-model="f.servicios" placeholder="Wi-Fi, Desayuno, Parqueadero" /></label>
      <label v-else class="field">Punto de encuentro<input v-model="f.punto_encuentro" required /></label>
      <div>
        <div class="small muted" style="margin-bottom:6px">Ubicación: haz clic en el mapa para marcar el punto exacto ({{ f.lat }}, {{ f.lng }})</div>
        <MapView :markers="marker" :center="[Number(f.lat), Number(f.lng)]" :zoom="10" height="280px" pickable @pick="pick" />
      </div>
      <div v-if="error" class="error-box">{{ error }}</div>
      <div class="row"><button class="btn" :disabled="guardando">{{ nueva ? 'Crear borrador' : 'Guardar cambios' }}</button><router-link class="btn outline" to="/anfitrion">Volver</router-link></div>
    </form>

    <template v-if="!nueva">
      <section class="card stack">
        <h2>Fotos ({{ imagenes.length }})</h2>
        <p class="muted small" style="margin:0">Carga al menos 3 fotos (JPG, PNG o WebP, máximo 5 MB cada una) para poder enviar la publicación a moderación.</p>
        <div class="row">
          <div v-for="im in imagenes" :key="im" style="position:relative">
            <img :src="imgUrl(im)" alt="Foto de la publicación" style="width:120px;height:86px;object-fit:cover;border-radius:8px" />
            <button class="btn danger small" style="position:absolute;top:4px;right:4px;padding:0 8px;min-height:24px" aria-label="Quitar foto" @click="quitar(im)">×</button>
          </div>
        </div>
        <div class="row"><input ref="archivos" type="file" accept="image/jpeg,image/png,image/webp" multiple /><button class="btn small" @click="subir">Subir fotos</button></div>
      </section>

      <section class="card stack">
        <h2>Disponibilidad</h2>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
          <label class="field">Desde<input v-model="av.desde" type="date" :min="today()" /></label>
          <label class="field">Hasta (inclusive)<input v-model="av.hasta" type="date" :min="av.desde" /></label>
          <label class="field">{{ f.tipo === 'alojamiento' ? 'Unidades disponibles' : 'Cupos por día' }}<input v-model="av.cupos_totales" type="number" min="0" :placeholder="f.tipo === 'alojamiento' ? '1' : String(f.capacidad)" /></label>
        </div>
        <label class="check"><input v-model="av.bloqueado" type="checkbox" /> Bloquear estas fechas (no se podrán reservar)</label>
        <div><button class="btn small" @click="guardarDisp">Aplicar al calendario</button></div>
        <div class="days">
          <div v-for="d in dias" :key="d.fecha" class="day" :class="{ ok: d.d && !d.d.bloqueado && d.d.cupos_disponibles > 0, blocked: d.d && d.d.bloqueado }"
            :title="d.d ? `${d.fecha}: ${d.d.bloqueado ? 'bloqueado' : d.d.cupos_disponibles + ' de ' + d.d.cupos_totales + ' cupos'}` : `${d.fecha}: sin definir`">{{ d.n }}</div>
        </div>
        <div class="small muted">Verde: disponible · Rojo: bloqueado · Gris: sin definir o agotado</div>
      </section>

      <section class="card row">
        <button v-if="['borrador', 'rechazada'].includes(estado)" class="btn" @click="accion('enviar', 'Enviada a moderación')">Enviar a moderación</button>
        <button v-if="estado === 'publicada'" class="btn outline" @click="accion('pausar', 'Publicación pausada')">Pausar</button>
        <button v-if="estado === 'pausada'" class="btn" @click="accion('reanudar', 'Publicación reanudada')">Reanudar</button>
        <span class="muted small">Estado actual: {{ estadoLabel(estado) }}</span>
      </section>
    </template>
  </div>
</template>
