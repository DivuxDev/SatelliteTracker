import { createApp } from 'vue'
import { createPinia } from 'pinia'

// `window.CESIUM_BASE_URL` se fija en index.html, antes de este modulo: los
// imports ESM se elevan, asi que asignarlo aqui podria llegar tarde.
import 'cesium/Build/Cesium/Widgets/widgets.css'
import '@/assets/styles/main.css'

import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
