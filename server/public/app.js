/**
 * =====================================================================================
 * Agosense Frontend Controller (Vanilla JavaScript)
 * Minimalist, Icon-free, High-Performance Telemetry & WAWQI Visualizer
 * =====================================================================================
 */

// Application State
const state = {
  activeMetric: "wawqi",
  feedFilter: "all",
  pageSize: "50",
  historyData: [],
  stats: {},
  pollInterval: null
};

// DOM Elements
const elements = {
  btnSimulate: document.getElementById('btnSimulate'),
  btnClearSimulated: document.getElementById('btnClearSimulated'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  feedFilterBtns: document.querySelectorAll('.feed-filter-btn'),
  feedPageSize: document.getElementById('feedPageSize'),
  btnFilterWawqi: document.getElementById('btnFilterWawqi'),
  btnFilterParams: document.getElementById('btnFilterParams'),
  lastUpdatedLabel: document.getElementById('lastUpdatedLabel'),
  statTotalReadings: document.getElementById('statTotalReadings'),
  statComplianceRate: document.getElementById('statComplianceRate'),
  
  // Hero WAWQI
  heroWawqiScore: document.getElementById('heroWawqiScore'),
  wawqiClassBadge: document.getElementById('wawqiClassBadge'),
  wawqiDesc: document.getElementById('wawqiDesc'),
  scaleIndicatorBar: document.getElementById('scaleIndicatorBar'),
  dominantParamName: document.getElementById('dominantParamName'),
  dominantParamPct: document.getElementById('dominantParamPct'),

  // Parameter Numbers
  valPh: document.getElementById('valPh'),
  valTemp: document.getElementById('valTemp'),
  valTurb: document.getElementById('valTurb'),
  valTds: document.getElementById('valTds'),

  // Quality Ratings
  qPhVal: document.getElementById('qPhVal'),
  qTempVal: document.getElementById('qTempVal'),
  qTurbVal: document.getElementById('qTurbVal'),
  qTdsVal: document.getElementById('qTdsVal'),

  // Status Badges
  badgePhStatus: document.getElementById('badgePhStatus'),
  badgeTempStatus: document.getElementById('badgeTempStatus'),
  badgeTurbStatus: document.getElementById('badgeTurbStatus'),
  badgeTdsStatus: document.getElementById('badgeTdsStatus'),

  // Mini progress bars
  barPh: document.getElementById('barPh'),
  barTemp: document.getElementById('barTemp'),
  barTurb: document.getElementById('barTurb'),
  barTds: document.getElementById('barTds'),

  // Tables & Feeds
  telemetryFeedBody: document.getElementById('telemetryFeedBody'),
  feedCounter: document.getElementById('feedCounter'),
  breakdownLegend: document.getElementById('breakdownLegend'),

  // Node Hardware Telemetry
  nodeBatteryVal: document.getElementById('nodeBatteryVal'),
  nodeBatteryPct: document.getElementById('nodeBatteryPct'),
  nodeRssiVal: document.getElementById('nodeRssiVal'),
  nodeSnrVal: document.getElementById('nodeSnrVal'),
  nodePdrVal: document.getElementById('nodePdrVal'),
  nodeLossVal: document.getElementById('nodeLossVal')
};

// Chart.js Instances
let trendChartInstance = null;
let breakdownChartInstance = null;

// ==========================================
// 1. INITIALIZATION & SETUP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  bindEvents();
  fetchDashboardData();
  
  // Continuous telemetry polling every 3 seconds
  state.pollInterval = setInterval(fetchDashboardData, 3000);
});

