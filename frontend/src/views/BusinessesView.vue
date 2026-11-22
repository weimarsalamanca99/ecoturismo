<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from '../api';
import { imgUrl } from '../utils';
import MapView from '../components/MapView.vue';

const items = ref([]);
const loading = ref(true);
const error = ref('');
onMounted(async () => {
  try { items.value = await api('/negocios'); } catch (e) { error.value = e.message; } finally { loading.value = false; }
});
const markers = computed(() => items.value.map((n) => ({ lat: n.lat, lng: n.lng, title: n.nombre, sub: `${n.categoria} · ${n.municipio}` })));
</script>

<template>
  <h1>Comercio local</h1>
  <p class="muted">Artesanos, restaurantes y emprendimientos de las comunidades que visitas.</p>
  <div v-if="loading" class="spinner">Cargando…</div>
  <div v-else-if="error" class="error-box">{{ error }}</div>
  <div v-else-if="!items.length" class="card flat">Pronto habrá negocios locales para descubrir.</div>
  <template v-else>
    <MapView :markers="markers" height="300px" />
    <div class="grid" style="margin-top:16px">
      <article v-for="n in items" :key="n.id_negocio" class="card pub-card">
        <img v-if="n.imagen_principal" class="img" :src="imgUrl(n.imagen_principal)" :alt="n.nombre" loading="lazy" />
        <div v-else class="img"></div>
        <div class="body">
          <span class="chip">{{ n.categoria }}</span>
          <h3 style="margin-top:8px">{{ n.nombre }}</h3>
          <div class="muted small">{{ n.municipio }}</div>
          <p style="margin:6px 0">{{ n.descripcion }}</p>
          <div v-if="n.contacto" class="small"><b>Contacto:</b> {{ n.contacto }}</div>
        </div>
      </article>
    </div>
  </template>
</template>
