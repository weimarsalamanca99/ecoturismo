<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, download } from '../api';
import { useToast } from '../stores/toast';
import { money, fdate, today, addDays } from '../utils';

const toast = useToast();
const r = ref(null);
const log = ref([]);
const rep = reactive({ tipo: 'reservas', desde: addDays(today(), -30), hasta: today() });
const reporte = ref(null);

onMounted(async () => {
  try { r.value = await api('/admin/resumen'); log.value = await api('/admin/auditoria'); } catch (e) { toast.error(e.message); }
});
const max = computed(() => (r.value ? Math.max(1, ...r.value.reservas_por_mes.map((m) => m.reservas)) : 1));
async function ver() { try { reporte.value = await api('/admin/reportes', { query: { ...rep } }); } catch (e) { toast.error(e.message); } }
async function csv() {
  try { await download('/admin/reportes', { ...rep, formato: 'csv' }, `reporte_${rep.tipo}_${rep.desde}_${rep.hasta}.csv`); } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div class="row between"><h1>Panel de administración</h1>
    <div class="row"><router-link class="btn small outline" to="/admin/usuarios">Usuarios</router-link><router-link class="btn small outline" to="/admin/moderacion">Moderación</router-link></div>
  </div>
  <div v-if="!r" class="spinner">Cargando…</div>
  <template v-else>
    <div class="kpis">
      <div class="kpi">Reservas del mes<b>{{ r.reservas_mes }}</b></div>
      <div class="kpi">Ingresos del mes<b>{{ money(r.ingresos_mes) }}</b></div>
      <div class="kpi">Comisiones del mes<b>{{ money(r.comisiones_mes) }}</b></div>
      <div class="kpi">Usuarios activos<b>{{ r.usuarios_activos }}</b></div>
      <div class="kpi">Por moderar<b>{{ r.publicaciones_pendientes + r.negocios_pendientes + r.resenas_reportadas }}</b></div>
    </div>

    <div class="grid two" style="margin-top:16px">
      <section class="card">
        <h2>Reservas por mes</h2>
        <p v-if="!r.reservas_por_mes.length" class="muted">Sin datos todavía.</p>
        <div v-else class="bars" style="margin-bottom:24px">
          <div v-for="m in r.reservas_por_mes" :key="m.mes" class="bar" :style="{ height: (m.reservas / max * 100) + '%' }"><span>{{ m.reservas }}</span><small>{{ m.mes.slice(2) }}</small></div>
        </div>
      </section>
      <section class="card stack">
        <h2>Reportes</h2>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
          <label class="field">Tipo<select v-model="rep.tipo"><option value="reservas">Reservas</option><option value="ingresos">Ingresos y comisiones</option><option value="usuarios">Usuarios</option></select></label>
          <label class="field">Desde<input v-model="rep.desde" type="date" /></label>
          <label class="field">Hasta<input v-model="rep.hasta" type="date" /></label>
        </div>
        <div class="row"><button class="btn small" @click="ver">Ver en pantalla</button><button class="btn small outline" @click="csv">Descargar CSV</button></div>
        <div v-if="reporte" class="small muted">{{ reporte.filas }} fila(s) entre {{ reporte.desde }} y {{ reporte.hasta }}</div>
      </section>
    </div>

    <section v-if="reporte && reporte.datos.length" class="card table-wrap" style="margin-top:16px">
      <table>
        <thead><tr><th v-for="k in Object.keys(reporte.datos[0])" :key="k">{{ k.replace('_', ' ') }}</th></tr></thead>
        <tbody><tr v-for="(row, i) in reporte.datos.slice(0, 50)" :key="i"><td v-for="k in Object.keys(row)" :key="k">{{ row[k] }}</td></tr></tbody>
      </table>
      <p v-if="reporte.datos.length > 50" class="muted small">Mostrando 50 de {{ reporte.datos.length }}. Descarga el CSV para ver todo.</p>
    </section>

    <section class="card table-wrap" style="margin-top:16px">
      <h2>Auditoría reciente</h2>
      <p v-if="!log.length" class="muted">Sin acciones registradas.</p>
      <table v-else>
        <thead><tr><th>Fecha</th><th>Administrador</th><th>Acción</th><th>Entidad</th></tr></thead>
        <tbody><tr v-for="a in log.slice(0, 15)" :key="a.id_log"><td>{{ fdate(a.fecha) }}</td><td>{{ a.admin }}</td><td>{{ a.accion }}</td><td>{{ a.entidad }} #{{ a.id_entidad }}</td></tr></tbody>
      </table>
    </section>
  </template>
</template>
