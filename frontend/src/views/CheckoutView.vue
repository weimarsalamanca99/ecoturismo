<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { useToast } from '../stores/toast';
import { money, fdate } from '../utils';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const r = ref(null);
const error = ref('');
const msg = ref('');
const enviando = ref(false);
const ahora = ref(Date.now());
const tarjeta = reactive({ numero: '', vence: '', cvv: '' });
let timer = null;

onMounted(async () => {
  try { r.value = await api(`/reservas/${route.params.id}`); } catch (e) { error.value = e.message; }
  timer = setInterval(() => { ahora.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const restante = computed(() => (r.value && r.value.expira_en ? Math.max(0, Math.floor((new Date(r.value.expira_en) - ahora.value) / 1000)) : 0));
const reloj = computed(() => `${String(Math.floor(restante.value / 60)).padStart(2, '0')}:${String(restante.value % 60).padStart(2, '0')}`);
const vencida = computed(() => r.value && r.value.estado === 'pendiente_pago' && r.value.expira_en && restante.value === 0);

function fmtNumero() { tarjeta.numero = tarjeta.numero.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); }
function fmtVence() {
  let v = tarjeta.vence.replace(/\D/g, '').slice(0, 4);
  if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
  tarjeta.vence = v;
}

async function pagar() {
  enviando.value = true;
  msg.value = '';
  try {
    const p = await api('/pagos', { method: 'POST', body: { id_reserva: r.value.id_reserva, tarjeta } });
    if (p.estado === 'aprobado') { toast.ok('¡Pago aprobado! Tu reserva está confirmada.'); router.push('/mis-reservas'); } else {
      msg.value = 'Tu pago está en proceso. Te confirmaremos la reserva en unos instantes.';
      r.value = await api(`/reservas/${route.params.id}`);
    }
  } catch (e) {
    if (e.status === 402) msg.value = 'La pasarela rechazó el pago. Verifica los datos o usa otra tarjeta.';
    else toast.error(e.message);
  } finally {
    enviando.value = false;
  }
}
async function cancelar() {
  if (!confirm('¿Cancelar esta reserva?')) return;
  try { await api(`/reservas/${r.value.id_reserva}/cancelar`, { method: 'POST' }); toast.ok('Reserva cancelada'); router.push('/mis-reservas'); } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div v-if="error" class="error-box">{{ error }}</div>
  <div v-else-if="!r" class="spinner">Cargando…</div>
  <div v-else class="grid two" style="align-items:start;max-width:820px;margin:0 auto">
    <section class="card stack">
      <h2>Resumen de tu reserva</h2>
      <div><b>{{ r.titulo }}</b><div class="muted small">{{ r.municipio }}</div></div>
      <div>{{ fdate(r.fecha_inicio) }}<template v-if="r.tipo === 'alojamiento'"> → {{ fdate(r.fecha_fin) }}</template> · {{ r.num_personas }} persona(s)</div>
      <div class="row between"><span>Total a pagar</span><b style="font-size:1.3rem">{{ money(r.total) }}</b></div>
      <div v-if="r.estado === 'pendiente_pago' && !vencida" class="countdown">Cupo retenido por {{ reloj }}</div>
      <div v-if="r.estado !== 'pendiente_pago'" class="ok-box">Estado de la reserva: <b>{{ r.estado }}</b>. <router-link to="/mis-reservas">Ver mis reservas</router-link></div>
      <div v-if="vencida" class="error-box">La retención del cupo venció. Vuelve a intentar la reserva. <router-link to="/">Explorar</router-link></div>
      <button v-if="r.estado === 'pendiente_pago'" class="btn outline small" @click="cancelar">Cancelar reserva</button>
    </section>

    <form v-if="r.estado === 'pendiente_pago' && !vencida" class="card stack" @submit.prevent="pagar">
      <h2>Pago con tarjeta (simulado)</h2>
      <label class="field">Número de tarjeta<input v-model="tarjeta.numero" inputmode="numeric" autocomplete="cc-number" placeholder="4111 1111 1111 1111" required @input="fmtNumero" /></label>
      <div class="row">
        <label class="field grow">Vence (MM/AA)<input v-model="tarjeta.vence" inputmode="numeric" autocomplete="cc-exp" placeholder="12/30" required @input="fmtVence" /></label>
        <label class="field grow">CVV<input v-model="tarjeta.cvv" inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="123" required /></label>
      </div>
      <div v-if="msg" class="error-box">{{ msg }}</div>
      <button class="btn block" :disabled="enviando">{{ enviando ? 'Procesando…' : `Pagar ${money(r.total)}` }}</button>
      <p class="muted small" style="margin:0">Pasarela de pruebas: no se realizan cobros reales ni se guardan datos de tarjeta. Tarjetas de ejemplo: <code>4111 1111 1111 1111</code> (aprobada), <code>4000 0000 0000 0002</code> (rechazada), <code>4000 0000 0000 0044</code> (pendiente). Usa cualquier fecha futura y un CVV de 3 dígitos.</p>
    </form>
  </div>
</template>
