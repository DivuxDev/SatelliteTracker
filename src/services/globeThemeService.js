/**
 * globeThemeService
 * ---------------------------------------------------------------------------
 * Temas visuales del globo terraqueo.
 *
 * Un tema = una capa de imagineria + ajustes de globo y atmosfera. Se distinguen
 * dos familias:
 *
 *   - OFFLINE: se construyen con lo que CesiumJS ya trae empaquetado (la textura
 *     Natural Earth II y el generador de retícula). Funcionan sin red y sin
 *     cuenta de Cesium Ion. Varios temas distintos salen del MISMO fichero de
 *     textura, cambiando solo brillo, saturacion, contraste y gamma de la capa.
 *
 *   - EN LINEA: teselas servidas por terceros. Son gratuitas y sin clave, pero
 *     exigen conexion y conservar la atribucion. Se marcan como tales en la
 *     interfaz para que quede claro por que pueden fallar.
 */

import {
  Color,
  GeographicTilingScheme,
  GridImageryProvider,
  ImageryLayer,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  buildModuleUrl,
} from 'cesium'

/** Ajustes de atmosfera y globo compartidos por los temas oscuros. */
const DARK_SCENE = {
  baseColor: '#0a0d12',
  lighting: false,
  showGroundAtmosphere: true,
  atmosphereBrightnessShift: -0.75,
  atmosphereSaturationShift: -0.25,
  atmosphereHueShift: 0.02,
  skyBrightnessShift: -0.6,
  skySaturationShift: -0.15,
  background: '#05070b',
}

/** Textura Natural Earth II que viaja dentro del paquete de CesiumJS. */
function naturalEarth() {
  return TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII'))
}

export const GLOBE_THEMES = [
  {
    id: 'dark',
    label: 'Control oscuro',
    description: 'Natural Earth desaturado. El tema por defecto: los satelites destacan sobre el.',
    offline: true,
    imagery: naturalEarth,
    layerOptions: { brightness: 0.44, saturation: 0.14, contrast: 1.32, gamma: 0.9, hue: 0.02 },
    scene: DARK_SCENE,
  },
  {
    id: 'mono',
    label: 'Monocromo',
    description: 'Sin color y con alto contraste, al estilo de una carta nautica.',
    offline: true,
    imagery: naturalEarth,
    layerOptions: { brightness: 0.5, saturation: 0, contrast: 1.6, gamma: 0.8 },
    scene: { ...DARK_SCENE, atmosphereSaturationShift: -1 },
  },
  {
    id: 'blueprint',
    label: 'Retícula',
    description: 'Sin imagineria: globo plano con malla de meridianos y paralelos.',
    offline: true,
    imagery: () =>
      new GridImageryProvider({
        cells: 4,
        color: Color.fromCssColorString('#7fb5f2').withAlpha(0.45),
        glowColor: Color.fromCssColorString('#38bdf8').withAlpha(0.12),
        glowWidth: 4,
        backgroundColor: Color.fromCssColorString('#0d1522'),
      }),
    layerOptions: {},
    scene: { ...DARK_SCENE, baseColor: '#0d1522' },
  },
  {
    id: 'natural',
    label: 'Natural',
    description: 'Natural Earth con sus colores originales, sin oscurecer.',
    offline: true,
    imagery: naturalEarth,
    layerOptions: { brightness: 1, saturation: 1, contrast: 1, gamma: 1 },
    scene: {
      ...DARK_SCENE,
      baseColor: '#0f172a',
      atmosphereBrightnessShift: -0.1,
      atmosphereSaturationShift: 0.1,
      skyBrightnessShift: -0.1,
      skySaturationShift: 0,
    },
  },
  {
    id: 'terminator',
    label: 'Dia y noche',
    description: 'Iluminacion solar real: se ve el terminador avanzar sobre la Tierra.',
    offline: true,
    imagery: naturalEarth,
    layerOptions: { brightness: 0.85, saturation: 0.45, contrast: 1.15, gamma: 0.95 },
    scene: { ...DARK_SCENE, lighting: true, baseColor: '#060a10' },
  },
  {
    id: 'carto',
    label: 'Vectorial oscuro',
    description: 'Basemap CARTO Dark Matter: costas y fronteras nitidas sobre fondo negro.',
    offline: false,
    attribution: '© OpenStreetMap contributors © CARTO',
    imagery: () =>
      new UrlTemplateImageryProvider({
        url: 'https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        maximumLevel: 18,
        credit: '© OpenStreetMap contributors © CARTO',
      }),
    layerOptions: { brightness: 0.7, contrast: 0.95, hue: 0.04 },
    // `showGroundAtmosphere` desactivado a proposito. La atmosfera de superficie
    // de Cesium suma un termino aditivo considerable sobre todo el globo; con la
    // textura colorida de Natural Earth apenas se nota, pero sobre una base casi
    // plana como esta convertia el oceano en gris medio y arruinaba el tema.
    // Los ajustes de brillo y contraste de la capa no podian compensarlo porque
    // actuan ANTES de que se sume la atmosfera.
    scene: { ...DARK_SCENE, baseColor: '#050810', showGroundAtmosphere: false },
  },
  {
    id: 'bluemarble',
    label: 'Blue Marble',
    description: 'Mosaico Blue Marble de la NASA con relieve y batimetria.',
    offline: false,
    attribution: 'NASA EOSDIS GIBS',
    imagery: () =>
      new UrlTemplateImageryProvider({
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{reverseY}/{x}.jpeg',
        tilingScheme: new GeographicTilingScheme(),
        maximumLevel: 8,
        credit: 'NASA EOSDIS GIBS',
      }),
    layerOptions: { brightness: 0.8, saturation: 0.7, contrast: 1.15 },
    scene: { ...DARK_SCENE, baseColor: '#071018', atmosphereBrightnessShift: -0.45 },
  },
  {
    id: 'citylights',
    label: 'Luces nocturnas',
    description: 'Luces urbanas vistas por el VIIRS. Revela la huella humana de un vistazo.',
    offline: false,
    attribution: 'NASA EOSDIS GIBS · VIIRS',
    imagery: () =>
      new UrlTemplateImageryProvider({
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_CityLights_2012/default/500m/{z}/{reverseY}/{x}.jpg',
        tilingScheme: new GeographicTilingScheme(),
        maximumLevel: 8,
        credit: 'NASA EOSDIS GIBS · VIIRS',
      }),
    layerOptions: { brightness: 1.3, contrast: 1.25, gamma: 1.1 },
    // Sin atmosfera de superficie: su termino aditivo levantaria el negro del
    // mosaico nocturno y las luces urbanas dejarian de destacar.
    scene: {
      ...DARK_SCENE,
      baseColor: '#03060c',
      showGroundAtmosphere: false,
      atmosphereBrightnessShift: -0.85,
    },
  },
]

