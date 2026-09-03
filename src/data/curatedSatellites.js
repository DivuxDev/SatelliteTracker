/**
 * curatedSatellites
 * ---------------------------------------------------------------------------
 * Fichas escritas a mano para objetos concretos, indexadas por su ID NORAD
 * (inmutable, a diferencia del nombre que Celestrak puede reescribir con el
 * tiempo). Es informacion VERIFICADA: quien la use puede fiarse de ella igual
 * que de los datos numericos del TLE.
 *
 * Vivia mezclada con la logica de clasificacion en satelliteProfileService.js;
 * se separa aqui porque el contenido crece con el tiempo (habra muchas mas
 * entradas que lineas de codigo que las consumen) y mezclar las dos cosas
 * hacia dificil de leer tanto el contenido como la logica.
 *
 * Cada NORAD ID de esta lista se verifico contra Wikidata (propiedad P377,
 * "Satellite Catalog Number") antes de anadirse: no es un numero de memoria,
 * es el mismo mecanismo que usa `wikiLookupService.js` para el resto del
 * catalogo. Cuando un satelite de aqui tambien tiene pagina en Wikipedia, esa
 * consulta en vivo ni siquiera se dispara (ver `isWikiEligible`): la ficha
 * propia siempre gana.
 *
 * `alias` alimenta el buscador: son los nombres por los que la gente busca de
 * verdad, no como esten escritos en el TLE.
 */
