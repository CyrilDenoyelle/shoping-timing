/**
 * Service OCR basé sur Tesseract.js.
 * Le JS de l’API est chargé à la demande ; le worker, le wasm et le modèle français
 * sont servis depuis public/tesseract/ (même origine) pour le cache hors ligne.
 */

import {
  ensureTesseractAssetsCached,
  tesseractAssetBase,
  tesseractCacheReady,
} from './tesseractAssets.js'

let tesseractPromise = null

function loadTesseract() {
  tesseractPromise ??= import('tesseract.js')
  return tesseractPromise
}

function formatError(error) {
  if (error == null) return 'erreur inconnue'
  if (typeof error === 'string') return error
  if (error.message) return error.message
  if (error.name) return error.name
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/**
 * Lit plusieurs passes avec un seul worker : le modèle français n'est chargé qu'une fois.
 * Chaque passe associe une image par photo à un mode de segmentation de page.
 *
 * @param {Array<{
 *   id: string,
 *   layout?: 'block' | 'column' | 'sparse',
 *   items: Array<{ id: number, source: File | HTMLCanvasElement }>,
 * }>} passes  layout : 'block' = bloc unique (PSM 6, défaut), 'column' = colonne (PSM 4), 'sparse' = texte épars (PSM 11)
 * @param {{
 *   onProgress?: (info: { passIndex: number, itemIndex: number, ratio: number }) => void,
 *   onResult?: (result: { passId: string, id: number, text: string, durationMs: number }) => void,
 * }} [callbacks]
 * @returns {Promise<Record<string, Array<{ id: number, text: string, durationMs: number }>>>}
 */
export async function recognizePasses(passes, { onProgress, onResult } = {}) {
  // Précharge worker + modèle sans bloquer sur les ~15 Mo de wasm.
  await ensureTesseractAssetsCached().catch((error) =>
    console.warn('[tesseract] préchargement', error),
  )

  if (!navigator.onLine && !(await tesseractCacheReady())) {
    throw new Error(
      'Moteur OCR indisponible hors ligne. Refais une lecture une fois connecté pour remplir le cache.',
    )
  }

  const { createWorker, PSM } = await loadTesseract()
  const pageSegModes = { block: PSM.SINGLE_BLOCK, column: PSM.SINGLE_COLUMN, sparse: PSM.SPARSE_TEXT }
  const assetBase = tesseractAssetBase()

  let current = { passIndex: 0, itemIndex: 0 }
  let worker
  try {
    worker = await createWorker('fra', undefined, {
      workerPath: `${assetBase}/worker.min.js`,
      corePath: assetBase,
      langPath: assetBase,
      logger: (message) => {
        if (message.status === 'recognizing text') {
          onProgress?.({ ...current, ratio: message.progress })
        }
      },
    })
  } catch (error) {
    const detail = formatError(error)
    throw new Error(
      navigator.onLine
        ? `Impossible de démarrer Tesseract (${detail})`
        : `Moteur OCR hors ligne (${detail}). Relance une lecture en ligne une fois, puis réessaie.`,
    )
  }

  try {
    const resultsByPass = {}
    for (let passIndex = 0; passIndex < passes.length; passIndex++) {
      const pass = passes[passIndex]
      await worker.setParameters({
        tessedit_pageseg_mode: pageSegModes[pass.layout ?? 'block'],
        preserve_interword_spaces: '1',
      })

      resultsByPass[pass.id] = []
      for (let itemIndex = 0; itemIndex < pass.items.length; itemIndex++) {
        current = { passIndex, itemIndex }
        const startedAt = performance.now()
        const { data } = await worker.recognize(pass.items[itemIndex].source)
        const result = {
          id: pass.items[itemIndex].id,
          text: data.text,
          durationMs: performance.now() - startedAt,
        }
        resultsByPass[pass.id].push(result)
        onResult?.({ passId: pass.id, ...result })
      }
    }
    return resultsByPass
  } catch (error) {
    throw new Error(`Lecture OCR interrompue (${formatError(error)})`)
  } finally {
    await worker.terminate()
  }
}