function bindEvents() {
  // Trend Metric Toggle (WAWQI vs 4 Parameters)
  elements.btnFilterWawqi.addEventListener('click', () => {
    elements.btnFilterWawqi.classList.add('active');
    elements.btnFilterParams.classList.remove('active');
    state.activeMetric = "wawqi";
    updateTrendChart();
  });

  elements.btnFilterParams.addEventListener('click', () => {
    elements.btnFilterParams.classList.add('active');
    elements.btnFilterWawqi.classList.remove('active');
    state.activeMetric = "parameters";
    updateTrendChart();
  });

  // Simulate Ingest Button
  elements.btnSimulate.addEventListener('click', async () => {
    elements.btnSimulate.disabled = true;
    elements.btnSimulate.textContent = "Simulating...";

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      await res.json();
      await fetchDashboardData();
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setTimeout(() => {
        elements.btnSimulate.disabled = false;
        elements.btnSimulate.textContent = "Simulate Ingest";
      }, 400);
    }
  });

  // Purge Simulated Test Data Button
  if (elements.btnClearSimulated) {
    elements.btnClearSimulated.addEventListener('click', async () => {
      const confirmed = confirm(
        "Are you sure you want to purge all simulated test packets?\n\nThis permanently deletes test data from the database and leaves only authentic field sensor records."
      );
      if (!confirmed) return;

      elements.btnClearSimulated.disabled = true;
      elements.btnClearSimulated.textContent = "Purging...";

      try {
        const res = await fetch('/api/clear-simulated', { method: 'POST' });
        const result = await res.json();
        alert(result.message || 'Simulated records purged successfully.');
        await fetchDashboardData();
      } catch (err) {
        console.error("Error clearing simulated data:", err);
        alert("Failed to clear simulated records: " + err.message);
      } finally {
        elements.btnClearSimulated.disabled = false;
        elements.btnClearSimulated.textContent = "Purge Test Data";
      }
    });
  }

  // Feed Filter Toggles (All / Real / Simulated)
  elements.feedFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.feedFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.feedFilter = btn.getAttribute('data-filter') || 'all';
      renderFeedTable();
      updateTrendChart();
    });
  });

  // Export CSV (Respects current filter)
  elements.btnExportCSV.addEventListener('click', () => {
    window.location.href = `/api/export/csv?filter=${state.feedFilter}`;
  });

  // Feed Page Size Selector
  if (elements.feedPageSize) {
    elements.feedPageSize.addEventListener('change', (e) => {
      state.pageSize = e.target.value;
      renderFeedTable();
    });
  }

  // Permanent Delete Single Packet Event Delegation
  if (elements.telemetryFeedBody) {
    elements.telemetryFeedBody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-delete-packet');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const seq = btn.getAttribute('data-seq');
      if (!id) return;

      const confirmed = confirm(`Permanently delete packet #${seq} (ID: ${id}) from the database?\n\nThis will remove it from Supabase and local storage.`);
      if (!confirmed) return;

      btn.disabled = true;
      btn.style.opacity = '0.3';

      try {
        const res = await fetch(`/api/telemetry/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) {
          state.historyData = state.historyData.filter(item => item.id !== id);
          renderDashboard();
        } else {
          const err = await res.json();
          alert(`Failed to delete packet: ${err.error || 'Server error'}`);
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      } catch (err) {
        alert(`Network error: ${err.message}`);
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });
  }
}

// ==========================================
// 2. DATA FETCHING
// ==========================================
async function fetchDashboardData() {
  try {
    const [historyRes, statsRes] = await Promise.all([
      fetch('/api/history?limit=250'),
      fetch('/api/stats')
    ]);

    state.historyData = await historyRes.json();
    state.stats = await statsRes.json();

    renderDashboard();
  } catch (err) {
    console.error("Error fetching telemetry data:", err);
  }
}

// ==========================================
// 3. UI RENDERING
// ==========================================
function renderDashboard() {
  renderHardwareTelemetry();
  renderSummaryStats();
  renderHeroCard();
  renderSensorCards();
  renderFeedTable();
  updateTrendChart();
  updateBreakdownChart();
}

function getActiveRecord() {
  return state.historyData[0] || null;
}

function renderHardwareTelemetry() {
  const latest = state.historyData[0] || null;
  if (!latest) {
    if (elements.nodeBatteryVal) elements.nodeBatteryVal.textContent = "-- V";
    if (elements.nodeBatteryPct) elements.nodeBatteryPct.textContent = "(--%)";
    if (elements.nodeRssiVal) elements.nodeRssiVal.textContent = "-- dBm";
    if (elements.nodeSnrVal) elements.nodeSnrVal.textContent = "SNR: -- dB";
    if (elements.nodePdrVal) elements.nodePdrVal.textContent = "--% PDR";
    if (elements.nodeLossVal) elements.nodeLossVal.textContent = "0 lost";
    return;
  }

  const batt = latest.batt_v !== undefined ? Number(latest.batt_v) : 5.0;
  if (elements.nodeBatteryVal) {
    elements.nodeBatteryVal.textContent = `${batt.toFixed(2)}V`;
  }
  if (elements.nodeBatteryPct) {
    if (batt >= 4.7 && batt <= 5.5) {
      elements.nodeBatteryPct.textContent = `(5V Buck Regulated)`;
    } else if (batt >= 6.0) {
      // 2S battery pack (6.0V empty - 8.4V full)
      const pct2s = Math.min(100, Math.max(0, Math.round(((batt - 6.0) / (8.4 - 6.0)) * 100)));
      elements.nodeBatteryPct.textContent = `(${pct2s}% 2S Pack)`;
    } else {
      // Standard 1S LiPo (3.3V empty - 4.2V full)
      const pct = Math.min(100, Math.max(0, Math.round(((batt - 3.3) / (4.2 - 3.3)) * 100)));
      elements.nodeBatteryPct.textContent = `(${pct}% LiPo)`;
    }
  }

  if (elements.nodeRssiVal) {
    elements.nodeRssiVal.textContent = latest.rssi ? `${latest.rssi} dBm` : "-68 dBm";
  }
  if (elements.nodeSnrVal) {
    const snrVal = latest.snr !== undefined ? latest.snr : 8.5;
    const sign = snrVal > 0 ? '+' : '';
    elements.nodeSnrVal.textContent = `SNR: ${sign}${snrVal.toFixed(1)} dB`;
  }
  if (elements.nodePdrVal) {
    elements.nodePdrVal.textContent = `${latest.pdr !== undefined ? latest.pdr.toFixed(1) : '98.5'}% PDR`;
  }
  if (elements.nodeLossVal) {
    elements.nodeLossVal.textContent = `${latest.packet_loss !== undefined ? latest.packet_loss : 0} lost`;
  }
}

function renderSummaryStats() {
  elements.statTotalReadings.textContent = state.stats.count || 0;
  
  if (state.stats.complianceRates) {
    const rates = state.stats.complianceRates;
    const avg = ((rates.pH + rates.temperature + rates.turbidity + rates.tds) / 4).toFixed(0);
    elements.statComplianceRate.textContent = `${avg}%`;
  } else {
    elements.statComplianceRate.textContent = `--%`;
  }

  const activeRec = getActiveRecord();
  if (activeRec) {
    const timeStr = new Date(activeRec.timestamp).toLocaleTimeString();
    elements.lastUpdatedLabel.textContent = `LAST INGEST: ${timeStr} • STATION: Digos River`;
  } else {
    elements.lastUpdatedLabel.textContent = `Awaiting incoming telemetry packets...`;
  }
}

function renderHeroCard() {
  const record = getActiveRecord();

  if (!record) {
    elements.heroWawqiScore.textContent = "--";
    elements.wawqiClassBadge.textContent = "STANDBY";
    elements.wawqiClassBadge.style.color = "var(--text-muted)";
    elements.wawqiClassBadge.style.borderColor = "var(--border-subtle)";
    elements.wawqiClassBadge.style.background = "transparent";
    elements.scaleIndicatorBar.style.width = "0%";
    elements.wawqiDesc.textContent = "No telemetry received for this selection. Power on the field node or simulate ingest.";
    elements.dominantParamName.textContent = "--";
    elements.dominantParamPct.textContent = "(--%)";
    return;
  }

  const score = record.wawqi;
  elements.heroWawqiScore.textContent = score.toFixed(1);
  elements.wawqiClassBadge.textContent = record.classification;
  elements.wawqiClassBadge.style.color = record.classColor;
  elements.wawqiClassBadge.style.borderColor = record.classColor;
  elements.wawqiClassBadge.style.background = `${record.classColor}15`;

  // Scale bar width (max capped at 120 index for full width)
  const pct = Math.min(100, (score / 120) * 100);
  elements.scaleIndicatorBar.style.width = `${pct}%`;
  elements.scaleIndicatorBar.style.backgroundColor = record.classColor;

  let desc = "";
  if (score <= 25) {
    desc = "Pristine water quality (Class Excellent). Completely compliant with all designated water uses.";
  } else if (score <= 50) {
    desc = "Good river quality. Complies with core ecological thresholds and normal freshwater standards.";
  } else if (score <= 75) {
    desc = "Moderate pollution level (Class Poor). Physical or chemical parameters show clear anthropogenic stress.";
  } else if (score <= 100) {
    desc = "Very Poor water quality. Severe ecological degradation; unsuitable for domestic supply.";
  } else {
    desc = "Critical contamination (Unfit for Drinking). Public health thresholds exceeded.";
  }
  elements.wawqiDesc.textContent = desc;

  elements.dominantParamName.textContent = record.dominantParameter;
  elements.dominantParamPct.textContent = `(${record.dominantContributionPct}% of score)`;
}

function renderSensorCards() {
  const record = getActiveRecord();
  if (!record) {
    // Reset to standby state
    elements.valPh.textContent = "--";
    elements.qPhVal.textContent = "Q: --";
    elements.badgePhStatus.textContent = "STANDBY";
    elements.badgePhStatus.className = "status-pill";
    elements.barPh.style.width = "0%";

    elements.valTemp.textContent = "--";
    elements.qTempVal.textContent = "Q: --";
    elements.badgeTempStatus.textContent = "STANDBY";
    elements.badgeTempStatus.className = "status-pill";
    elements.barTemp.style.width = "0%";

    elements.valTurb.textContent = "--";
    elements.qTurbVal.textContent = "Q: --";
    elements.badgeTurbStatus.textContent = "STANDBY";
    elements.badgeTurbStatus.className = "status-pill";
    elements.barTurb.style.width = "0%";

    elements.valTds.textContent = "--";
    elements.qTdsVal.textContent = "Q: --";
    elements.badgeTdsStatus.textContent = "STANDBY";
    elements.badgeTdsStatus.className = "status-pill";
    elements.barTds.style.width = "0%";
    return;
  }

  // 1. pH
  elements.valPh.textContent = record.ph.toFixed(2);
  elements.qPhVal.textContent = `Q: ${record.qualityRatings ? record.qualityRatings.pH : '--'}`;
  const phPass = record.compliance ? record.compliance.pH : true;
  elements.badgePhStatus.textContent = phPass ? "NORMAL" : "ALERT";
  elements.badgePhStatus.className = `status-pill ${phPass ? 'status-pass' : 'status-fail'}`;
  elements.barPh.style.width = `${Math.min(100, (record.ph / 14) * 100)}%`;

  // 2. Temperature
  elements.valTemp.textContent = record.temp.toFixed(1);
  elements.qTempVal.textContent = `Q: ${record.qualityRatings ? record.qualityRatings.temperature : '--'}`;
  const tempPass = record.compliance ? record.compliance.temperature : true;
  elements.badgeTempStatus.textContent = tempPass ? "NORMAL" : "ALERT";
  elements.badgeTempStatus.className = `status-pill ${tempPass ? 'status-pass' : 'status-fail'}`;
  elements.barTemp.style.width = `${Math.min(100, (record.temp / 45) * 100)}%`;

  // 3. Turbidity
  elements.valTurb.textContent = record.turbidity.toFixed(1);
  elements.qTurbVal.textContent = `Q: ${record.qualityRatings ? record.qualityRatings.turbidity : '--'}`;
  const turbPass = record.compliance ? record.compliance.turbidity : true;
  elements.badgeTurbStatus.textContent = turbPass ? "NORMAL" : "ALERT";
  elements.badgeTurbStatus.className = `status-pill ${turbPass ? 'status-pass' : 'status-fail'}`;
  elements.barTurb.style.width = `${Math.min(100, (record.turbidity / 25) * 100)}%`;

  // 4. TDS
  elements.valTds.textContent = record.tds.toFixed(0);
  elements.qTdsVal.textContent = `Q: ${record.qualityRatings ? record.qualityRatings.tds : '--'}`;
  const tdsPass = record.compliance ? record.compliance.tds : true;
  elements.badgeTdsStatus.textContent = tdsPass ? "NORMAL" : "ALERT";
  elements.badgeTdsStatus.className = `status-pill ${tdsPass ? 'status-pass' : 'status-fail'}`;
  elements.barTds.style.width = `${Math.min(100, (record.tds / 800) * 100)}%`;
}

function renderFeedTable() {
  let filtered = state.historyData;
  if (state.feedFilter === 'real') {
    filtered = filtered.filter(r => !r.is_simulated);
  } else if (state.feedFilter === 'simulated') {
    filtered = filtered.filter(r => Boolean(r.is_simulated));
  }

  const displayLimit = state.pageSize === 'all'
    ? filtered.length
    : (parseInt(state.pageSize, 10) || 50);

  const displayCount = Math.min(displayLimit, filtered.length);
  elements.feedCounter.textContent = displayLimit < filtered.length
    ? `Showing ${displayCount} of ${filtered.length} packets`
    : `${filtered.length} packets logged`;

  elements.telemetryFeedBody.innerHTML = "";

  if (filtered.length === 0) {
    const emptyMsg = state.feedFilter === 'real'
      ? "No authentic LoRa hardware packets received yet. Field node is offline / awaiting first transmission."
      : state.feedFilter === 'simulated'
        ? "No simulated packets in database."
        : "Database is completely empty. Hardware standby awaiting field telemetry.";

    elements.telemetryFeedBody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align: center; color: var(--text-muted); padding: 2.5rem 1rem; font-size: 0.85rem;">
          ${emptyMsg}
        </td>
      </tr>
    `;
    return;
  }

  filtered.slice(0, displayLimit).forEach(r => {
    const tr = document.createElement('tr');
    const timeStr = new Date(r.timestamp).toLocaleTimeString();
    const battVal = r.batt_v !== undefined ? Number(r.batt_v) : 5.0;
    const battStr = battVal >= 4.7 && battVal <= 5.5
      ? `${battVal.toFixed(2)}V (Buck)`
      : battVal >= 6.0
        ? `${battVal.toFixed(2)}V (2S)`
        : `${battVal.toFixed(2)}V`;

    // Explicitly identify real LoRa hardware packets by RF telemetry (RSSI) or verified hardware flag
    const isRealLoRa = (!r.is_simulated || r.is_simulated === false) || (r.rssi !== null && r.rssi !== undefined);
    const sourceBadge = isRealLoRa
      ? `<span class="badge-source-real">REAL LORA</span>`
      : `<span class="badge-source-sim">SIMULATED</span>`;

    tr.innerHTML = `
      <td style="font-family:var(--font-mono); font-size:0.75rem;">${timeStr}</td>
      <td style="font-family:var(--font-mono); font-weight:600;">#${r.seq}</td>
      <td>${sourceBadge}</td>
      <td>${r.ph.toFixed(2)}</td>
      <td>${r.temp.toFixed(1)}</td>
      <td>${r.turbidity.toFixed(1)}</td>
      <td>${r.tds.toFixed(0)}</td>
      <td><strong style="color:${r.classColor}">${r.wawqi.toFixed(1)}</strong></td>
      <td><span style="color:${r.classColor}; font-weight:700;">${r.classification}</span></td>
      <td><span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--emerald);">${battStr}</span></td>
      <td style="font-family:var(--font-mono); font-size:0.75rem;">${r.rssi ? r.rssi + ' dBm / ' + r.snr + ' dB' : 'SIMULATED'}</td>
      <td style="text-align: center;">
        <button class="btn-delete-packet" data-id="${r.id}" data-seq="${r.seq}" title="Permanently delete packet #${r.seq}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </td>
    `;
    elements.telemetryFeedBody.appendChild(tr);
  });
}

// ==========================================
// 4. CHART.JS CONFIGURATION
// ==========================================
function initCharts() {
  // Trend Chart
  const trendCtx = document.getElementById('trendChart').getContext('2d');
  trendChartInstance = new Chart(trendCtx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#3f5f85', font: { family: 'Plus Jakarta Sans', size: 11 } }
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.97)',
          titleColor: '#0a2540',
          bodyColor: '#3f5f85',
          borderColor: 'rgba(14, 90, 170, 0.25)',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'Plus Jakarta Sans', weight: '700' }
        }
      },
      scales: {
        x: {
          ticks: { color: '#6584a8', font: { family: 'JetBrains Mono', size: 9 } },
          grid: { color: 'rgba(14, 90, 170, 0.08)' }
        },
        y: {
          ticks: { color: '#6584a8', font: { family: 'JetBrains Mono', size: 9 } },
          grid: { color: 'rgba(14, 90, 170, 0.08)' }
        }
      }
    }
  });

  // Breakdown Donut Chart
  const donutCtx = document.getElementById('breakdownChart').getContext('2d');
  breakdownChartInstance = new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels: ['Turbidity', 'pH', 'Temperature', 'TDS'],
      datasets: [{
        data: [25, 25, 25, 25],
        backgroundColor: ['#f59e0b', '#10b981', '#ef4444', '#06b6d4'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '76%',
      plugins: { legend: { display: false } }
    }
  });
}

