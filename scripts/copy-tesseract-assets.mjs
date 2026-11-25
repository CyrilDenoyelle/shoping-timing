/**
 * Copie le moteur Tesseract et le modèle français dans public/tesseract/
 * pour un usage hors ligne (servis par l’app, mis en cache par le service worker).
 *
 * Relancé après npm install et avant chaque build.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'tesseract')
const workerSrc = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js')
const coreDir = join(root, 'node_modules', 'tesseract.js-core')
/** Même modèle que le CDN par défaut de tesseract.js 7 (OEM LSTM). */
const LANG_URL =
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz'

if (!existsSync(workerSrc) || !existsSync(coreDir)) {
  console.warn('[copy-tesseract] tesseract.js absent : lance npm install.')
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
for (const name of readdirSync(dest)) {
  if (name === '.gitkeep' || name === 'fra.traineddata.gz') continue
  unlinkSync(join(dest, name))
}

copyFileSync(workerSrc, join(dest, 'worker.min.js'))

let coreCount = 0
for (const name of readdirSync(coreDir)) {
  if (!/^tesseract-core.*\.(js|wasm)$/.test(name)) continue
  copyFileSync(join(coreDir, name), join(dest, name))
  coreCount++
}

const langDest = join(dest, 'fra.traineddata.gz')
if (!existsSync(langDest)) {
  console.log('[copy-tesseract] Téléchargement de fra.traineddata.gz…')
  const response = await fetch(LANG_URL)
  if (!response.ok) {
    throw new Error(`Échec du téléchargement du modèle français (${response.status})`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(langDest))
}

console.log(`[copy-tesseract] ${coreCount + 1} fichiers moteur + modèle FR → public/tesseract/`)