export const DEFAULT_THEME_ID = 'dark'
export const THEME_BY_ID = new Map(GLOBE_THEMES.map((theme) => [theme.id, theme]))

const STORAGE_KEY = 'sot:globe-theme'

export function loadThemeId() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return THEME_BY_ID.has(stored) ? stored : DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function saveThemeId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * Aplica un tema al visor: sustituye la capa base y reajusta globo y atmosfera.
 *
 * @param {import('cesium').Viewer} viewer
 * @param {string} themeId
 * @returns {Promise<{ok:boolean, message?:string}>}
 */
export async function applyGlobeTheme(viewer, themeId) {
  const theme = THEME_BY_ID.get(themeId) ?? THEME_BY_ID.get(DEFAULT_THEME_ID)
  if (!viewer || viewer.isDestroyed()) return { ok: false, message: 'Visor no disponible' }

  let provider
  try {
    provider = await theme.imagery()
  } catch (error) {
    return {
      ok: false,
      message: theme.offline
        ? `No se pudo cargar la textura del tema "${theme.label}": ${error?.message ?? error}`
        : `"${theme.label}" necesita conexion y el servidor no respondio.`,
    }
  }

  // El orden importa: primero se anade la nueva capa y despues se retiran las
  // anteriores, para que no haya un frame con el globo desnudo.
  const layers = viewer.imageryLayers
  const previous = []
  for (let i = 0; i < layers.length; i += 1) previous.push(layers.get(i))

  const layer = new ImageryLayer(provider, theme.layerOptions ?? {})
  layers.add(layer)
  for (const old of previous) layers.remove(old, true)

  applySceneSettings(viewer, theme.scene)
  return { ok: true }
}

/** Ajustes de globo, atmosfera y fondo asociados al tema. */
function applySceneSettings(viewer, settings) {
  const scene = viewer.scene
  const globe = scene.globe

  globe.baseColor = Color.fromCssColorString(settings.baseColor)
  globe.enableLighting = settings.lighting
  globe.showGroundAtmosphere = settings.showGroundAtmosphere
  globe.atmosphereBrightnessShift = settings.atmosphereBrightnessShift
  globe.atmosphereSaturationShift = settings.atmosphereSaturationShift
  globe.atmosphereHueShift = settings.atmosphereHueShift

  scene.skyAtmosphere.brightnessShift = settings.skyBrightnessShift
  scene.skyAtmosphere.saturationShift = settings.skySaturationShift
  scene.backgroundColor = Color.fromCssColorString(settings.background)
}

/** Indica si un tema fuerza la iluminacion solar (bloquea el conmutador manual). */
export function themeForcesLighting(themeId) {
  return Boolean(THEME_BY_ID.get(themeId)?.scene?.lighting)
}
