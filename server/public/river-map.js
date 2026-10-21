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
    initSamplePins(map);
  }

  // ==========================================================
  // Sample location pins (view = public, edit = password protected)
  // The password is verified by the server on every write.
  // ==========================================================
  function initSamplePins(map) {
    const btn = document.getElementById('btnPinMode');
    const hint = document.getElementById('pinHint');
    const modal = document.getElementById('pinModal');
    const countEl = document.getElementById('pinCount');
    if (!btn || !modal) return;

    let password = null; // held in memory only; reload = locked again
    let editing = false;
    const markers = new Map(); // id -> { marker, pin }
    const SITE_LABELS = { UPSTREAM: 'Upstream', MIDSTREAM: 'Midstream', DOWNSTREAM: 'Downstream' };

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    async function api(method, url, body, pw) {
      const res = await fetch(url, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, pw ? { 'x-pin-password': pw } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
      return data;
    }

    function updateCount() {
      if (countEl) countEl.textContent = markers.size + (markers.size === 1 ? ' sample point' : ' sample points');
    }

    function popupHtml(pin) {
      const site = pin.site ? '<div class="pin-popup-site">' + esc(SITE_LABELS[pin.site] || pin.site) + '</div>' : '';
      const note = pin.note ? '<div class="pin-popup-note">' + esc(pin.note) + '</div>' : '';
      const del = editing ? '<button type="button" class="pill-btn pill-btn-danger pin-remove" data-id="' + esc(pin.id) + '">Remove pin</button>' : '';
      return '<div class="pin-popup"><strong>' + esc(pin.label) + '</strong>' + site + note +
        '<div class="pin-popup-coords">' + Number(pin.lat).toFixed(5) + ', ' + Number(pin.lng).toFixed(5) + '</div>' + del + '</div>';
    }

    function renderPin(pin) {
      if (markers.has(String(pin.id))) return;
      const el = document.createElement('div');
      el.className = 'sample-pin';
      el.title = pin.label;
      const popup = new maplibregl.Popup({ offset: 28, closeButton: true }).setHTML(popupHtml(pin));
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([pin.lng, pin.lat])
        .setPopup(popup)
        .addTo(map);
      markers.set(String(pin.id), { marker, pin, popup });
      updateCount();
    }

    function refreshPopups() {
      markers.forEach(({ pin, popup }) => popup.setHTML(popupHtml(pin)));
    }

    async function loadPins() {
      try {
        const pins = await api('GET', '/api/pins');
        pins.forEach(renderPin);
      } catch (err) {
        console.warn('Could not load pins:', err.message);
      }
      updateCount();
    }

    // ---- Modal helpers ----
    function openModal(html, onReady) {
      modal.innerHTML = '<div class="pin-modal-card">' + html + '</div>';
      modal.hidden = false;
      const first = modal.querySelector('input, select, button');
      if (first) first.focus();
      if (onReady) onReady(modal);
    }
    function closeModal() {
      modal.hidden = true;
      modal.innerHTML = '';
    }
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

    function askPassword() {
      openModal(
        '<h3>Enter password</h3><p>Editing sample pins is restricted.</p>' +
        '<form id="pinAuthForm"><input type="password" id="pinPwInput" placeholder="Password" autocomplete="off" required>' +
        '<div class="pin-modal-error" id="pinAuthError"></div>' +
        '<div class="pin-modal-actions"><button type="button" class="pill-btn pill-btn-ghost" data-close>Cancel</button>' +
        '<button type="submit" class="pill-btn pill-btn-primary">Unlock</button></div></form>',
        m => {
          m.querySelector('[data-close]').onclick = closeModal;
          m.querySelector('#pinAuthForm').onsubmit = async e => {
            e.preventDefault();
            const pw = m.querySelector('#pinPwInput').value;
            try {
              await api('POST', '/api/pins/auth', null, pw);
              password = pw;
              closeModal();
              setEditing(true);
            } catch (err) {
              m.querySelector('#pinAuthError').textContent = 'Incorrect password';
              m.querySelector('#pinPwInput').select();
            }
          };
        }
      );
    }

    function askPinDetails(lngLat) {
      openModal(
        '<h3>New sample point</h3><p>' + lngLat.lat.toFixed(5) + ', ' + lngLat.lng.toFixed(5) + '</p>' +
        '<form id="pinForm"><input type="text" id="pinLabel" placeholder="Label (e.g. Sample 1)" maxlength="80" required>' +
        '<select id="pinSite" required><option value="">Station (links readings to this location)</option><option value="UPSTREAM">Upstream</option>' +
        '<option value="MIDSTREAM">Midstream</option><option value="DOWNSTREAM">Downstream</option></select>' +
        '<input type="text" id="pinNote" placeholder="Note (optional)" maxlength="300">' +
        '<div class="pin-modal-error" id="pinFormError"></div>' +
        '<div class="pin-modal-actions"><button type="button" class="pill-btn pill-btn-ghost" data-close>Cancel</button>' +
        '<button type="submit" class="pill-btn pill-btn-primary">Save pin</button></div></form>',
        m => {
          m.querySelector('[data-close]').onclick = closeModal;
          m.querySelector('#pinForm').onsubmit = async e => {
            e.preventDefault();
            try {
              const pin = await api('POST', '/api/pins', {
                lat: lngLat.lat,
                lng: lngLat.lng,
                label: m.querySelector('#pinLabel').value.trim(),
                site: m.querySelector('#pinSite').value || null,
                note: m.querySelector('#pinNote').value.trim() || null
              }, password);
              renderPin(pin);
              closeModal();
            } catch (err) {
              if (/password/i.test(err.message)) { password = null; setEditing(false); }
              m.querySelector('#pinFormError').textContent = err.message;
            }
          };
        }
      );
    }

    function setEditing(on) {
      editing = on;
      btn.textContent = on ? 'Done editing' : 'Edit sample pins';
      btn.classList.toggle('pill-btn-primary', on);
      btn.classList.toggle('pill-btn-ghost', !on);
      if (hint) hint.hidden = !on;
      map.getCanvas().style.cursor = on ? 'crosshair' : '';
      refreshPopups();
    }

    btn.addEventListener('click', () => {
      if (editing) { setEditing(false); password = null; return; }
      askPassword();
    });

    map.on('click', e => {
      if (!editing) return;
      if (e.originalEvent.target.closest && e.originalEvent.target.closest('.sample-pin, .maplibregl-popup')) return;
      askPinDetails(e.lngLat);
    });

    // Remove button inside popups (event delegation)
    document.getElementById('riverMap').addEventListener('click', async e => {
      const rm = e.target.closest && e.target.closest('.pin-remove');
      if (!rm || !editing) return;
      const id = rm.getAttribute('data-id');
      if (!confirm('Remove this sample pin?')) return;
      try {
        await api('DELETE', '/api/pins/' + encodeURIComponent(id), null, password);
        const entry = markers.get(String(id));
        if (entry) { entry.marker.remove(); markers.delete(String(id)); }
        updateCount();
      } catch (err) {
        alert(err.message);
        if (/password/i.test(err.message)) { password = null; setEditing(false); }
      }
    });

    loadPins();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRiverMap);
  } else {
    initRiverMap();
  }
})();
