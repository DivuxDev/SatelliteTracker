<script setup>
/**
 * HelpModal
 * ---------------------------------------------------------------------------
 * Manual de uso para quien abre la app por primera vez. Contenido como datos
 * (no marcado a mano): este fichero se va a editar como texto con
 * frecuencia, y separar contenido de estructura hace ese cambio seguro.
 */
import {
  Activity,
  BookOpen,
  Compass,
  Database,
  Rocket,
  Satellite,
  Search,
  Telescope,
  TriangleAlert,
} from '@lucide/vue'
import BaseModal from '@/components/ui/BaseModal.vue'

defineProps({
  open: { type: Boolean, default: false },
})
defineEmits(['close'])

const SECTIONS = [
  {
    id: 'que-es',
    icon: Rocket,
    title: 'Que es esta app',
    paragraphs: [
      'CosmoTrack es un rastreador en tiempo real de satelites en orbita terrestre. Descarga los elementos orbitales publicos (TLE) de Celestrak, calcula su posicion con el mismo modelo matematico que usan los operadores reales (SGP4/SDP4) y los dibuja sobre un globo 3D que gira de verdad.',
      'No es una foto ni una animacion: cada punto se recalcula varias veces por segundo a partir de datos reales, asi que lo que ves es donde esta ese objeto ahora mismo (o donde estara, si aceleras el reloj de simulacion).',
    ],
  },
  {
    id: 'globo',
    icon: Compass,
    title: 'Moverse por el globo',
    paragraphs: [
      'Arrastra con el boton izquierdo para girar la camara, usa la rueda del raton (o pellizca en movil) para acercar y alejar. Los botones + / - de la esquina hacen lo mismo, y el boton circular vuelve a la vista inicial.',
      'Pulsa un punto para seleccionar ese satelite: la camara vuela hacia el y su ficha aparece con la telemetria en vivo. El boton "Seguir" de la ficha fija la camara sobre el objeto para verlo moverse sobre el terreno.',
    ],
  },
  {
    id: 'buscar',
    icon: Search,
    title: 'Buscar y filtrar',
    paragraphs: [
      'El buscador de la lista admite el nombre tal como lo escribe Celestrak (por ejemplo "ISS (ZARYA)") o el ID NORAD, un numero que identifica al objeto para siempre y no cambia aunque el nombre se reescriba.',
      'Para un puñado de satelites muy conocidos tambien funcionan los alias habituales: buscar "Hubble" encuentra el objeto que Celestrak llama "HST", porque la app guarda esa equivalencia a mano.',
      'La pildora de filtros deja acotar por categoria de catalogo, regimen orbital (LEO/MEO/GEO/HEO) y pais u operador inferido del nombre.',
    ],
  },
  {
    id: 'ficha',
    icon: Satellite,
    title: 'La ficha del satelite',
    paragraphs: [
      'Al seleccionar un objeto aparece su ficha con altitud, inclinacion, posicion, periodo y velocidad, actualizados en vivo. El emblema de la izquierda cambia de forma segun el tipo de mision (estacion, comunicaciones, navegacion...) y de color segun el regimen orbital.',
    ],
  },
  {
    id: 'telemetria',
    icon: Activity,
    title: 'Telemetria avanzada',
    paragraphs: [
      'El boton "Detalles" abre una vista completa: que es el objeto (con su procedencia marcada — mas abajo se explica que significa cada marca), elementos keplerianos medios, geometria orbital derivada y las dos lineas TLE en crudo, con un boton para copiarlas y usarlas en otro programa.',
    ],
  },
  {
    id: 'tle-sgp4',
    icon: BookOpen,
    title: 'Que es un TLE y que es SGP4',
    paragraphs: [
      'Un TLE ("Two-Line Element set") son dos lineas de texto con los parametros de la orbita de un objeto en un instante concreto (su "epoca"): inclinacion, excentricidad, cuanto tarda en dar una vuelta, etc. Los publican organismos que rastrean objetos en orbita, y Celestrak los recopila y los ofrece en abierto.',
      'SGP4 (y SDP4 para orbitas muy altas) es el modelo matematico que, a partir de esas dos lineas, calcula donde esta el objeto en cualquier instante posterior. Es una prediccion, no una medida directa: cuanto mas tiempo pasa desde la epoca del TLE, menos precisa es. Por eso la app avisa cuando un TLE tiene mas de 14 dias: el error ya se cuenta en decenas de kilometros.',
    ],
  },
  {
    id: 'pasadas',
    icon: Telescope,
    title: 'Pasadas y la grafica polar',
    paragraphs: [
      'El boton "Pasadas" calcula cuando el satelite seleccionado pasara por encima de una ubicacion (la tuya por GPS, o una que escribas a mano) y si sera visible a simple vista: hace falta que el satelite este iluminado por el Sol y que tu ya estes a oscuras.',
      'La grafica circular es el cielo visto desde abajo: el centro es justo encima de tu cabeza (el cenit) y el borde es el horizonte. La linea marca el camino del satelite; el tramo brillante es la parte realmente visible.',
    ],
  },
  {
    id: 'avisos',
    icon: TriangleAlert,
    title: 'Los avisos, y por que no se ocultan',
    paragraphs: [
      'Esta app es deliberadamente explicita sobre de donde sale cada dato y cuanto te puedes fiar de el. Esos avisos no son ruido: son la informacion.',
    ],
    bullets: [
      'Modo demo: no se pudo contactar con Celestrak, asi que ves una constelacion sintetica generada en el propio navegador. Nunca son datos reales, y la interfaz lo marca en todo momento mientras dure.',
      'Enlace degradado: algunas categorias del catalogo no se pudieron descargar, pero el resto son datos reales validos.',
      'TLE caducado (mas de 14 dias): la posicion sigue siendo una prediccion util, pero con un margen de error creciente.',
      '"Ficha propia": la descripcion del objeto esta verificada y escrita a mano para ese satelite en concreto.',
      '"Deducido": el tipo de mision se ha inferido del nombre por patrones (por ejemplo, que empiece por "STARLINK"). Acierta casi siempre en las familias grandes, pero es una suposicion, no un hecho confirmado.',
    ],
  },
  {
    id: 'datos',
    icon: Database,
    title: 'De donde salen los datos',
    paragraphs: [
      'Los elementos orbitales vienen de Celestrak (celestrak.org), que a su vez los recopila de fuentes publicas de seguimiento espacial. La propagacion SGP4/SDP4 se calcula en el navegador con la libreria satellite.js. El globo y su renderizado 3D los pone CesiumJS, con cartografia de Natural Earth.',
    ],
  },
]
</script>

