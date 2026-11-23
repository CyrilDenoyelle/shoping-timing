/** Couleurs de l'app lues sur les variables CSS (suivent le thème clair / sombre). */
export function readChartTheme() {
  const style = getComputedStyle(document.documentElement)
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback
  return {
    muted: read('--color-text-muted', '#888'),
    text: read('--color-text', '#111'),
    border: read('--color-border', '#e0e0e0'),
    accent: read('--accent', 'hsla(160, 100%, 37%, 1)'),
    accentSoft: read('--accent-soft', 'hsla(160, 100%, 37%, 0.15)'),
    danger: read('--danger', '#e74c3c'),
  }
}
