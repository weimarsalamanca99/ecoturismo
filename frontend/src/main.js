import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuth } from './stores/auth';
import './styles.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Recupera la sesión (si hay token guardado) antes de montar la aplicación.
useAuth().init().finally(() => {
  app.mount('#app');
});
