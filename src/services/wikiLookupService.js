/**
 * wikiLookupService
 * ---------------------------------------------------------------------------
 * Tercer nivel de procedencia para "¿que es este objeto?", detras de la ficha
 * curada y de la familia de constelacion: una consulta en vivo a
 * Wikidata/Wikipedia, solo cuando ninguno de los otros dos dio nada.
 *
 * EL EMPAREJAMIENTO ES POR ID NORAD, NUNCA POR NOMBRE. El buscador de texto
 * de Wikipedia indexa el cuerpo de los articulos, no el titulo: buscar
 * "COSMOS 2553" por texto libre devuelve el articulo "1997" (verificado en
 * vivo). Ningun filtro de similitud arregla eso, asi que no se usa en
 * absoluto — Wikidata tiene la propiedad P377 ("Satellite Catalog Number"),
 * que es el mismo ID NORAD inmutable que ya usa `CURATED`. Se busca por ahi:
 * o hay una coincidencia exacta de catalogo, o no hay nada. Nunca se muestra
 * un resultado "parecido".
 *
 * Tres peticiones encadenadas, todas con CORS abierto (`origin=*` en
 * Wikidata; la API REST de Wikipedia lo trae de serie):
 *   1. Wikidata: busca el item cuyo P377 sea este NORAD ID.
 *   2. Wikidata: de ese item, el enlace a Wikipedia (espanol si existe, si no
 *      ingles — hay objetos, como NOAA-20, sin pagina en espanol).
 *   3. Wikipedia REST: el resumen de esa pagina.
 *
 * Se acepta el resultado solo si `type === 'standard'` (descarta paginas de
 * desambiguacion y cabos sueltos sin extracto) y el extracto tiene contenido
 * real. Cualquier fallo de red o de forma se traduce en "no hay nada que
 * mostrar", nunca en un error visible ni en un dato inventado.
 */

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const FETCH_TIMEOUT_MS = 6000
const MIN_EXTRACT_LENGTH = 80

/**
 * ¿Tiene sentido buscar este satelite en Wikipedia? Se evalua ANTES de
 * cualquier peticion de red — son las mismas reglas que "fallan cerrado".
 *
 * @param {object|null} satellite
 * @param {object|null} profile  resultado de `getSatelliteProfile(satellite)`
 * @param {{isDemoMode: boolean}} context
 */
export function isWikiEligible(satellite, profile, { isDemoMode }) {
  if (!satellite || !profile) return false
  // Los NORAD ID del modo demo son generados localmente y pueden coincidir
  // por pura casualidad con los de un objeto real: mostrar un extracto de
  // Wikipedia para un satelite que no existe seria el peor fallo posible en
  // una app que presume de honestidad sobre la procedencia de sus datos.
  if (isDemoMode) return false
  // La ficha curada siempre gana: ya es informacion verificada.
  if (profile.verified) return false
  // Restos: no hay pagina de Wikipedia util para "COSMOS 2251 DEB".
  if (profile.type?.id === 'debris') return false
  // Miles de unidades identicas: la ficha de familia ya es mejor respuesta
  // que cualquier pagina individual que pudiera existir.
  if (profile.family) return false
  return true
}

/** Cache en memoria de la pestana: NORAD ID -> Promise<WikiEntry>. Incluye
 *  los negativos (`status: 'none'`), para no repetir la busqueda al
 *  reabrir el mismo satelite. Se pierde al recargar, que es correcto: un
 *  extracto cacheado indefinidamente en localStorage podria quedar
 *  desactualizado sin forma de saberlo. */
const cache = new Map()

/**
 * @param {string|number} noradId
 * @returns {Promise<WikiEntry>} `{status:'ok'|'none'|'error', lang?, title?, extract?, url?, thumbnailUrl?}`
 */
export function lookupByNorad(noradId) {
  const key = String(noradId)
  if (!cache.has(key)) {
    cache.set(
      key,
      performLookup(key).catch(() => ({ status: 'error' })),
    )
  }
  return cache.get(key)
}

async function fetchJson(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function performLookup(noradId) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    // 1. ¿Que item de Wikidata tiene este NORAD ID en P377?
    const searchUrl =
      `${WIKIDATA_API}?action=query&list=search&format=json&origin=*` +
      `&srsearch=${encodeURIComponent(`haswbstatement:P377=${noradId}`)}`
    const searchResult = await fetchJson(searchUrl, controller.signal)
    const qid = searchResult?.query?.search?.[0]?.title
    if (!qid) return { status: 'none' }

    // 2. De ese item, su enlace a Wikipedia (es, o en como respaldo).
    const entityUrl =
      `${WIKIDATA_API}?action=wbgetentities&format=json&origin=*` +
      `&ids=${qid}&props=sitelinks&sitefilter=eswiki|enwiki`
    const entityResult = await fetchJson(entityUrl, controller.signal)
    const sitelinks = entityResult?.entities?.[qid]?.sitelinks
    const esTitle = sitelinks?.eswiki?.title
    const enTitle = sitelinks?.enwiki?.title
    const lang = esTitle ? 'es' : enTitle ? 'en' : null
    const title = esTitle ?? enTitle
    if (!lang || !title) return { status: 'none' }

    // 3. El resumen de esa pagina.
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    const summary = await fetchJson(summaryUrl, controller.signal)
    if (summary?.type !== 'standard' || !summary?.extract || summary.extract.length < MIN_EXTRACT_LENGTH) {
      return { status: 'none' }
    }

    return {
      status: 'ok',
      lang,
      title: summary.title,
      extract: summary.extract,
      url: summary.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbnailUrl: summary.thumbnail?.source ?? null,
      wikidataId: qid,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