<template>
  <BaseModal :open="open" title="Manual de uso" max-width="max-w-3xl" @close="$emit('close')">
    <!-- Nav de anclas: es el modal mas largo de la app -->
    <nav
      class="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-accent-300/16 bg-[rgba(9,17,30,.92)] px-3 py-2 no-scrollbar backdrop-blur"
    >
      <a
        v-for="section in SECTIONS"
        :key="section.id"
        :href="`#help-${section.id}`"
        class="shrink-0 rounded-full border border-accent-300/22 px-2.5 py-1 text-t1 text-hud-ink-500 transition-colors hover:border-accent-300/50 hover:text-hud-ink-300"
      >
        {{ section.title }}
      </a>
    </nav>

    <div class="space-y-6 p-4">
      <section v-for="section in SECTIONS" :id="`help-${section.id}`" :key="section.id" class="scroll-mt-14">
        <h3 class="mb-2 flex items-center gap-2 text-t4 font-semibold text-hud-ink-100">
          <component :is="section.icon" :size="16" class="shrink-0 text-accent-400" />
          {{ section.title }}
        </h3>
        <p
          v-for="(paragraph, index) in section.paragraphs"
          :key="index"
          class="mb-2 text-t2 leading-relaxed text-hud-ink-300 last:mb-0"
        >
          {{ paragraph }}
        </p>
        <ul v-if="section.bullets" class="mt-2 space-y-1.5">
          <li
            v-for="bullet in section.bullets"
            :key="bullet"
            class="flex gap-1.5 text-t2 leading-relaxed text-hud-ink-300"
          >
            <span class="mt-1 text-accent-400">·</span>
            {{ bullet }}
          </li>
        </ul>
      </section>
    </div>
  </BaseModal>
</template>
