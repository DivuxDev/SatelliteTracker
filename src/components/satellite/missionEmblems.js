/**
 * missionEmblems
 * ---------------------------------------------------------------------------
 * Un glifo por tipo de mision (los 11 `MISSION_TYPES` de
 * satelliteProfileService.js), para el emblema de SatelliteCard y la
 * cabecera de TelemetryModal. No son fotos ni siluetas realistas de cada
 * satelite -con miles de objetos en catalogo eso no escala-, son marcas
 * simples que distinguen de un vistazo "esto es una estacion" de "esto es
 * basura orbital".
 *
 * Dibujados en la misma rejilla y trazo que @lucide/vue (viewBox 24x24,
 * stroke-width 1.5, cabos y uniones redondeados, sin relleno) para que no
 * desentonen junto al resto de iconos de la interfaz. Cada entrada es el
 * marcado interior de un <svg>; MissionEmblem.vue pone el envoltorio.
 *
 * `unknown` usa trazo discontinuo a proposito: es el mismo lenguaje visual
 * que ya usa el modal de telemetria para "deducido" (ver TelemetryModal.vue).
 */

const SATELLITE_BUS =
  '<rect x="10" y="9.5" width="4" height="5" rx="0.6"/>' +
  '<line x1="10" y1="12" x2="5" y2="12"/><rect x="1.5" y="9" width="3.5" height="6" rx="0.6"/>' +
  '<line x1="14" y1="12" x2="19" y2="12"/><rect x="19" y="9" width="3.5" height="6" rx="0.6"/>'

export const MISSION_EMBLEMS = {
  station:
    '<line x1="2" y1="12" x2="8" y2="12"/><rect x="8" y="9.5" width="3" height="5" rx="0.5"/>' +
    '<rect x="13" y="9.5" width="3" height="5" rx="0.5"/><line x1="16" y1="12" x2="22" y2="12"/>' +
    '<rect x="10.3" y="10.7" width="3.4" height="2.6" rx="0.6"/>',

  navigation:
    SATELLITE_BUS +
    '<path d="M10.6 15.6a2.1 2.1 0 0 1 2.8 0"/><path d="M9.4 17.1a3.9 3.9 0 0 1 5.2 0"/>',

  comms:
    '<path d="M7.5 8.2a4.5 4.5 0 0 1 9 0"/><line x1="12" y1="8.2" x2="12" y2="9.5"/>' + SATELLITE_BUS,

  weather:
    '<circle cx="12" cy="7.3" r="1.9"/><circle cx="12" cy="7.3" r="0.35" fill="currentColor"/>' +
    SATELLITE_BUS,

  earth:
    SATELLITE_BUS +
    '<line x1="12" y1="14.5" x2="12" y2="15.8"/>' +
    '<circle cx="12" cy="17.4" r="1.7"/>' +
    '<line x1="10.4" y1="17.4" x2="13.6" y2="17.4"/><line x1="12" y1="15.8" x2="12" y2="19"/>',

  science:
    '<line x1="12" y1="9.5" x2="12" y2="4.2"/><circle cx="12" cy="3.4" r="1.2"/>' + SATELLITE_BUS,

  military:
    '<path d="M10.3 9.5h3.4l1.7 2.5-1.7 2.5h-3.4l-1.7-2.5z"/>' +
    '<line x1="8.6" y1="12" x2="5" y2="12"/><rect x="1.5" y="9.3" width="3.5" height="5.4" rx="0.5"/>' +
    '<line x1="15.4" y1="12" x2="19" y2="12"/><rect x="19" y="9.3" width="3.5" height="5.4" rx="0.5"/>',

  tech:
    '<rect x="8.5" y="8.5" width="7" height="7" rx="0.8"/><path d="M10.5 11h3M10.5 13h3"/>' +
    '<line x1="15.5" y1="10.5" x2="20" y2="9"/><rect x="19.5" y="6.8" width="3" height="4.2" rx="0.5"/>',

  cargo:
    '<path d="M9 20v-9a3 3 0 0 1 6 0v9"/><line x1="8.5" y1="20" x2="15.5" y2="20"/>' +
    '<line x1="9.6" y1="8" x2="14.4" y2="8"/><line x1="10.1" y1="6" x2="13.9" y2="6"/>',

  debris:
    '<path d="M4.5 8.5 7 6.7l2 2.6-.9 2.7-3.8-.7z"/>' +
    '<path d="M13.5 5.8l3.8 1-.9 3.6-2.8.9-1.8-2.7z"/>' +
    '<path d="M8.3 14 11 15.8l-.8 3.6-3.8-.7-.3-3.7z"/>',

  unknown:
    `<g stroke-dasharray="1.6 1.8">${SATELLITE_BUS}</g>`,
}

/** Emblema de repuesto para un `type.id` que no tenga entrada (no deberia
 *  pasar con los 11 tipos actuales, pero una lista cerrada de todas formas
 *  necesita un valor por defecto que no rompa el render). */
export const FALLBACK_EMBLEM = MISSION_EMBLEMS.unknown
