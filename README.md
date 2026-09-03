# CosmoTrack

Rastreador 3D en tiempo real de satélites en órbita terrestre. Descarga los TLE
públicos de Celestrak, los propaga con SGP4/SDP4 y los dibuja sobre un globo de
CesiumJS con estética de centro de control de operaciones espaciales.

![Vue 3](https://img.shields.io/badge/Vue-3-42b883) ![CesiumJS](https://img.shields.io/badge/CesiumJS-1.144-38bdf8) ![Vite](https://img.shields.io/badge/Vite-8-646cff)

---

## Puesta en marcha

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run dev` y `npm run build` copian automáticamente los recursos de CesiumJS a
`public/cesiumStatic` (ganchos `predev` / `prebuild`).

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con proxy a Celestrak |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve el build |
| `npm run smoke` | Prueba de humo del motor orbital (34 comprobaciones, sin navegador) |
| `npm run cesium:assets` | Recopia los recursos de Cesium a la fuerza |

### Variables de entorno (opcionales)

Copia `.env.example` a `.env`:

- **`VITE_CESIUM_ION_TOKEN`** — sin token la app usa la textura Natural Earth II
  que viene empaquetada con CesiumJS: funciona **sin cuenta y sin conexión**. Con
  token se activa la imaginería mundial de alta resolución de Cesium Ion.
- **`VITE_CELESTRAK_BASE`** — base de las peticiones TLE. Por defecto `/celestrak`,
  el proxy inverso de Vite.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| Estado | Pinia |
| Build | Vite |
| Motor 3D | CesiumJS |
| Propagación orbital | `satellite.js` (SGP4/SDP4) en Web Worker |
| Datos | Celestrak (`gp.php`, `FORMAT=tle`) |
| Estilos | Tailwind CSS v4 (config CSS-first) |
| Iconos | `@lucide/vue` |

---

## Funcionalidad

### Visor 3D
- Globo oscuro y desaturado, atmósfera tenue y fondo estelar.
- Satélites como puntos coloreados por régimen orbital, en una única
  `PointPrimitiveCollection` (un solo draw call).
- Tooltip al pasar el ratón con nombre, ID NORAD, altitud y velocidad.
- Clic sobre un punto (o sobre una fila de la lista) para seleccionarlo.
- Dos capas fijas sobre el satélite seleccionado: **anillo orbital** (por dónde
  va) y **huella de cobertura** (qué alcanza desde ahí). No son conmutables —
  responden a las dos preguntas que siempre se hacen, así que no había nada que
  decidir.
- **Sin campo de estrellas.** El skyBox de Cesium competía visualmente con los
  satélites, que también son puntos brillantes: los objetos MEO y GEO (violeta y
  cian) se confundían con el fondo. Sin él, el espacio queda como un plano negro
  limpio y lo único luminoso son los satélites.
- **Sin traza terrestre.** Duplicaba lo que ya cuenta el anillo orbital y añadía
  una segunda polilínea que había que trocear en el antimeridiano.
- La iluminación solar la manda el tema del globo: *Día y noche* no es otra cosa
  que ese ajuste activado.
- Controles de zoom, reencuadre, 2D/3D y pantalla completa.
- Reloj de simulación con multiplicadores 1x / 10x / 60x / 300x, pausa y retorno
  al tiempo real.

### Temas del globo
Ocho temas, elegibles desde el botón de paleta del visor y recordados entre
sesiones. Cinco funcionan **sin conexión ni cuenta**, construidos con lo que
CesiumJS ya trae empaquetado:

| Tema | Qué es | Red |
|---|---|:--:|
| **Control oscuro** | Natural Earth desaturado (por defecto) | — |
| **Monocromo** | Sin color y con alto contraste, tipo carta náutica | — |
| **Retícula** | Sin imaginería: globo plano con malla de meridianos y paralelos | — |
| **Natural** | Natural Earth con sus colores originales | — |
| **Día y noche** | Iluminación solar real: se ve avanzar el terminador | — |
| **Vectorial oscuro** | CARTO Dark Matter: costas y fronteras nítidas | sí |
| **Blue Marble** | Mosaico NASA con relieve y batimetría | sí |
| **Luces nocturnas** | Luces urbanas vistas por el VIIRS | sí |

Los tres últimos descargan teselas de terceros (CARTO / NASA GIBS): son gratuitos
y sin clave, pero requieren conexión y conservar su atribución. Se marcan con un
icono en el selector, y si el servidor no responde la app vuelve automáticamente
al tema por defecto avisando del motivo.

Varios temas salen del **mismo** fichero de textura cambiando solo brillo,
saturación, contraste y gamma de la capa.

### Panel "Más seguidos"
Los cinco satélites más consultados, al estilo del panel *Most Tracked* de
Flightradar24 — **pero midiendo algo distinto**. Allí el ranking sale de agregar
en servidor la actividad de todos los usuarios; aquí no hay backend ni más
usuarios, así que lo que se mide es **la actividad local de este navegador**:
cuántas veces has abierto cada satélite y cuánto tiempo lo has tenido en
pantalla. La cabecera del panel lo dice explícitamente.

Una consulta solo cuenta si el satélite se mantiene seleccionado 1,5 s: al
recorrer la lista se seleccionan decenas de paso. El historial se guarda en
`localStorage`, no sale del navegador, y se puede borrar desde el propio panel.
Mientras no hay historial se muestran objetos **sugeridos**, etiquetados como
tales y sin cifras de uso inventadas.

### Inspector lateral
- Búsqueda por nombre o ID NORAD.
- Filtros por categoría (la activación descarga el conjunto bajo demanda),
  régimen orbital y país/operador.
- Tabla de satélites activos con estado, órbita y velocidad instantánea,
  **virtualizada** (el catálogo completo es navegable, sin recortes) y ordenable
  por relevancia, nombre, altitud o ID NORAD.
- Ficha del seleccionado: altitud, inclinación, latitud, longitud, periodo,
  velocidad y operador, con aviso cuando el TLE tiene más de 14 días.

### Qué es este objeto
El modal de detalles abre con una ficha que responde a *"¿y esto qué es?"* antes
que con números: tipo de misión (navegación, comunicaciones, meteorológico,
observación de la Tierra, científico, militar, estación tripulada, carguero,
demostración tecnológica o basura orbital), para qué sirve y qué revela su órbita.

**Los TLE no traen nada de esto.** Celestrak da un nombre y dos líneas de
elementos; el propósito de la misión solo está en fuentes externas de decenas de
miles de registros. Así que hay dos mecanismos, y la interfaz distingue cuál se
ha usado:

| Origen | Etiqueta | Qué es |
|---|---|---|
| `CURATED` | **ficha propia** | Texto verificado, escrito a mano, indexado por ID NORAD |
| `MISSION_RULES` | **deducido** | Tipo inferido del nombre por patrones. Heurística: acierta en familias grandes y falla en nombres crípticos |

Lo que no encaja en ninguno queda como *"Sin clasificar"* en vez de recibir un
tipo plausible: un tipo inventado es peor que un hueco, porque el hueco se ve.

Aparte va **"Lo que dice su órbita"**, que no es heurística: sale de los números
del TLE. Detecta órbitas heliosíncronas (inclinación 95–105°), geoestacionarias,
alta excentricidad o el número de vueltas al día.

Las fichas curadas llevan **alias** que alimentan el buscador. Celestrak llama
`HST` al Hubble e `ISS (ZARYA)` a la estación, así que buscar "hubble" no
encontraba nada; ahora sí.

### Acciones sobre un satélite
- **Track** — fija la cámara sobre el satélite mientras se mueve.
- **Details** — ficha de misión, elementos keplerianos, geometría derivada y el
  TLE en crudo (copiable).
- **Pasadas** — simulador de pasadas sobre tierra: ubicación por GPS o manual,
  elevación mínima, ventana de búsqueda, lista de próximas pasadas con hora de
  inicio/fin, elevación máxima, azimuts y distancia mínima, más una gráfica polar
  del cielo local con brújula.

### Diagnóstico
La app es de **una sola pantalla**: el visor nunca se pierde de vista y todo lo
accesorio se abre en modales superpuestos. El diagnóstico se consulta desde el
icono de actividad de la cabecera, que además muestra un punto rojo cuando hay
incidencias. Contiene el estado del enlace con Celestrak, las fuentes de datos
con su `GROUP` y su estado (*cargado* / *descargando* / *desde caché* / *no
cargado*), el estado del motor de propagación y las incidencias registradas.

---

## Decisiones de arquitectura

### La propagación va en un Web Worker
Propagar miles de satélites con SGP4 cuesta varios milisegundos por ciclo.
Hacerlo en el hilo de render tumbaría los FPS de CesiumJS. El worker
(`src/workers/propagator.worker.js`) devuelve **TypedArrays transferidos** (coste
cero de copia) y el hilo principal **reenvía los mismos buffers** en el siguiente
ciclo para reciclarlos, de modo que no se genera basura por frame.

| Buffer | Tipo | Contenido |
|---|---|---|
| `pos` | `Float32Array(n·3)` | Posición ECEF en metros |
| `tel` | `Float32Array(n·4)` | Altitud km, latitud, longitud, velocidad km/s |
| `flags` | `Uint8Array(n)` | 1 = propagación válida |

### Las posiciones no son reactivas
Con miles de objetos actualizándose 20 veces por segundo, meter cada vector en el
sistema de reactividad de Vue destruiría el rendimiento. El store expone:

- `frame` — un `shallowRef` a los TypedArrays crudos.
- `frameTick` — se incrementa en cada ciclo; solo lo observa el visor 3D.
- `uiTick` — se incrementa 2 veces por segundo; lo observan las listas y fichas,
  que no necesitan más resolución temporal.

### La lista lateral está virtualizada
Solo existen en el DOM las filas visibles más un margen; un espaciador con el
alto total mantiene la barra de scroll fiel. Con 487 objetos cargados hay ~11
nodos en el DOM en lugar de 487, y el coste de render no depende del tamaño del
catálogo. El orden por defecto es **por relevancia** (prioridad de categoría y
luego nombre): con orden alfabético plano, objetos tan evidentes como la ISS
quedaban sepultados a mitad de la lista.

### El layout responde al alto, no solo al ancho
Un móvil en horizontal tiene 844 px de ancho pero apenas 390 de alto: decidir el
layout solo por el ancho lo dejaba apilado y ambos paneles inservibles. Hay dos
variantes CSS propias, `wide` y `stacked`, complementarias exactas:

```
wide    = (min-width: 1024px) o bien (min-width: 640px y max-height: 520px)
stacked = (max-width: 639px) o bien (max-width: 1023px y min-height: 521px)
```

Con `stacked` el visor va arriba con altura fija, el inspector debajo, y la ficha
del satélite se convierte en una hoja inferior superpuesta —encajarla en el flujo
dejaba la lista en dos o tres filas—. Con `wide` vuelve el layout de dos columnas.

El ancho de la barra lateral se declara con `clamp(300px, 24vw, 360px)` en una
sola regla: al ser `wide` una variante propia, su orden en la cascada frente a los
breakpoints de serie no está garantizado y encadenar `wide:` con `xl:` hacía que
este último perdiera.

### La atmósfera de superficie manda sobre los ajustes de capa
Al añadir los temas de base plana (CARTO, luces nocturnas) el océano salía gris
medio por mucho que se bajara el brillo de la capa. La causa es que
`globe.showGroundAtmosphere` suma un término **aditivo** sobre todo el globo,
y lo hace *después* de aplicar brillo, contraste y gamma de la imaginería: esos
ajustes no pueden compensarlo. Sobre la textura colorida de Natural Earth apenas
se nota; sobre una base casi uniforme, domina. Esos temas la desactivan.

### Primitivas, no entidades
Una `Entity` de Cesium por satélite implica un `Property` evaluado en cada frame.
Con 10.000 objetos es inviable. Se usa una `PointPrimitiveCollection` y solo se
reescribe el buffer de posiciones.

### La órbita se dibuja en TEME, no en ECEF
El anillo orbital se calcula en el marco cuasi-inercial TEME y se ancla a la
Tierra rotando la colección completa con la matriz TEME → pseudo-fixed en cada
frame. Generado directamente en ECEF saldría como una espiral deformada, porque
la Tierra gira mientras se recorre el periodo.

### Paleta validada para daltonismo
Los cuatro regímenes orbitales usan una paleta categórica de orden fijo,
verificada contra la superficie de panel (`#161c28`): banda de luminosidad OKLCH,
suelo de croma, separación CVD del peor par adyacente (ΔE 9,6 en deuteranopía) y
contraste ≥ 3:1. Cada régimen tiene **dos pasos del mismo tono**: `color` para la
interfaz y `markColor`, más brillante, para los puntos sobre el negro del espacio.
El texto nunca lleva el color de la serie, sino un punto de color al lado.

---

## Notas sobre los datos

### Celestrak y el proxy
Celestrak no envía cabeceras CORS permisivas de forma fiable, así que las
peticiones pasan por un proxy inverso. En desarrollo lo aporta Vite
(`/celestrak` → `https://celestrak.org`, ver `vite.config.js`). **En producción hay
que replicar ese proxy en el servidor web.** Ejemplo con nginx:

```nginx
location /celestrak/ {
    proxy_pass https://celestrak.org/;
    proxy_set_header Host celestrak.org;
}
```

### Respuestas 403 "sin cambios"
Celestrak regenera los datos cada 2 horas y responde **403** con el texto
*"GP data has not updated since your last successful download"* si vuelves a pedir
el mismo conjunto antes de tiempo. **Esto no es un error**: la app lo detecta y
sirve la copia cacheada, marcando la fuente como *desde caché* en la vista
Network. La caché tiene dos niveles: memoria (sin límite práctico, cubre la
sesión) y `localStorage` (2 h de TTL, sujeto a la cuota de ~5 MB del navegador).

### Modo demo
Si no se puede contactar con Celestrak, la app genera **una constelación sintética
local** y lo indica con un aviso visible. Esos TLE se construyen a partir de
elementos keplerianos representativos de cada régimen y se serializan al formato
TLE estándar, con checksums válidos, para que SGP4 los propague igual que a los
reales. **No son efemérides de satélites reales**: no sirven para apuntar antenas
ni planificar observaciones.

### País y operador
Los ficheros TLE de Celestrak **no incluyen el país**; solo está en el SATCAT, que
son ~30.000 registros adicionales. Para no exigir esa segunda descarga, el país y
el operador se **infieren del nombre del objeto** mediante una tabla de patrones
(`OPERATOR_RULES` en `orbitCalculationService.js`). Es una heurística: lo que no
encaja queda como *"Sin clasificar"* en lugar de asignarse a un país al azar.

### Precisión
Los TLE solo son válidos en un entorno de pocos días alrededor de su época. Por
encima de ~14 días el error de posición crece a decenas de kilómetros, y la app lo
avisa tanto en la ficha del satélite como en el indicador de salud del catálogo.

---

## Estructura

```
src/
├── assets/styles/          main.css (tema y sistema de diseño), dark-theme.css (chrome de Cesium)
├── components/
│   ├── layout/             HeaderNav.vue, SidebarPanel.vue, DiagnosticsModal.vue
│   ├── cesium/             GlobeViewer.vue, SatelliteEntity.vue, OrbitPolyline.vue,
│   │                       useCesiumViewer.js
│   ├── satellite/          SatelliteList.vue, SatelliteCard.vue,
│   │                       GroundPassSimulator.vue, TelemetryModal.vue,
│   │                       MostTrackedPanel.vue
│   └── ui/                 BaseButton.vue, BaseInput.vue, BaseSelect.vue
├── data/                   demoConstellation.js (catálogo sintético de respaldo)
├── services/               celestrakService.js, orbitCalculationService.js,
│                           passPredictorService.js, globeThemeService.js,
│                           trackingStatsService.js, satelliteProfileService.js
├── stores/                 satelliteStore.js
├── views/                  DashboardView
├── workers/                propagator.worker.js
└── App.vue, main.js
scripts/                    copy-cesium-assets.mjs, smoke.mjs
```

`SatelliteEntity.vue` y `OrbitPolyline.vue` no producen salida en el DOM: son
componentes que gestionan primitivas de Cesium y reciben el `Viewer` por
`provide` / `inject` desde `GlobeViewer.vue`. Así cada capa controla su propio
ciclo de vida sin que el visor tenga que conocerlas.

---

## Verificación

Layout comprobado en Chrome (vía CDP) a **320×690, 390×844, 768×1024, 844×390
(horizontal) y 1440×810**, verificando en cada vista que ni el documento ni
ninguna página desbordan horizontalmente. Las tablas anchas y los gráficos sí se
desplazan, pero dentro de su propio contenedor con `overflow-x: auto`.

`npm run smoke` ejecuta 34 comprobaciones del motor orbital sin navegador:
serialización y round-trip de TLE, lectura de elementos por columnas,
clasificación de regímenes, propagación (velocidad y periodo de la ISS, deriva de
un geoestacionario), consistencia de la traza orbital y predicción de pasadas.

---

## Licencias y atribución

- Datos orbitales: [Celestrak](https://celestrak.org/) — respeta sus condiciones
  de uso y no descargues el mismo conjunto más de una vez cada 2 horas.
- CesiumJS es Apache 2.0 y **exige mantener visible su atribución**: los créditos
  de la esquina inferior izquierda del visor no deben ocultarse.
- Temas en línea: **CARTO** (© OpenStreetMap contributors © CARTO) y **NASA
  EOSDIS GIBS** (Blue Marble y VIIRS). Su atribución se declara en el proveedor y
  Cesium la muestra junto al resto de créditos; no la quites.
