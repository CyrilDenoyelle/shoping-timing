/**
 * Assets OCR servis depuis public/tesseract/ et mis en cache pour le hors-ligne.
 * Liste alignée sur scripts/copy-tesseract-assets.mjs.
 */

export const TESSERACT_ASSET_FILES = Object.freeze([
  'worker.min.js',
  'fra.traineddata.gz',
  'tesseract-core.wasm.js',
  'tesseract-core.wasm',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
  'tesseract-core-relaxedsimd.wasm.js',
  'tesseract-core-relaxedsimd.wasm',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm',
  'tesseract-core.js',
  'tesseract-core-simd.js',
  'tesseract-core-lstm.js',
  'tesseract-core-simd-lstm.js',
  'tesseract-core-relaxedsimd.js',
  'tesseract-core-relaxedsimd-lstm.js',
])

/** Fichiers indispensables avant de lancer une lecture. */
export const TESSERACT_REQUIRED_FILES = Object.freeze(['worker.min.js', 'fra.traineddata.gz'])

export const TESSERACT_CACHE = 'tesseract-assets'

/** Dossier des assets OCR, sans slash final. */
export function tesseractAssetBase() {
  return new URL(`${import.meta.env.BASE_URL}tesseract`, globalThis.location.href).href.replace(/\/$/, '')
}

/** Attend que le service worker contrôle la page (prod / preview). */
export async function waitForServiceWorker(timeoutMs = 2500) {
  if (!('serviceWorker' in navigator)) return false
  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  } catch {
    return false
  }
  if (navigator.serviceWorker.controller) return true
  return new Promise((resolve) => {
    const done = (ok) => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange)
      clearTimeout(timer)
      resolve(ok)
    }
    const onChange = () => done(true)
    const timer = setTimeout(() => done(Boolean(navigator.serviceWorker.controller)), timeoutMs)
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
  })
}

async function putInCache(cache, url) {
  if (await cache.match(url)) return true
  const response = await fetch(url, { credentials: 'same-origin' })
  if (!response.ok) return false
  await cache.put(url, response.clone())
  return true
}

/**
 * Met en cache les fichiers listés. Ne bloque pas la lecture sur les wasm optionnels.
 * @param {string[]} files
 */
export async function cacheTesseractFiles(files = TESSERACT_ASSET_FILES) {
  if (!('caches' in globalThis)) {
    await Promise.all(
      files.map((file) =>
        fetch(`${tesseractAssetBase()}/${file}`, { credentials: 'same-origin' }).catch(() => null),
      ),
    )
    return
  }
  const base = tesseractAssetBase()
  const cache = await caches.open(TESSERACT_CACHE)
  await Promise.all(
    files.map(async (file) => {
      const url = `${base}/${file}`
      try {
        await putInCache(cache, url)
      } catch (error) {
        console.warn('[tesseract] cache', file, error)
      }
    }),
  )
}

/** Précharge worker + modèle (rapide), puis le reste en arrière-plan. */
export async function ensureTesseractAssetsCached() {
  await waitForServiceWorker()
  await cacheTesseractFiles(TESSERACT_REQUIRED_FILES)
  // Les variantes wasm (~15 Mo) : hors du chemin critique de la lecture.
  cacheTesseractFiles(TESSERACT_ASSET_FILES).catch((error) =>
    console.warn('[tesseract] cache complet', error),
  )
}

export async function tesseractCacheReady() {
  if (!('caches' in globalThis)) return false
  const cache = await caches.open(TESSERACT_CACHE)
  const base = tesseractAssetBase()
  const worker = await cache.match(`${base}/worker.min.js`)
  const lang = await cache.match(`${base}/fra.traineddata.gz`)
  return Boolean(worker && lang)
}
