# Graphiques & stats — ShopingTiming

Notes sur les visualisations possibles pour la page stats, la stack Chart.js / vue-chartjs, et les bonnes pratiques observées ailleurs.

## Stack actuelle

- **Chart.js 4** — moteur de rendu (canvas, modulaire)
- **vue-chartjs 5** — composants Vue (`Bar`, `Line`, `Doughnut`, etc.)
- **Implémentation** : `src/components/PurchaseStatsContent.vue`
- **Données** : `src/utils/purchaseTimeline.js` (`collectPurchaseEvents`, `buildTimelineSeries`)

Chaque coche « acheté » alimente un événement avec date (`end`), liste, produit, quantité et unité.

---

## Ce qu’on utilise déjà

- **Barres horizontales** (`indexAxis: 'y'`) — une barre par bucket (jour / semaine / etc.)
- **Tooltip HTML externe** — détail scrollable, groupé par liste, badges quantité (2 kg, etc.)
- **Interaction tactile** — `interaction.mode: 'index'`, `axis: 'y'`, `intersect: false`
- **Thème CSS** — couleurs alignées sur les variables de l’app (`--accent`, etc.)
- **Hauteur dynamique** — le canvas s’adapte au nombre de périodes

---

## Ce que Chart.js sait faire (au-delà des barres)

| Capacité | Intérêt |
|----------|---------|
| Types multiples | Line, Area, Doughnut, Pie, Scatter, Bubble, Radar, PolarArea |
| Graphiques mixtes | Barres + courbe sur le même canvas |
| Empilement | Plusieurs séries (ex. une par liste) |
| Échelles | Linéaire, logarithmique, catégories, **temps** (avec adaptateur date) |
| Animations | Mise à jour fluide quand la période ou les données changent |
| Plugins | Annotations, dessin custom, zoom (via plugins tiers) |
| Tree-shaking | N’enregistrer que les composants utilisés (`ChartJS.register(...)`) |

---

## Ce qui se fait dans des apps similaires

### Listes de courses

Les apps « liste pure » (Bring!, etc.) privilégient la tâche (cocher, quantités, partage). Peu de graphiques natifs.

### Budget / habitudes (plus proche de nos stats)

- **Barres** — comparaisons par catégorie ou période
- **Courbes** — tendances dans le time
- **Donuts** — parts d’un total (avec peu de segments, ≤ ~5)
- **Heatmaps** — régularité (moins adapté aux quantités précises)

### Bonnes pratiques UX (data viz)

- Types **familiers** (barres, lignes) plutôt que graphiques exotiques
- **Baseline à zéro** pour les volumes
- **Trier** les séries quand ce n’est pas une échelle de dates fixe
- **Couleurs cohérentes** avec l’app ; ne pas compter sur la couleur seule (accessibilité)
- **Tooltips en complément** — l’essentiel doit rester lisible sans survol obligatoire
- **Cartes / sections** — une question par bloc (« tendance », « répartition », « détail »)
- **Filtres de période** — semaine, mois, tout

---

## Autres types Chart.js pertinents pour ShopingTiming

### Line / Area

- Évolution du **nombre d’achats** ou de la **somme des quantités** dans le temps
- Courbe lissée ou en escalier selon le rendu voulu

### Area empilée

- Une couche par **liste** — voir quelle liste domine sur la période

### Doughnut / Pie

- **Répartition** des achats ou unités par liste, ou top produits (regrouper le reste en « Autre »)

### Barres verticales

- Même logique qu’aujourd’hui, axe temps en X — pratique avec **peu de buckets** (ex. 12 mois)
- **Barres groupées** — comparer deux périodes côte à côte

### Scatter

- Un point par achat (date × quantité) — voir dispersion et gros achats isolés
- Attention au bruit si beaucoup de points ; filtrer par période

### Bubble

- Comme scatter avec **rayon = 3ᵉ dimension** (volume, diversité du jour, etc.)

### Radar / PolarArea

- Plus conceptuel (profil composite) — optionnel si on définit des indicateurs agrégés

---

## Pistes d’évolution (priorisées)

1. **Barres empilées par liste** — exploite `listName` sans changer le modèle de données
2. **Clic sur une barre → panneau détail** du bucket (stable sur mobile, complète le tooltip)
3. **Mix barres + courbe** — volume par période + tendance ou cumul
4. **Plugin annotation** — ligne de moyenne ou marqueur « aujourd’hui »
5. **Donut récap** — part par liste sur la période sélectionnée
6. **Échelle temps** — `chartjs-adapter-date-fns` si vue timeline continue

---

## Idées plugins / interactions

- **`chartjs-plugin-annotation`** — moyenne, seuil, repère temporel
- **Plugin maison** — surligner la dernière période ou la barre max (`afterDatasetsDraw`)
- **`onClick`** — drill-down vers le détail d’un bucket via `getElementsAtEventForMode`
- **Animations** — transition douce quand `periodId` ou `nowMs` change

---

## Références

- [Designing Charts — UX Collective](https://uxdesign.cc/designing-charts-principles-every-designer-should-know-5bd3969a0150)
- [Choosing the right chart — Medium](https://medium.com/design-bootcamp/choosing-the-right-chart-a-practical-guide-for-ux-designers-2ed6f4188d02)
- [Dashboard UX patterns — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Chart.js docs](https://www.chartjs.org/docs/latest/)
