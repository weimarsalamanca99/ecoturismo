<script setup>
import { money, imgUrl } from '../utils';
defineProps({ pub: { type: Object, required: true } });
</script>

<template>
  <router-link :to="`/publicaciones/${pub.id_publicacion}`" class="card pub-card">
    <img v-if="pub.imagen_principal" class="img" :src="imgUrl(pub.imagen_principal)" :alt="pub.titulo" loading="lazy" />
    <div v-else class="img"></div>
    <div class="body">
      <div class="row between">
        <span class="chip">{{ pub.tipo === 'alojamiento' ? 'Alojamiento' : 'Actividad' }}</span>
        <span v-if="pub.num_resenas" class="stars">★ {{ Number(pub.promedio).toFixed(1) }} <span class="muted small">({{ pub.num_resenas }})</span></span>
        <span v-else class="muted small">Nuevo</span>
      </div>
      <h3 style="margin-top:8px">{{ pub.titulo }}</h3>
      <div class="muted small">{{ pub.municipio }}<template v-if="pub.distancia_km !== undefined"> · a {{ pub.distancia_km }} km</template></div>
      <div style="margin-top:6px"><b>{{ money(pub.precio_base) }}</b> <span class="muted small">/ {{ pub.tipo === 'alojamiento' ? 'noche' : 'persona' }}</span></div>
    </div>
  </router-link>
</template>
