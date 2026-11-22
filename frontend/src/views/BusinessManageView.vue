<script setup>
import { reactive, ref, onMounted } from 'vue';
import { api } from '../api';
import { useToast } from '../stores/toast';
import { imgUrl, estadoLabel, estadoColor } from '../utils';
import MapView from '../components/MapView.vue';

const toast = useToast();
const items = ref([]);
const editId = ref(null);
const f = reactive({ nombre: '', categoria: '', descripcion: '', municipio: '', lat: 4.9, lng: -74.0, contacto: '' });
const error = ref('');

async function load() { items.value = await api('/negocios/mios'); }
onMounted(() => load().catch((e) => toast.error(e.message)));

function editar(n) { editId.value = n.id_negocio; Object.assign(f, { nombre: n.nombre, categoria: n.categoria, descripcion: n.descripcion, municipio: n.municipio, lat: n.lat, lng: n.lng, contacto: n.contacto || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function nuevo() { editId.value = null; Object.assign(f, { nombre: '', categoria: '', descripcion: '', municipio: '', lat: 4.9, lng: -74.0, contacto: '' }); }
async function guardar() {
  error.value = '';
  try {
    if (editId.value) await api(`/negocios/${editId.value}`, { method: 'PUT', body: { ...f } });
    else await api('/negocios', { method: 'POST', body: { ...f } });
    toast.ok('Negocio enviado a moderación');
    nuevo();
    load();
  } catch (e) { error.value = e.message; }
}
async function subir(n) {
  const input = document.getElementById(`file-${n.id_negocio}`);
  const files = input && input.files;
  if (!files || !files.length) return toast.error('Selecciona al menos una imagen');
  const form = new FormData();
  for (const file of files) form.append('imagenes', file);
  try { await api(`/negocios/${n.id_negocio}/imagenes`, { method: 'POST', form }); toast.ok('Imágenes cargadas'); load(); } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <h1>Mi negocio local</h1>
  <p class="muted">Tu negocio será visible en la sección de comercio local una vez sea aprobado por un administrador.</p>
  <form class="card stack" @submit.prevent="guardar">
    <h2>{{ editId ? 'Editar negocio' : 'Registrar negocio' }}</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <label class="field">Nombre<input v-model="f.nombre" required /></label>
      <label class="field">Categoría<input v-model="f.categoria" required placeholder="Artesanías, restaurante, tienda…" /></label>
      <label class="field">Municipio<input v-model="f.municipio" required /></label>
      <label class="field">Contacto<input v-model="f.contacto" placeholder="Teléfono o correo" /></label>
    </div>
    <label class="field">Descripción<textarea v-model="f.descripcion" required minlength="10" maxlength="2000"></textarea></label>
    <div>
      <div class="small muted" style="margin-bottom:6px">Haz clic en el mapa para marcar la ubicación ({{ f.lat }}, {{ f.lng }})</div>
      <MapView :markers="[{ lat: Number(f.lat), lng: Number(f.lng), title: f.nombre || 'Mi negocio' }]" :center="[Number(f.lat), Number(f.lng)]" :zoom="10" height="240px" pickable @pick="(p) => { f.lat = p.lat; f.lng = p.lng; }" />
    </div>
    <div v-if="error" class="error-box">{{ error }}</div>
    <div class="row"><button class="btn">{{ editId ? 'Guardar y reenviar' : 'Registrar negocio' }}</button><button v-if="editId" type="button" class="btn outline" @click="nuevo">Cancelar edición</button></div>
  </form>

  <h2 style="margin-top:20px">Mis negocios</h2>
  <div v-if="!items.length" class="card flat">Aún no has registrado negocios.</div>
  <div class="stack">
    <div v-for="n in items" :key="n.id_negocio" class="card">
      <div class="row" style="align-items:flex-start">
        <img v-if="n.imagen_principal" :src="imgUrl(n.imagen_principal)" :alt="n.nombre" style="width:110px;height:80px;object-fit:cover;border-radius:8px" />
        <div class="grow">
          <div class="row between"><b>{{ n.nombre }}</b><span class="chip" :class="estadoColor(n.estado)">{{ estadoLabel(n.estado) }}</span></div>
          <div class="muted small">{{ n.categoria }} · {{ n.municipio }}</div>
          <div v-if="n.estado === 'rechazado' && n.motivo_rechazo" class="error-box small" style="margin-top:6px">Motivo: {{ n.motivo_rechazo }}</div>
          <div class="row" style="margin-top:8px">
            <button class="btn small outline" @click="editar(n)">Editar</button>
            <input :id="`file-${n.id_negocio}`" type="file" accept="image/jpeg,image/png,image/webp" multiple />
            <button class="btn small" @click="subir(n)">Subir fotos</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
