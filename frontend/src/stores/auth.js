import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api';

export const useAuth = defineStore('auth', () => {
  const token = ref(localStorage.getItem('eco_token') || '');
  const user = ref(null);
  const rol = computed(() => (user.value ? user.value.rol : ''));

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('eco_token');
  }
  async function init() {
    if (!token.value) return;
    try { user.value = await api('/usuarios/me'); } catch (e) { logout(); }
  }
  async function login(correo, password) {
    const data = await api('/auth/login', { method: 'POST', body: { correo, password } });
    token.value = data.token;
    localStorage.setItem('eco_token', data.token);
    user.value = data.usuario;
    return data.usuario;
  }
  return { token, user, rol, login, logout, init };
});
