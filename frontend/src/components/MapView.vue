<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = defineProps({
  markers: { type: Array, default: () => [] }, // { lat, lng, title, sub, to }
  center: { type: Array, default: () => [4.9, -73.9] },
  zoom: { type: Number, default: 9 },
  height: { type: String, default: '380px' },
  pickable: { type: Boolean, default: false },
});
const emit = defineEmits(['pick']);
const el = ref(null);
const router = useRouter();
let map = null;
let layer = null;

function popup(m) {
  const box = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = m.title;
  box.appendChild(b);
  if (m.sub) { box.appendChild(document.createElement('br')); box.appendChild(document.createTextNode(m.sub)); }
  if (m.to) {
    box.appendChild(document.createElement('br'));
    const a = document.createElement('a');
    a.href = m.to;
    a.textContent = 'Ver detalle';
    a.addEventListener('click', (e) => { e.preventDefault(); router.push(m.to); });
    box.appendChild(a);
  }
  return box;
}

function draw() {
  if (!map) return;
  layer.clearLayers();
  const pts = [];
  for (const m of props.markers) {
    if (typeof m.lat !== 'number' || typeof m.lng !== 'number') continue;
    const mk = L.circleMarker([m.lat, m.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#c62828', fillOpacity: 1 });
    if (m.title) mk.bindPopup(popup(m));
    mk.addTo(layer);
    pts.push([m.lat, m.lng]);
  }
  if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 13 });
  else if (pts.length === 1) map.setView(pts[0], Math.max(props.zoom, 12));
}

onMounted(() => {
  map = L.map(el.value).setView(props.center, props.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  layer = L.layerGroup().addTo(map);
  if (props.pickable) map.on('click', (e) => emit('pick', { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }));
  draw();
  setTimeout(() => { if (map) map.invalidateSize(); }, 200);
});
watch(() => props.markers, draw, { deep: true });
onBeforeUnmount(() => { if (map) { map.remove(); map = null; } });
</script>

<template>
  <div ref="el" class="map" :style="{ height }" role="application" aria-label="Mapa"></div>
</template>