function updateTrendChart() {
  if (!trendChartInstance) return;

  let filtered = state.historyData;
  if (state.feedFilter === 'real') {
    filtered = filtered.filter(r => !r.is_simulated);
  } else if (state.feedFilter === 'simulated') {
    filtered = filtered.filter(r => Boolean(r.is_simulated));
  }
  filtered = filtered.slice(0, 20).reverse();

  const labels = filtered.map(r => new Date(r.timestamp).toLocaleTimeString());

  if (state.activeMetric === "wawqi") {
    trendChartInstance.data = {
      labels,
      datasets: [{
        label: 'WAWQI Aggregate Score',
        data: filtered.map(r => r.wawqi),
        borderColor: '#0284c7',
        backgroundColor: 'rgba(14, 165, 233, 0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    };
  } else {
    trendChartInstance.data = {
      labels,
      datasets: [
        {
          label: 'pH',
          data: filtered.map(r => r.ph),
          borderColor: '#10b981',
          tension: 0.3,
          pointRadius: 2
        },
        {
          label: 'Temperature (°C)',
          data: filtered.map(r => r.temp),
          borderColor: '#ef4444',
          tension: 0.3,
          pointRadius: 2
        },
        {
          label: 'Turbidity (NTU)',
          data: filtered.map(r => r.turbidity),
          borderColor: '#f59e0b',
          tension: 0.3,
          pointRadius: 2
        },
        {
          label: 'TDS (ppm / 10)',
          data: filtered.map(r => (r.tds / 10).toFixed(1)),
          borderColor: '#06b6d4',
          tension: 0.3,
          pointRadius: 2
        }
      ]
    };
  }
  trendChartInstance.update();
}

function updateBreakdownChart() {
  if (!breakdownChartInstance) return;
  const record = getActiveRecord();
  
  if (!record || !record.contributionPercentages) {
    breakdownChartInstance.data.datasets[0].data = [0, 0, 0, 0];
    breakdownChartInstance.update();
    elements.breakdownLegend.innerHTML = `
      <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.82rem; line-height: 1.5;">
        Awaiting telemetry transmission to compute mathematical parameter weights ($Q_i \\times W_i$).
      </div>
    `;
    return;
  }

  const pcts = record.contributionPercentages;
  const data = [pcts.turbidity, pcts.pH, pcts.temperature, pcts.tds];
  breakdownChartInstance.data.datasets[0].data = data;
  breakdownChartInstance.update();

  // Minimal text-based breakdown list (No icons)
  elements.breakdownLegend.innerHTML = `
    <div class="breakdown-row">
      <div class="breakdown-left">
        <span class="breakdown-indicator" style="background-color: #f59e0b;"></span>
        <span class="breakdown-name">Turbidity Sub-Index</span>
      </div>
      <span class="breakdown-pct" style="color: #f59e0b;">${pcts.turbidity}%</span>
    </div>
    <div class="breakdown-row">
      <div class="breakdown-left">
        <span class="breakdown-indicator" style="background-color: #10b981;"></span>
        <span class="breakdown-name">pH Deviation Sub-Index</span>
      </div>
      <span class="breakdown-pct" style="color: #10b981;">${pcts.pH}%</span>
    </div>
    <div class="breakdown-row">
      <div class="breakdown-left">
        <span class="breakdown-indicator" style="background-color: #ef4444;"></span>
        <span class="breakdown-name">Temperature Sub-Index</span>
      </div>
      <span class="breakdown-pct" style="color: #ef4444;">${pcts.temperature}%</span>
    </div>
    <div class="breakdown-row">
      <div class="breakdown-left">
        <span class="breakdown-indicator" style="background-color: #06b6d4;"></span>
        <span class="breakdown-name">TDS Sub-Index</span>
      </div>
      <span class="breakdown-pct" style="color: #06b6d4;">${pcts.tds}%</span>
    </div>
  `;
}
