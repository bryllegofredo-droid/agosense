/**
 * Digos River map (OpenStreetMap data via waterwaymap.org geometry)
 * Mirrors the waterwaymap.org river view, plus an animated "flowing water" effect.
 */
(function () {
  const BBOX = [125.318655, 6.720747, 125.393655, 6.935402]; // [west, south, east, north]

  function initRiverMap() {
    const el = document.getElementById('riverMap');
    if (!el || typeof maplibregl === 'undefined') return;

    const map = new maplibregl.Map({
      container: 'riverMap',
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osmcarto: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>'
          },
          river: { type: 'geojson', data: 'digos_river.geojson' }
        },
        layers: [
          { id: 'osmcarto', type: 'raster', source: 'osmcarto' },
          {
            id: 'river-glow', type: 'line', source: 'river',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#38bdf8', 'line-width': 14, 'line-opacity': 0.25, 'line-blur': 6 }
          },
          {
            id: 'river-casing', type: 'line', source: 'river',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#0a2540', 'line-width': 6 }
          },
          {
            id: 'river-line', type: 'line', source: 'river',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#0ea5e9', 'line-width': 4 }
          },
          {
            id: 'river-flow', type: 'line', source: 'river',
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.9, 'line-dasharray': [0, 4, 3] }
          }
        ]
      },
      bounds: BBOX,
      fitBoundsOptions: { padding: 40 }
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Flowing water animation: slide a dash pattern along the river line.
    const dashSteps = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5],
      [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2],
      [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]
    ];
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let step = 0;
      function animate(ts) {
        const next = Math.floor((ts / 70) % dashSteps.length);
        if (next !== step && map.getLayer('river-flow')) {
          map.setPaintProperty('river-flow', 'line-dasharray', dashSteps[next]);
          step = next;
        }
        requestAnimationFrame(animate);
      }
      map.on('load', () => requestAnimationFrame(animate));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRiverMap);
  } else {
    initRiverMap();
  }
})();
