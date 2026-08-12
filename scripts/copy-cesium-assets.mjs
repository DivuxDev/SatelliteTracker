/**
 * Copia los recursos estaticos de CesiumJS a public/cesiumStatic.
 *
 * CesiumJS carga Workers, Assets, Widgets y ThirdParty por HTTP en tiempo de
 * ejecucion, no como imports del bundler. Colocarlos en `public/` es la via mas
 * fiable: Vite sirve ese directorio tal cual en desarrollo y lo copia a `dist/`
 * en el build, con el mismo URL en ambos casos (`/cesiumStatic/...`), que es lo
 * que declara `window.CESIUM_BASE_URL` en index.html.
 *
 * El directorio es generado: esta en .gitignore y se regenera con `npm run dev`
 * o `npm run build` (ganchos predev / prebuild).
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', 'cesium', 'Build', 'Cesium')
const target = join(root, 'public', 'cesiumStatic')

const FOLDERS = ['Workers', 'Assets', 'Widgets', 'ThirdParty']

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

if (!(await exists(source))) {
  console.error(
    `[cesium] No se encuentra ${source}.\n` +
      '        Ejecuta `npm install` antes de arrancar la aplicacion.',
  )
  process.exit(1)
}

// Si ya estan copiados no rehacemos el trabajo: son decenas de MB y se
// ejecutaria en cada `npm run dev`.
const upToDate = await Promise.all(FOLDERS.map((folder) => exists(join(target, folder))))
if (upToDate.every(Boolean) && !process.argv.includes('--force')) {
  process.exit(0)
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })

for (const folder of FOLDERS) {
  await cp(join(source, folder), join(target, folder), { recursive: true })
}

console.log(`[cesium] Recursos copiados a public/cesiumStatic (${FOLDERS.join(', ')})`)
