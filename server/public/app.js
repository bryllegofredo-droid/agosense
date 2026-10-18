/**
 * =====================================================================================
 * Agosense Frontend Controller (Vanilla JavaScript)
 * Minimalist, Icon-free, High-Performance Telemetry & WAWQI Visualizer
 * =====================================================================================
 */

// Application State
const state = {
  currentSite: "ALL",
  activeMetric: "wawqi",
  latestData: {},
  historyData: [],
  stats: {},
  pollInterval: null
};

// DOM Elements
const elements = {
  siteTabs: document.querySelectorAll('.site-pill-btn'),
  btnSimulate: document.getElementById('btnSimulate'),
  btnExportCSV: document.getElementById('btnExportCSV'),
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
  sitesTableBody: document.getElementById('sitesTableBody'),
  telemetryFeedBody: document.getElementById('telemetryFeedBody'),
  feedCounter: document.getElementById('feedCounter'),
  breakdownLegend: document.getElementById('breakdownLegend')
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
  // Station Tabs
  elements.siteTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.siteTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      state.currentSite = tab.getAttribute('data-site');
      renderDashboard();
    });
  });

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
      const siteToSimulate = state.currentSite === "ALL" ? null : state.currentSite;
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: siteToSimulate })
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

  // Export CSV
  elements.btnExportCSV.addEventListener('click', () => {
    const siteParam = state.currentSite === "ALL" ? "" : `?site=${state.currentSite}`;
    window.location.href = `/api/export/csv${siteParam}`;
  });
}

// ==========================================
// 2. DATA FETCHING
// ==========================================
async function fetchDashboardData() {
  try {
    const [latestRes, historyRes, statsRes] = await Promise.all([
      fetch('/api/latest'),
      fetch('/api/history?limit=50'),
      fetch('/api/stats')
    ]);

    state.latestData = await latestRes.json();
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
  renderSummaryStats();
  renderHeroCard();
  renderSensorCards();
  renderTransectTable();
  renderFeedTable();
  updateTrendChart();
  updateBreakdownChart();
}

function getActiveRecord() {
  if (state.currentSite !== "ALL") {
    return state.latestData[state.currentSite] || null;
  }
  return state.historyData[0] || null;
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
    elements.lastUpdatedLabel.textContent = `LAST INGEST: ${timeStr} • STATION: ${activeRec.site}`;
  } else {
    elements.lastUpdatedLabel.textContent = `Awaiting incoming telemetry packets...`;
  }
}

function renderHeroCard() {
  const record = getActiveRecord();

  if (!record) {
    elements.heroWawqiScore.textContent = "--";
    elements.wawqiClassBadge.textContent = "OFFLINE";
    elements.wawqiClassBadge.style.color = "var(--text-muted)";
    elements.wawqiClassBadge.style.borderColor = "var(--border-subtle)";
    elements.wawqiClassBadge.style.background = "transparent";
    elements.scaleIndicatorBar.style.width = "0%";
    elements.wawqiDesc.textContent = "No telemetry received. Use 'Simulate Ingest' or power on the river node.";
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
  if (!record) return;

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

function renderTransectTable() {
  const sites = ["UPSTREAM", "MIDSTREAM", "DOWNSTREAM"];
  elements.sitesTableBody.innerHTML = "";

  sites.forEach(siteKey => {
    const r = state.latestData[siteKey];
    const tr = document.createElement('tr');
    
    if (r) {
      const timeStr = new Date(r.timestamp).toLocaleTimeString();
      const badgeClass = `station-pill station-${siteKey.toLowerCase()}`;
      tr.innerHTML = `
        <td><span class="${badgeClass}">${siteKey}</span></td>
        <td>NODE #${r.node_id}</td>
        <td>${timeStr}</td>
        <td><strong>${r.ph.toFixed(2)}</strong></td>
        <td><strong>${r.temp.toFixed(1)}°C</strong></td>
        <td><strong>${r.turbidity.toFixed(1)} NTU</strong></td>
        <td><strong>${r.tds.toFixed(0)} ppm</strong></td>
        <td><strong style="color:${r.classColor}">${r.wawqi.toFixed(1)}</strong></td>
        <td><span style="color:${r.classColor}; font-weight:700;">${r.classification}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:0.75rem;">${r.rssi ? r.rssi + ' dBm (' + (r.pdr !== undefined ? r.pdr + '% PDR' : r.snr + ' dB') + ')' : 'Simulated'}</span></td>
      `;
    } else {
      tr.innerHTML = `
        <td><span class="station-pill">${siteKey}</span></td>
        <td>--</td>
        <td>OFFLINE</td>
        <td>--</td>
        <td>--</td>
        <td>--</td>
        <td>--</td>
        <td>--</td>
        <td><span style="color:var(--text-muted)">AWAITING NODE</span></td>
        <td>--</td>
      `;
    }
    elements.sitesTableBody.appendChild(tr);
  });
}

function renderFeedTable() {
  const filteredRecords = state.currentSite === "ALL" 
    ? state.historyData 
    : state.historyData.filter(r => r.site === state.currentSite);

  elements.feedCounter.textContent = `${filteredRecords.length} packets logged`;
  elements.telemetryFeedBody.innerHTML = "";

  filteredRecords.slice(0, 15).forEach(r => {
    const tr = document.createElement('tr');
    const timeStr = new Date(r.timestamp).toLocaleTimeString();
    tr.innerHTML = `
      <td style="font-family:var(--font-mono); font-size:0.75rem;">${timeStr}</td>
      <td><span class="station-pill station-${r.site.toLowerCase()}">${r.site}</span></td>
      <td>#${r.seq}</td>
      <td>${r.ph.toFixed(2)}</td>
      <td>${r.temp.toFixed(1)}</td>
      <td>${r.turbidity.toFixed(1)}</td>
      <td>${r.tds.toFixed(0)}</td>
      <td><strong style="color:${r.classColor}">${r.wawqi.toFixed(1)}</strong></td>
      <td><span style="color:${r.classColor}; font-weight:700;">${r.classification}</span></td>
      <td style="font-family:var(--font-mono); font-size:0.75rem;">${r.rssi ? r.rssi + ' dBm / ' + r.snr + ' dB (' + (r.pdr || 100) + '% PDR)' : 'SIMULATED'}</td>
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
          labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } }
        },
        tooltip: {
          backgroundColor: 'rgba(8, 12, 22, 0.95)',
          titleColor: '#ffffff',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'Plus Jakarta Sans', weight: '700' }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 9 } },
          grid: { color: 'rgba(255, 255, 255, 0.03)' }
        },
        y: {
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 9 } },
          grid: { color: 'rgba(255, 255, 255, 0.03)' }
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
        borderColor: '#0a0e17'
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

  const filtered = state.currentSite === "ALL"
    ? state.historyData.slice(0, 20).reverse()
    : state.historyData.filter(r => r.site === state.currentSite).slice(0, 20).reverse();

  const labels = filtered.map(r => new Date(r.timestamp).toLocaleTimeString());

  if (state.activeMetric === "wawqi") {
    trendChartInstance.data = {
      labels,
      datasets: [{
        label: 'WAWQI Aggregate Score',
        data: filtered.map(r => r.wawqi),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
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
    breakdownChartInstance.data.datasets[0].data = [25, 25, 25, 25];
    breakdownChartInstance.update();
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