export const CURATED = {
  25544: {
    type: 'station',
    alias: ['ISS', 'Estacion Espacial Internacional', 'International Space Station'],
    summary:
      'La Estacion Espacial Internacional: el mayor objeto construido por el ser humano en orbita, habitado de forma continua desde noviembre de 2000.',
    facts: [
      'Unos 109 m de envergadura y en torno a 420 t.',
      'Da una vuelta a la Tierra cada 90 minutos: 16 amaneceres al dia.',
      'Es el objeto artificial mas brillante del cielo nocturno; se ve a simple vista sin instrumentos.',
    ],
  },
  49044: {
    type: 'station',
    alias: ['Nauka', 'MLM', 'Modulo Nauka'],
    summary:
      'Nauka, el modulo de laboratorio multipropos ito ruso de la ISS. Acoplado en 2021 tras mas de una decada de retrasos, sustituyo funciones del antiguo modulo Pirs.',
    facts: ['Aporta espacio de investigacion adicional, un nuevo brazo robotico europeo y una litera mas para la tripulacion.'],
  },
  20580: {
    type: 'science',
    alias: ['Hubble', 'HST', 'Telescopio Espacial Hubble'],
    summary:
      'El telescopio espacial Hubble. Observa en visible, ultravioleta e infrarrojo cercano desde 1990, por encima de la atmosfera que emborrona las imagenes desde tierra.',
    facts: [
      'Espejo primario de 2,4 m.',
      'Fue reparado y mejorado en cinco misiones tripuladas del transbordador.',
      'Su orbita baja decae poco a poco; sin reimpulso acabara reentrando.',
    ],
  },
  25867: {
    type: 'science',
    alias: ['Chandra', 'CXO', 'Observatorio Chandra'],
    summary:
      'El Observatorio de rayos X Chandra, en orbita desde 1999. A diferencia del Hubble no orbita cerca de la Tierra: su orbita muy eliptica lo lleva a un tercio de la distancia a la Luna.',
    facts: ['Observa fuentes de rayos X de alta energia: agujeros negros, restos de supernova, cumulos de galaxias.'],
  },
  43435: {
    type: 'science',
    alias: ['TESS', 'Transiting Exoplanet Survey Satellite'],
    summary:
      'TESS, el telescopio de la NASA dedicado a buscar exoplanetas por transito: detecta la caida minuscula de brillo de una estrella cuando un planeta pasa por delante.',
    facts: ['Ha encontrado varios miles de candidatos a exoplaneta desde 2018, cubriendo casi todo el cielo.'],
  },
  48274: {
    type: 'station',
    alias: ['Tiangong', 'CSS', 'Estacion espacial china', 'Tianhe'],
    summary:
      'Modulo Tianhe, nucleo de la estacion espacial china Tiangong, habitada de forma permanente desde 2021.',
    facts: ['Tercera estacion habitada de forma continua de la historia, tras Mir y la ISS.'],
  },
  53239: {
    type: 'station',
    alias: ['Wentian'],
    summary:
      'Wentian, primer modulo de laboratorio de Tiangong, acoplado en 2022. Aporta experimentos cientificos y una esclusa adicional para actividad extravehicular.',
    facts: [],
  },
  54216: {
    type: 'station',
    alias: ['Mengtian'],
    summary:
      'Mengtian, segundo modulo de laboratorio de Tiangong, acoplado a finales de 2022. Con el, la estacion china alcanzo su configuracion basica en forma de "T".',
    facts: [],
  },
  25994: {
    type: 'earth',
    alias: ['Terra', 'EOS AM-1'],
    summary:
      'Terra, buque insignia del programa de observacion terrestre de la NASA. Lleva el instrumento MODIS, que fotografia toda la superficie del planeta cada uno o dos dias.',
    facts: ['En orbita heliosincrona: cruza el ecuador siempre a la misma hora solar local.'],
  },
  27424: {
    type: 'earth',
    alias: ['Aqua'],
    summary:
      'Aqua, gemelo de Terra centrado en el ciclo del agua: vapor, nubes, precipitacion, hielo y humedad del suelo.',
    facts: [],
  },
  27386: {
    type: 'earth',
    alias: ['Envisat'],
    summary:
      'Envisat, satelite de observacion terrestre de la ESA. Se perdio contacto con el de forma abrupta en 2012 tras una decada de servicio; sigue en orbita, inactivo, como objeto de seguimiento.',
    facts: ['Con casi 8 t fue, en su momento, el mayor satelite civil de observacion terrestre jamas lanzado.'],
  },
  40697: {
    type: 'earth',
    alias: ['Sentinel-2A'],
    summary:
      'Sentinel-2A, satelite optico del programa europeo Copernicus. Fotografia la superficie terrestre en varias bandas espectrales para agricultura, bosques y cartografia de uso del suelo.',
    facts: [],
  },
  39634: {
    type: 'earth',
    alias: ['Sentinel-1A'],
    summary:
      'Sentinel-1A, satelite de radar (SAR) del programa Copernicus. A diferencia de un sensor optico, ve de noche y a traves de las nubes, util para vigilar inundaciones, hielo marino o subsidencia del terreno.',
    facts: [],
  },
  49260: {
    type: 'earth',
    alias: ['Landsat 9'],
    summary:
      'Landsat 9, el mas reciente de una serie que empezo en 1972 y constituye el registro continuo mas largo de imagenes de satelite de la superficie terrestre.',
    facts: [],
  },
  43613: {
    type: 'science',
    alias: ['ICESat-2', 'ICESat 2'],
    summary:
      'ICESat-2, mide la altura del hielo polar y de la vegetacion con un altimetro laser de altisima precision, para seguir la perdida de hielo de Groenlandia y la Antartida.',
    facts: [],
  },
  43476: {
    type: 'science',
    alias: ['GRACE-FO', 'GRACE-FO 1'],
    summary:
      'GRACE-FO, par de satelites gemelos que miden variaciones diminutas en la distancia entre ellos para cartografiar el campo gravitatorio terrestre, y de ahi inferir cambios de masa: agua subterranea, hielo, oceanos.',
    facts: [],
  },
  43013: {
    type: 'weather',
    alias: ['NOAA-20', 'JPSS-1'],
    summary:
      'NOAA-20, satelite meteorologico polar. Alimenta los modelos de prediccion numerica con sondeos de temperatura y humedad de toda la columna atmosferica.',
    facts: [],
  },
  36411: {
    type: 'weather',
    alias: ['GOES-15'],
    summary:
      'Serie GOES: meteorologia desde orbita geoestacionaria. Al girar a la vez que la Tierra vigila siempre el mismo hemisferio, que es lo que permite ver moverse un huracan en bucle.',
    facts: [],
  },
  51850: {
    type: 'weather',
    alias: ['GOES-18', 'GOES-West'],
    summary:
      'GOES-18, satelite meteorologico geoestacionario que opera como "GOES-West", vigilando el Pacifico oriental y la costa oeste de Norteamerica.',
    facts: [],
  },
}
